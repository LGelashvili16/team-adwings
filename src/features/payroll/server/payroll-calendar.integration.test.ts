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
import type * as Service from './payroll-calendar.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_calendar_test_${randomBytes(8).toString('hex')}`
let admin: pg.Client | undefined,
  connection: pg.Client | undefined,
  applicationDatabase: typeof Database | undefined,
  service: typeof Service,
  created = false
let workerId: string
const actor: Actor = {
  id: 'calendar-accountant',
  name: 'ბუღალტერი',
  email: null,
  emailVerified: false,
  roles: ['accountant'],
}
const input = (extra = {}) => ({
  userId: null,
  date: '2026-11-24',
  kind: 'day_off',
  hours: null,
  expectedRevision: 0,
  reason: 'დადასტურებული კალენდრის ცვლილება',
  ...extra,
})
function sql() {
  if (!connection) throw new Error('Isolated local database required')
  return connection
}
function db() {
  if (!applicationDatabase) throw new Error('Application database required')
  return applicationDatabase
}
const read = (extra = {}) =>
  service.readPayrollCalendar(actor, { month: '2026-11', ...extra })
const day = async (date: string, extra = {}) =>
  (await read({ month: date.slice(0, 7), ...extra })).days.find(
    (row) => row.date === date,
  )!
const internal = (startDate: string, endDate = startDate) =>
  db().transaction((tx) =>
    service.getPayrollCalendar(tx, {
      employeeId: workerId,
      startDate,
      endDate,
    }),
  )
