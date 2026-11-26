// @vitest-environment node
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type * as ScheduleService from './server/scheduling.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'
import type { WorkingWeek } from './scheduling.types'
import { followingDate } from './scheduling.rules'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const enabled = process.env.RUN_SCHEDULE_DB_TESTS === '1'
const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_schedule_history_test_${randomBytes(8).toString('hex')}`
let admin: pg.Client | undefined
let connection: pg.Client | undefined
let applicationDatabase: typeof Database | undefined
let service: typeof ScheduleService
let created = false
let today: string
let legacyId: string
const administrator: Actor = {
  id: 'history-admin',
  name: 'ტესტის ადმინისტრატორი',
  email: null,
  emailVerified: false,
  roles: ['admin'],
}
const week: WorkingWeek = Array.from({ length: 7 }, (_, index) => ({
  weekday: index + 1,
  hours: index < 5 ? { start: '09:00', end: '18:00' } : null,
}))
function sql() {
  if (!connection) throw new Error('Isolated history database unavailable')
  return connection
}
function db() {
  if (!applicationDatabase) throw new Error('Application database unavailable')
  return applicationDatabase
}
async function createEmployee(label: string) {
  await sql().query('insert into "user" (id,name,email) values ($1,$1,$2)', [
    label,
    `${label}@history.invalid`,
  ])
  const result = await sql().query(
    'insert into employee (user_id,full_name) values ($1,$1) returning id',
    [label],
  )
  return result.rows[0].id as string
}
function dates(employeeId: string, startDate: string, endDate = startDate) {
  return db().transaction((tx) =>
    service.getHistoricalEmployeeSchedule(tx, {
      employeeId,
      startDate,
      endDate,
    }),
  )
}

describe.runIf(enabled)(
  'retained employee schedule history against PostgreSQL',
  () => {
    beforeAll(async () => {
      if (!originalUrl)
        throw new Error('Local PostgreSQL configuration required')
      const target = new URL(originalUrl)
      if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
        throw new Error('History tests require local PostgreSQL')
      admin = new pg.Client({
        connectionString: originalUrl,
        connectionTimeoutMillis: 3000,
      })
      await admin.connect()
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      created = true
      target.pathname = `/${databaseName}`
      connection = new pg.Client({ connectionString: target.toString() })
      await connection.connect()
      const migrations = readdirSync('drizzle')
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort()
      for (const file of migrations.filter((name) => name < '0055'))
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
      await sql().query(
        `insert into "user" (id,name,email,roles) values ('history-admin','ტესტის ადმინისტრატორი','admin@history.invalid','admin')`,
      )
      await sql().query(
        `insert into company_schedule (effective_from,timezone,late_grace_minutes,early_departure_grace_minutes) values ('2020-01-01','Asia/Tbilisi',0,0)`,
      )
      await sql()
        .query(`insert into company_schedule_day (effective_from,weekday,start_time,end_time)
      select '2020-01-01', day, case when day < 6 then '10:00'::time end, case when day < 6 then '19:00'::time end from generate_series(1,7) day`)
      legacyId = await createEmployee('legacy-history')
      await sql().query(
        `insert into employee_work_schedule (employee_id,days,assigned_by) values ($1,$2::jsonb,$3)`,
        [legacyId, JSON.stringify(week), administrator.id],
      )
      await createEmployee('legacy-inherited')
      for (const file of migrations.filter((name) => name >= '0055'))
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
      today = (
        await sql().query(
          `select (current_timestamp at time zone 'Asia/Tbilisi')::date::text as day`,
        )
      ).rows[0].day
      process.env.DATABASE_URL = target.toString()
      vi.resetModules()
      applicationDatabase = (await import('#/db')).db
      service = await import('./server/scheduling.service.server')
      vi.useFakeTimers({ toFake: ['Date'] })
    }, 30000)
    beforeEach(() => vi.setSystemTime(new Date(`${today}T12:00:00+04:00`)))
    afterAll(async () => {
      vi.useRealTimers()
      await applicationDatabase?.$client.end()
      await connection?.end()
      process.env.DATABASE_URL = originalUrl
      if (admin) {
        if (created)
          await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
        await admin.end()
      }
    })

    it('opens explicit migration baselines without inventing earlier history or editors', async () => {
      const result = await sql().query(
        `select effective_from::text, actor_id, source, days from employee_schedule_version order by employee_id`,
      )
      expect(result.rows).toHaveLength(2)
      expect(
        result.rows.every(
          (row) =>
            row.effective_from === today &&
            row.actor_id === null &&
            row.source === 'migration',
        ),
      ).toBe(true)
      expect(result.rows.some((row) => row.days === null)).toBe(true)
      const previous = new Date(`${today}T12:00:00Z`)
      previous.setUTCDate(previous.getUTCDate() - 1)
      expect(
        (await dates(legacyId, previous.toISOString().slice(0, 10)))[0].kind,
      ).toBe('unknown_history')
    })
    it('retains explicit inherited and individual schedules at provisioning', async () => {
      for (const [label, days] of [
        ['provision-default', null],
        ['provision-custom', week],
      ] as const) {
        const employeeId = await createEmployee(label)
        await db().transaction((tx) =>
          service.assignInitialEmployeeWeek(
            employeeId,
            days,
            administrator.id,
            tx,
          ),
        )
        const row = (
          await sql().query(
            `select * from employee_schedule_version where employee_id=$1`,
            [employeeId],
          )
        ).rows[0]
        expect(row).toMatchObject({
          version: 1,
          source: 'provisioned',
          actor_id: administrator.id,
          days,
        })
        expect((await dates(employeeId, today))[0]).toMatchObject({
          source: days ? 'individual' : 'company',
          employeeVersion: 1,
        })
      }
    })
    it('preserves earlier individual weeks and an explicit return to company defaults', async () => {
      const employeeId = await createEmployee('history-changes')
      await db().transaction((tx) =>
        service.assignInitialEmployeeWeek(
          employeeId,
          week,
          administrator.id,
          tx,
        ),
      )
      const next = followingDate(today)
      const third = followingDate(next)
      vi.setSystemTime(new Date(`${next}T12:00:00+04:00`))
      const changed = week.map((day) => ({
        ...day,
        hours: day.hours ? { start: '11:00', end: '18:00' } : null,
      }))
      await db().transaction((tx) =>
        service.replaceEmployeeWeek(employeeId, changed, administrator.id, tx),
      )
      vi.setSystemTime(new Date(`${third}T12:00:00+04:00`))
      await db().transaction((tx) =>
        service.replaceEmployeeWeek(employeeId, null, administrator.id, tx),
      )
      const result = await dates(employeeId, today, third)
      expect(result.map((day) => [day.employeeVersion, day.source])).toEqual([
        [1, 'individual'],
        [2, 'individual'],
        [3, 'company'],
      ])
      expect(
        (
          await sql().query(
            `select days from employee_schedule_version where employee_id=$1 order by version`,
            [employeeId],
          )
        ).rows.map((row) => row.days),
      ).toEqual([week, changed, null])
    })
    it('serializes concurrent same-day writes and preserves each actual change', async () => {
      const employeeId = await createEmployee('concurrent-history')
      await db().transaction((tx) =>
        service.assignInitialEmployeeWeek(
          employeeId,
          null,
          administrator.id,
          tx,
        ),
      )
      const changed = week.map((day) => ({
        ...day,
        hours: day.hours ? { start: '11:00', end: '18:00' } : null,
      }))
      await Promise.all([
        db().transaction((tx) =>
          service.replaceEmployeeWeek(employeeId, week, administrator.id, tx),
        ),
        db().transaction((tx) =>
          service.replaceEmployeeWeek(
            employeeId,
            changed,
            administrator.id,
            tx,
          ),
        ),
      ])
      const rows = (
        await sql().query(
          `select version,days,actor_id from employee_schedule_version where employee_id=$1 order by version`,
          [employeeId],
        )
      ).rows
      expect(rows.map((row) => row.version)).toEqual([1, 2, 3])
      expect(rows.every((row) => row.actor_id === administrator.id)).toBe(true)
      const current = (
        await sql().query(
          'select days from employee_work_schedule where employee_id=$1',
          [employeeId],
        )
      ).rows[0].days
      expect(current).toEqual(rows[2].days)
      expect((await dates(employeeId, today))[0].employeeVersion).toBe(3)
      await db().transaction((tx) =>
        service.replaceEmployeeWeek(employeeId, current, administrator.id, tx),
      )
      expect(
        (
          await sql().query(
            'select count(*)::int as total from employee_schedule_version where employee_id=$1',
            [employeeId],
          )
        ).rows[0].total,
      ).toBe(3)
    })
    it('rolls back the current assignment if history cannot be retained', async () => {
      const employeeId = await createEmployee('rollback-history')
      await db().transaction((tx) =>
        service.assignInitialEmployeeWeek(
          employeeId,
          null,
          administrator.id,
          tx,
        ),
      )
      await sql()
        .query(`create function reject_history_change() returns trigger language plpgsql as $$ begin raise exception 'history unavailable'; end $$;
      create trigger reject_history_change before insert on employee_schedule_version for each row when (new.source = 'changed') execute function reject_history_change()`)
      try {
        await expect(
          db().transaction((tx) =>
            service.replaceEmployeeWeek(employeeId, week, administrator.id, tx),
          ),
        ).rejects.toThrow()
        expect(
          (
            await sql().query(
              'select * from employee_work_schedule where employee_id=$1',
              [employeeId],
            )
          ).rows,
        ).toHaveLength(0)
        expect((await dates(employeeId, today))[0].employeeVersion).toBe(1)
      } finally {
        await sql().query(
          'drop trigger reject_history_change on employee_schedule_version; drop function reject_history_change()',
        )
      }
    })
    it('resolves company inheritance through the company version effective on each date', async () => {
      const employeeId = await createEmployee('dated-company-history')
      await db().transaction((tx) =>
        service.assignInitialEmployeeWeek(
          employeeId,
          null,
          administrator.id,
          tx,
        ),
      )
      const next = followingDate(today)
      const changed: WorkingWeek = week.map((day) => ({
        ...day,
        hours: { start: '12:00', end: '20:00' },
      }))
      await service.saveScheduleVersion(administrator, {
        effectiveFrom: next,
        timezone: 'Asia/Tbilisi',
        lateGraceMinutes: 0,
        earlyDepartureGraceMinutes: 0,
        days: changed,
      })
      const result = await dates(employeeId, today, next)
      expect(result[0]).toMatchObject({
        source: 'company',
        employeeVersion: 1,
        companyEffectiveFrom: '2020-01-01',
      })
      expect(result[1]).toMatchObject({
        source: 'company',
        employeeVersion: 1,
        companyEffectiveFrom: next,
        hours: { start: '12:00', end: '20:00' },
      })
    })

    it('rechecks editor authority and rejects malformed or unbounded calendar requests', async () => {
      const employeeId = await createEmployee('denied-history')
      await sql().query(`update "user" set roles='employee' where id=$1`, [
        administrator.id,
      ])
      try {
        await expect(
          db().transaction((tx) =>
            service.replaceEmployeeWeek(employeeId, week, administrator.id, tx),
          ),
        ).rejects.toThrow()
      } finally {
        await sql().query(`update "user" set roles='admin' where id=$1`, [
          administrator.id,
        ])
      }
      await expect(dates(employeeId, '2026-02-30')).rejects.toThrow()
      await expect(
        dates(employeeId, '2026-01-01', '2028-01-01'),
      ).rejects.toThrow()
      expect((await dates(employeeId, today))[0].kind).toBe('unknown_history')
    })
  },
)
