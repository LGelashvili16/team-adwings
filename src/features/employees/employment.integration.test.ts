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
import type * as Service from './server/employment.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_employment_test_${randomBytes(8).toString('hex')}`
let admin: pg.Client | undefined
let connection: pg.Client | undefined
let applicationDatabase: typeof Database | undefined
let service: typeof Service
let created = false
let workerId: string
const actor: Actor = {
  id: 'employment-admin',
  name: 'ტესტი',
  email: null,
  emailVerified: false,
  roles: ['admin'],
}
const input = (extra = {}) => ({
  userId: 'employment-worker',
  expectedRevision: 0,
  periodId: null,
  startDate: '2026-01-15',
  endDate: '2026-01-31',
  reason: 'დადასტურებულია ხელშეკრულებით',
  ...extra,
})
function sql() {
  if (!connection) throw new Error('Isolated test database required')
  return connection
}
function db() {
  if (!applicationDatabase) throw new Error('Application database required')
  return applicationDatabase
}
const read = (extra = {}) =>
  service.readEmployeeEmployment(actor, {
    userId: 'employment-worker',
    ...extra,
  })
const eligibility = (startDate: string, endDate = startDate) =>
  db().transaction((tx) =>
    service.readEmploymentEligibility(tx, {
      employeeId: workerId,
      startDate,
      endDate,
    }),
  )