describe.runIf(process.env.RUN_CALENDAR_DB_TESTS === '1')(
  'payroll calendar against PostgreSQL',
  () => {
    beforeAll(async () => {
      if (!originalUrl) throw new Error('Local database required')
      const target = new URL(originalUrl)
      if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
        throw new Error('Local database required')
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
      for (const file of readdirSync('drizzle')
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort())
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
      for (const role of [
        'accountant',
        'admin',
        'hr_manager',
        'worker',
        'other',
      ]) {
        const id = `calendar-${role}`
        await sql().query(
          `insert into "user" (id,name,email,roles,access_state) values ($1,$1,$2,$3,'active')`,
          [
            id,
            `${id}@calendar.invalid`,
            ['worker', 'other'].includes(role) ? 'employee' : role,
          ],
        )
        const result = await sql().query(
          'insert into employee (user_id,full_name,username) values ($1,$1,$1) returning id',
          [id],
        )
        if (role === 'worker') workerId = result.rows[0].id
      }
      await sql().query(
        `insert into company_schedule (effective_from,timezone,late_grace_minutes,early_departure_grace_minutes) values ('2026-01-01','Asia/Tbilisi',0,0)`,
      )
      await sql().query(
        `insert into company_schedule_day (effective_from,weekday,start_time,end_time) select '2026-01-01',day,case when day<6 then '10:00'::time end,case when day<6 then '19:00'::time end from generate_series(1,7) day`,
      )
      await sql().query(
        `insert into employee_schedule_version (employee_id,version,effective_from,days,actor_id,source) select id,1,'2026-01-01',null,'calendar-admin','provisioned' from employee`,
      )
      process.env.DATABASE_URL = target.toString()
      vi.resetModules()
      applicationDatabase = (await import('#/db')).db
      service = await import('./payroll-calendar.service.server')
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-25T12:00:00+04:00'))
    }, 30000)
    beforeEach(async () => {
      await sql().query(
        'truncate payroll_calendar_exception, leave_request, leave_audit, attendance_session, attendance_audit cascade',
      )
      await sql().query("update employee set status='active'")
      await sql().query(
        `update "user" set access_state='active',permission_overrides='{"allow":[],"deny":[]}',roles=case when id='calendar-admin' then 'admin' when id='calendar-accountant' then 'accountant' when id='calendar-hr_manager' then 'hr_manager' else 'employee' end`,
      )
    })
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
    it('reuses statutory holidays and keeps the company reference free of invented employee versions', async () => {
      expect(await day('2026-11-23')).toMatchObject({
        statutoryHoliday: true,
        kind: 'day_off',
        source: 'holiday',
        employeeVersion: null,
      })
      expect(await day('2026-11-24')).toMatchObject({
        kind: 'scheduled',
        hours: { start: '10:00', end: '19:00' },
      })
      expect(await read()).toMatchObject({
        revision: 0,
        historyTotal: 0,
        month: '2026-11',
      })
    })
    it('resolves employee overrides before company overrides and restores inherited rules without deleting history', async () => {
      await service.saveCalendarException(actor, input())
      expect(
        await day('2026-11-24', { userId: 'calendar-worker' }),
      ).toMatchObject({ source: 'company_exception', kind: 'day_off' })
      await service.saveCalendarException(
        actor,
        input({
          userId: 'calendar-worker',
          kind: 'working',
          hours: { start: '08:00', end: '16:00' },
          expectedRevision: 1,
        }),
      )
      expect((await internal('2026-11-24')).days[0]).toMatchObject({
        kind: 'scheduled',
        source: 'employee_exception',
        hours: { start: '08:00', end: '16:00' },
      })
      expect(
        await day('2026-11-24', { userId: 'calendar-other' }),
      ).toMatchObject({ kind: 'day_off' })
      await service.saveCalendarException(
        actor,
        input({
          userId: 'calendar-worker',
          kind: 'inherit',
          expectedRevision: 2,
        }),
      )
      expect(
        await day('2026-11-24', { userId: 'calendar-worker' }),
      ).toMatchObject({ kind: 'day_off', source: 'company_exception' })
      await service.saveCalendarException(
        actor,
        input({ kind: 'inherit', expectedRevision: 3 }),
      )
      expect(
        await day('2026-11-24', { userId: 'calendar-worker' }),
      ).toMatchObject({ kind: 'scheduled', source: 'company' })
      const history = await read()
      expect(history).toMatchObject({
        revision: 4,
        historyTotal: 2,
        history: [
          { revision: 4, previousRevision: 1, actorName: actor.id },
          { revision: 1, previousRevision: null },
        ],
      })
      expect((await read({ userId: 'calendar-worker' })).historyTotal).toBe(2)
    })
    it('preserves statutory holiday work for pay review, even when a weekend becomes a working date', async () => {
      await service.saveCalendarException(
        actor,
        input({
          date: '2026-05-17',
          kind: 'working',
          hours: { start: '09:00', end: '17:00' },
        }),
      )
      expect((await internal('2026-05-17')).days[0]).toMatchObject({
        date: '2026-05-17',
        kind: 'scheduled',
        source: 'company_exception',
        statutoryHoliday: true,
        holidayWorkReview: true,
      })
    })
    it('keeps unknown employee history and incomplete company configuration unresolved', async () => {
      await service.saveCalendarException(
        actor,
        input({
          date: '2025-11-24',
          kind: 'working',
          hours: { start: '09:00', end: '17:00' },
        }),
      )
      expect((await internal('2025-11-24')).days[0]).toMatchObject({
        kind: 'unknown_history',
        hours: null,
      })
      await sql().query('delete from company_schedule_day where weekday=3')
      try {
        await service.saveCalendarException(
          actor,
          input({
            date: '2026-11-25',
            kind: 'working',
            hours: { start: '09:00', end: '17:00' },
            expectedRevision: 1,
          }),
        )
        expect((await internal('2026-11-25')).days[0]).toMatchObject({
          kind: 'unconfigured',
          hours: null,
        })
      } finally {
        await sql().query(
          "insert into company_schedule_day (effective_from,weekday,start_time,end_time) values ('2026-01-01',3,'10:00','19:00')",
        )
      }
    })
    it('keeps pending/approved leave separate, excludes cancelled requests and changes no allowance or attendance records', async () => {
      await sql().query(
        `insert into leave_request (requester_id,kind,start_date,end_date,note) values ('calendar-worker','vacation','2026-11-24','2026-11-25','საიდუმლო შენიშვნა')`,
      )
      await sql().query(
        `insert into leave_request (requester_id,kind,start_date,end_date,status,reviewer_id,reviewed_at) values ('calendar-worker','sick_leave','2026-11-26',null,'approved','calendar-admin',now())`,
      )
      await sql().query(
        `insert into leave_request (requester_id,kind,start_date,end_date,status) values ('calendar-worker','day_off','2026-11-27','2026-11-27','cancelled')`,
      )
      const result = await internal('2026-11-24', '2026-11-30')
      expect(result.days[0]).toMatchObject({
        kind: 'scheduled',
        leaveReview: true,
        leaves: [{ kind: 'vacation', status: 'pending' }],
      })
      expect(result.days[2]).toMatchObject({
        kind: 'scheduled',
        leaveReview: false,
        leaves: [{ kind: 'sick_leave', status: 'approved' }],
      })
      expect(result.days[3].leaves).toHaveLength(1)
      expect(result.days[6].leaves[0].kind).toBe('sick_leave')
      expect(JSON.stringify(result)).not.toContain('საიდუმლო შენიშვნა')
      expect(
        (
          await sql().query(
            'select count(*)::int as count from attendance_session',
          )
        ).rows[0].count,
      ).toBe(0)
      expect(
        (
          await sql().query(
            'select sum(charged_vacation_days)::int as count from leave_request',
          )
        ).rows[0].count,
      ).toBe(0)
    })
    it('retains overnight attendance ownership and original expectations when the next date changes', async () => {
      await sql().query(
        `insert into attendance_session (employee_id,request_id,work_date,timezone,schedule_effective_from,expected_start_at,expected_end_at,started_at,ended_at) values ($1,uuidv7(),'2026-11-22','Asia/Tbilisi','2026-01-01','2026-11-22T00:00:00+04:00','2026-11-22T00:00:00+04:00','2026-11-22T23:00:00+04:00','2026-11-23T02:00:00+04:00')`,
        [workerId],
      )
      const before = (
        await sql().query(
          'select work_date::text,expected_start_at,expected_end_at,started_at,ended_at,revision from attendance_session',
        )
      ).rows[0]
      await service.saveCalendarException(
        actor,
        input({
          date: '2026-11-23',
          kind: 'working',
          hours: { start: '10:00', end: '19:00' },
        }),
      )
      expect(
        (await internal('2026-11-22', '2026-11-23')).days.map(
          (row) => row.date,
        ),
      ).toEqual(['2026-11-22', '2026-11-23'])
      expect(
        (
          await sql().query(
            'select work_date::text,expected_start_at,expected_end_at,started_at,ended_at,revision from attendance_session',
          )
        ).rows[0],
      ).toEqual(before)
    })
    it('rechecks current authorization, requires salary read scope for employee data and forbids self exceptions', async () => {
      await expect(
        service.saveCalendarException(null, input()),
      ).rejects.toThrow()
      await expect(
        service.saveCalendarException(
          { ...actor, id: 'calendar-hr_manager' },
          input(),
        ),
      ).rejects.toThrow()
      await expect(
        service.saveCalendarException(actor, input({ userId: actor.id })),
      ).rejects.toThrow()
      await sql().query(
        `update "user" set permission_overrides='{"allow":[],"deny":["payroll.read.all"]}' where id=$1`,
        [actor.id],
      )
      await expect(read({ userId: 'calendar-worker' })).rejects.toThrow()
      await expect(service.readCalendarPeople(actor, {})).rejects.toThrow()
      expect((await read()).person).toBeNull()
      await sql().query(
        `update "user" set access_state='suspended' where id=$1`,
        [actor.id],
      )
      await expect(read()).rejects.toThrow()
    })
    it('serializes first writes and rejects stale revisions atomically', async () => {
      const outcomes = await Promise.allSettled([
        service.saveCalendarException(actor, input()),
        service.saveCalendarException(actor, input({ date: '2026-11-25' })),
      ])
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(await read()).toMatchObject({ revision: 1, historyTotal: 1 })
    })
    it('rolls back revision and decision if retaining the audit row fails', async () => {
      await sql().query(
        `create function fail_calendar_test() returns trigger language plpgsql as $$ begin raise exception 'test'; end $$; create trigger fail_calendar_test before insert on payroll_calendar_exception for each row execute function fail_calendar_test()`,
      )
      try {
        await expect(
          service.saveCalendarException(actor, input()),
        ).rejects.toThrow()
      } finally {
        await sql().query(
          'drop trigger fail_calendar_test on payroll_calendar_exception; drop function fail_calendar_test()',
        )
      }
      expect(await read()).toMatchObject({ revision: 0, historyTotal: 0 })
    })
    it('paginates scope/month history, validates people search and rejects meaningless restoration', async () => {
      await expect(
        service.saveCalendarException(actor, input({ kind: 'inherit' })),
      ).rejects.toThrow()
      for (let version = 0; version < 12; version++)
        await service.saveCalendarException(
          actor,
          input({ expectedRevision: version }),
        )
      expect((await read()).history).toHaveLength(10)
      expect((await read({ historyPage: 2 })).history).toHaveLength(2)
      expect((await read({ historyQ: 'არარსებული მიზეზი' })).historyTotal).toBe(
        0,
      )
      expect((await read({ historyQ: 'დადასტურებული' })).historyTotal).toBe(12)
      expect((await read({ userId: 'calendar-worker' })).historyTotal).toBe(0)
      expect(
        (await service.readCalendarPeople(actor, { q: 'calendar-worker' }))
          .total,
      ).toBe(1)
      expect((await service.readCalendarPeople(actor, { q: '%' })).total).toBe(
        0,
      )
    })
  },
)