describe.runIf(process.env.RUN_EMPLOYMENT_DB_TESTS === '1')(
  'confirmed employment periods against PostgreSQL',
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
      const migrations = readdirSync('drizzle')
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort()
      for (const file of migrations.filter((name) => name < '0056'))
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
      for (const role of [
        'admin',
        'hr_manager',
        'accountant',
        'worker',
        'other',
      ]) {
        const id = `employment-${role}`
        await sql().query(
          `insert into "user" (id,name,email,roles,access_state) values ($1,$1,$2,$3,'active')`,
          [
            id,
            `${id}@employment.invalid`,
            ['worker', 'other'].includes(role) ? 'employee' : role,
          ],
        )
        const person = await sql().query(
          'insert into employee (user_id,full_name) values ($1,$1) returning id',
          [id],
        )
        if (role === 'worker') workerId = person.rows[0].id
      }
      for (const file of migrations.filter((name) => name >= '0056'))
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
      process.env.DATABASE_URL = target.toString()
      vi.resetModules()
      applicationDatabase = (await import('#/db')).db
      service = await import('./server/employment.service.server')
    }, 30000)
    beforeEach(async () => {
      await sql().query(
        'truncate employee_employment_audit, employee_employment_period',
      )
      await sql().query(
        "update employee set employment_revision=0,status='active'",
      )
      await sql().query(
        `update "user" set access_state='active',permission_overrides='{"allow":[],"deny":[]}',roles=case when id='employment-admin' then 'admin' when id='employment-hr_manager' then 'hr_manager' when id='employment-accountant' then 'accountant' else 'employee' end`,
      )
    })
    afterAll(async () => {
      await applicationDatabase?.$client.end()
      await connection?.end()
      process.env.DATABASE_URL = originalUrl
      if (admin) {
        if (created)
          await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
        await admin.end()
      }
    })

    it('leaves legacy dates unknown without inferring account or activation dates', async () => {
      expect(await read()).toMatchObject({
        confirmed: false,
        revision: 0,
        periodTotal: 0,
        historyTotal: 0,
      })
      expect(await eligibility('2026-01-01')).toEqual({
        status: 'unknown',
        revision: 0,
        periods: [],
      })
    })
    it('retains inclusive partial months and rehires, with no login or employee-status mutation', async () => {
      await service.saveEmployeeEmployment(actor, input())
      await service.saveEmployeeEmployment(
        actor,
        input({ startDate: '2026-02-10', endDate: null, expectedRevision: 1 }),
      )
      expect((await eligibility('2026-01-31')).periods).toHaveLength(1)
      expect((await eligibility('2026-02-01')).periods).toHaveLength(0)
      expect((await eligibility('2026-02-10')).periods).toHaveLength(1)
      const view = await read()
      expect(view).toMatchObject({
        confirmed: true,
        revision: 2,
        periodTotal: 2,
        historyTotal: 2,
      })
      expect(view.history[0]).toMatchObject({
        actorName: actor.id,
        before: null,
        after: { startDate: '2026-02-10', endDate: null, voided: false },
      })
      expect(
        (
          await sql().query(
            `select u.access_state,e.status from "user" u join employee e on e.user_id=u.id where u.id='employment-worker'`,
          )
        ).rows[0],
      ).toEqual({ access_state: 'active', status: 'active' })
    })
    it('rejects shared endpoints, enclosed ranges and a second ongoing period', async () => {
      await service.saveEmployeeEmployment(actor, input())
      for (const dates of [
        { startDate: '2026-01-31', endDate: '2026-02-05' },
        { startDate: '2026-01-01', endDate: null },
        { startDate: '2026-01-16', endDate: '2026-01-17' },
      ])
        await expect(
          service.saveEmployeeEmployment(
            actor,
            input({ ...dates, expectedRevision: 1 }),
          ),
        ).rejects.toBeInstanceOf(service.EmploymentError)
      await service.saveEmployeeEmployment(
        actor,
        input({ startDate: '2026-02-01', endDate: null, expectedRevision: 1 }),
      )
      await expect(
        service.saveEmployeeEmployment(
          actor,
          input({
            startDate: '2027-01-01',
            endDate: null,
            expectedRevision: 2,
          }),
        ),
      ).rejects.toBeInstanceOf(service.EmploymentError)
      expect((await read()).historyTotal).toBe(2)
    })
    it('retains exact before/after correction and void history while excluding voided periods', async () => {
      await service.saveEmployeeEmployment(actor, input())
      const periodId = (await read()).periods[0].id
      await service.saveEmployeeEmployment(
        actor,
        input({ periodId, startDate: '2026-01-20', expectedRevision: 1 }),
      )
      expect((await read()).history[0]).toMatchObject({
        action: 'updated',
        before: { startDate: '2026-01-15' },
        after: { startDate: '2026-01-20' },
      })
      await service.voidEmployeeEmployment(actor, {
        userId: 'employment-worker',
        periodId,
        expectedRevision: 2,
        reason: 'შეცდომით დადასტურებული პერიოდი',
      })
      expect(await read()).toMatchObject({
        confirmed: false,
        periodTotal: 0,
        historyTotal: 3,
        revision: 3,
      })
      expect((await read()).history[0]).toMatchObject({
        action: 'voided',
        before: { voided: false },
        after: { voided: true },
      })
      expect((await eligibility('2026-01-20')).status).toBe('unknown')
      await expect(
        service.saveEmployeeEmployment(
          actor,
          input({ periodId, expectedRevision: 3 }),
        ),
      ).rejects.toBeInstanceOf(service.EmploymentError)
    })
    it('uses current grants, denies self edits and keeps accountants outside HR records', async () => {
      await expect(
        service.saveEmployeeEmployment(null, input()),
      ).rejects.toThrow()
      for (const id of ['employment-accountant', 'employment-worker'])
        await expect(
          service.saveEmployeeEmployment({ ...actor, id }, input()),
        ).rejects.toThrow()
      await expect(
        service.saveEmployeeEmployment(actor, input({ userId: actor.id })),
      ).rejects.toThrow()
      await service.saveEmployeeEmployment(
        { ...actor, id: 'employment-hr_manager', roles: ['employee'] },
        input(),
      )
      await sql().query(
        `update "user" set permission_overrides='{"allow":[],"deny":["employees.employment.manage"]}' where id=$1`,
        [actor.id],
      )
      await expect(
        service.saveEmployeeEmployment(actor, input({ expectedRevision: 1 })),
      ).rejects.toThrow()
      expect((await read()).periodTotal).toBe(1)
      await sql().query(
        `update "user" set access_state='suspended' where id=$1`,
        [actor.id],
      )
      await expect(read()).rejects.toThrow()
      await sql().query(`update "user" set access_state='active' where id=$1`, [
        actor.id,
      ])
      await sql().query(
        `update employee set status='inactive' where user_id=$1`,
        [actor.id],
      )
      await expect(read()).rejects.toThrow()
    })
    it('scopes period identifiers to the employee and permits historical correction for suspended targets', async () => {
      await service.saveEmployeeEmployment(
        actor,
        input({ userId: 'employment-other' }),
      )
      const foreign = await read({ userId: 'employment-other' })
      await expect(
        service.saveEmployeeEmployment(
          actor,
          input({ periodId: foreign.periods[0].id }),
        ),
      ).rejects.toBeInstanceOf(service.EmploymentError)
      await sql().query(
        `update "user" set access_state='suspended' where id='employment-worker'`,
      )
      await sql().query(
        `update employee set status='inactive' where user_id='employment-worker'`,
      )
      await service.saveEmployeeEmployment(actor, input())
      expect((await read()).historyTotal).toBe(1)
    })
    it('serializes concurrent writes and rejects stale revisions without losing history', async () => {
      const results = await Promise.allSettled([
        service.saveEmployeeEmployment(actor, input()),
        service.saveEmployeeEmployment(
          actor,
          input({ startDate: '2026-02-01', endDate: null }),
        ),
      ])
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(await read()).toMatchObject({
        revision: 1,
        periodTotal: 1,
        historyTotal: 1,
      })
      await expect(
        service.saveEmployeeEmployment(actor, input()),
      ).rejects.toBeInstanceOf(service.EmploymentError)
    })
    it('rolls back dates and revision when audit persistence fails', async () => {
      await sql().query(
        `create function employment_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$; create trigger employment_audit_failure before insert on employee_employment_audit for each row execute function employment_audit_failure()`,
      )
      try {
        await expect(
          service.saveEmployeeEmployment(actor, input()),
        ).rejects.toThrow()
      } finally {
        await sql().query(
          'drop trigger employment_audit_failure on employee_employment_audit; drop function employment_audit_failure()',
        )
      }
      expect(await read()).toMatchObject({
        revision: 0,
        periodTotal: 0,
        historyTotal: 0,
      })
    })
    it('paginates periods and audit events independently without leaking another employee', async () => {
      for (let day = 1; day <= 7; day++) {
        const date = `2026-01-${String(day).padStart(2, '0')}`
        await service.saveEmployeeEmployment(
          actor,
          input({ startDate: date, endDate: date, expectedRevision: day - 1 }),
        )
      }
      await service.saveEmployeeEmployment(
        actor,
        input({ userId: 'employment-other' }),
      )
      expect((await read()).periods).toHaveLength(5)
      const second = await read({ employmentPage: 2, employmentHistoryPage: 2 })
      expect(second.periods).toHaveLength(2)
      expect(second.history).toHaveLength(2)
      expect(second).toMatchObject({ periodTotal: 7, historyTotal: 7 })
    })
  },
)
