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
import type * as Service from './salary.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_salary_test_${randomBytes(8).toString('hex')}`
let admin: pg.Client | undefined,
  connection: pg.Client | undefined,
  applicationDatabase: typeof Database | undefined,
  service: typeof Service,
  created = false
const actor: Actor = {
  id: 'salary-accountant',
  name: 'ბუღალტერი',
  email: null,
  emailVerified: false,
  roles: ['accountant'],
}
const input = (extra = {}) => ({
  targets: [{ userId: 'salary-worker', expectedVersion: 0 }],
  effectiveFrom: '2026-01-01',
  kind: 'monthly',
  amountMinor: 250050,
  currency: 'GEL',
  reason: 'დადასტურებული ხელშეკრულება',
  ...extra,
})
function sql() {
  if (!connection) throw new Error('Isolated database required')
  return connection
}
const read = (extra = {}) =>
  service.readEmployeeSalary(actor, { userId: 'salary-worker', ...extra })
describe.runIf(process.env.RUN_SALARY_DB_TESTS === '1')(
  'salary agreements against PostgreSQL',
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
        const id = `salary-${role}`
        await sql().query(
          `insert into "user" (id,name,email,roles,access_state) values ($1,$1,$2,$3,'active')`,
          [
            id,
            `${id}@salary.invalid`,
            ['worker', 'other'].includes(role) ? 'employee' : role,
          ],
        )
        await sql().query(
          `insert into employee (user_id,full_name,username) values ($1,$1,$1)`,
          [id],
        )
      }
      process.env.DATABASE_URL = target.toString()
      vi.resetModules()
      applicationDatabase = (await import('#/db')).db
      service = await import('./salary.service.server')
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-25T12:00:00+04:00'))
    }, 30000)
    beforeEach(async () => {
      await sql().query('truncate employee_salary_term')
      await sql().query("update employee set status='active'")
      await sql().query(
        `update "user" set access_state='active',permission_overrides='{"allow":[],"deny":[]}',roles=case when id='salary-admin' then 'admin' when id='salary-accountant' then 'accountant' when id='salary-hr_manager' then 'hr_manager' else 'employee' end`,
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
    it('shows missing agreements as null, never as a zero salary', async () => {
      expect((await read()).employee).toMatchObject({
        current: null,
        next: null,
        version: 0,
      })
      const directory = await service.readSalaryDirectory(actor, {})
      expect(directory).toMatchObject({
        total: 5,
        counts: { monthly: 0, hourly: 0, unconfigured: 5 },
      })
    })
    it('requires take-home amounts for new salary agreements', async () => {
      await expect(
        service.saveSalaryTerms(actor, input({ amountBasis: 'gross' })),
      ).rejects.toThrow()
      await service.saveSalaryTerms(actor, input())
      expect((await read()).employee.current?.amountBasis).toBe('net')
    })
    it('retains exact money, historical changes and trusted audit while protecting employee privacy', async () => {
      await service.saveSalaryTerms(actor, input())
      expect(await read()).toMatchObject({
        employee: {
          current: { amountMinor: 250050, kind: 'monthly', currency: 'GEL' },
          version: 1,
        },
        history: [{ audit: { actorName: actor.id, reason: input().reason } }],
      })
      const self = await service.readMySalary(
        { ...actor, id: 'salary-worker', roles: ['employee'] },
        {},
      )
      expect(self.employee.userId).toBe('salary-worker')
      expect(self.history[0].audit).toBeNull()
      expect(JSON.stringify(self)).not.toContain(input().reason)
      await expect(
        service.readMySalary(
          { ...actor, id: 'salary-worker' },
          { userId: 'salary-other' },
        ),
      ).rejects.toThrow()
    })
    it('resolves dated monthly/hourly changes and same-day corrections without overlapping rates', async () => {
      await service.saveSalaryTerms(actor, input({ reason: undefined }))
      expect((await read()).history[0].audit).toEqual({
        actorName: actor.id,
        reason: 'ხელფასის შეთანხმება შენახულია.',
      })
      await service.saveSalaryTerms(
        actor,
        input({
          targets: [{ userId: 'salary-worker', expectedVersion: 1 }],
          effectiveFrom: '2026-12-01',
          kind: 'hourly',
          amountBasis: 'net',
          amountMinor: 1525,
        }),
      )
      expect((await read()).employee).toMatchObject({
        current: { amountMinor: 250050 },
        next: { amountMinor: 1525, kind: 'hourly' },
      })
      await service.saveSalaryTerms(
        actor,
        input({
          targets: [{ userId: 'salary-worker', expectedVersion: 2 }],
          effectiveFrom: '2026-01-01',
          amountMinor: 280000,
        }),
      )
      expect((await read()).employee).toMatchObject({
        current: { version: 3, amountMinor: 280000 },
        next: { version: 2 },
      })
      vi.setSystemTime(new Date('2026-12-01T00:00:00+04:00'))
      expect((await read()).employee.current).toMatchObject({
        version: 2,
        kind: 'hourly',
        amountBasis: 'net',
      })
      vi.setSystemTime(new Date('2026-11-25T12:00:00+04:00'))
    })
    it('uses current database authorization and allows HR while rejecting unauthenticated and self-assignment', async () => {
      await expect(service.saveSalaryTerms(null, input())).rejects.toThrow()
      await expect(
        service.readSalaryDirectory({ ...actor, id: 'salary-hr_manager' }, {}),
      ).resolves.toBeDefined()
      await expect(
        service.saveSalaryTerms(
          actor,
          input({ targets: [{ userId: actor.id, expectedVersion: 0 }] }),
        ),
      ).rejects.toThrow()
      await sql().query(
        `update "user" set permission_overrides='{"allow":[],"deny":["payroll.terms.manage"]}' where id=$1`,
        [actor.id],
      )
      await expect(service.saveSalaryTerms(actor, input())).rejects.toThrow()
      expect((await read()).employee.current).toBeNull()
      await sql().query(
        `update "user" set access_state='suspended' where id=$1`,
        [actor.id],
      )
      await expect(read()).rejects.toThrow()
    })
    it('prevents employees from reading other salaries through directory and direct details', async () => {
      const worker = { ...actor, id: 'salary-worker' }
      await sql().query(
        `update "user" set permission_overrides='{"allow":["manage.access","payroll.read.all","payroll.terms.manage"],"deny":[]}' where id=$1`,
        [worker.id],
      )
      await expect(service.readSalaryDirectory(worker, {})).rejects.toThrow()
      await expect(
        service.readEmployeeSalary(worker, { userId: 'salary-other' }),
      ).rejects.toThrow()
      await expect(service.saveSalaryTerms(worker, input())).rejects.toThrow()
      expect((await service.readMySalary(worker, {})).employee.userId).toBe(
        worker.id,
      )
      await sql().query(
        `update employee set status='inactive' where user_id='salary-worker'`,
      )
      await expect(service.readMySalary(worker, {})).rejects.toThrow()
    })
    it('commits bulk terms atomically and rolls all back when one target is stale or invalid', async () => {
      const targets = [
        { userId: 'salary-worker', expectedVersion: 0 },
        { userId: 'salary-other', expectedVersion: 0 },
      ]
      await service.saveSalaryTerms(actor, input({ targets }))
      expect((await read()).employee.version).toBe(1)
      await expect(
        service.saveSalaryTerms(
          actor,
          input({
            targets: [
              { userId: 'salary-other', expectedVersion: 1 },
              { userId: 'salary-worker', expectedVersion: 0 },
            ],
          }),
        ),
      ).rejects.toThrow()
      expect((await read({ userId: 'salary-other' })).employee.version).toBe(1)
      await expect(
        service.saveSalaryTerms(
          actor,
          input({
            targets: [
              { userId: 'salary-other', expectedVersion: 1 },
              { userId: 'salary-missing', expectedVersion: 0 },
            ],
          }),
        ),
      ).rejects.toThrow()
      expect((await read({ userId: 'salary-other' })).employee.version).toBe(1)
    })
    it('serializes concurrent writers without losing prior terms or audit rows', async () => {
      const outcomes = await Promise.allSettled([
        service.saveSalaryTerms(actor, input()),
        service.saveSalaryTerms(actor, input({ amountMinor: 300000 })),
      ])
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(await read()).toMatchObject({ total: 1, employee: { version: 1 } })
    })
    it('rolls back bulk changes if retaining an audited agreement fails', async () => {
      await sql().query(
        `create function fail_salary_test() returns trigger language plpgsql as $$ begin if new.version=1 and new.amount_minor=999 then raise exception 'test'; end if; return new; end $$; create trigger fail_salary_test before insert on employee_salary_term for each row execute function fail_salary_test()`,
      )
      try {
        await expect(
          service.saveSalaryTerms(actor, input({ amountMinor: 999 })),
        ).rejects.toThrow()
      } finally {
        await sql().query(
          'drop trigger fail_salary_test on employee_salary_term; drop function fail_salary_test()',
        )
      }
      expect((await read()).employee.version).toBe(0)
    })
    it('filters, sorts and paginates in SQL and distinguishes future-only configuration', async () => {
      await service.saveSalaryTerms(actor, input())
      await service.saveSalaryTerms(
        actor,
        input({
          targets: [{ userId: 'salary-other', expectedVersion: 0 }],
          effectiveFrom: '2026-12-01',
        }),
      )
      expect(
        await service.readSalaryDirectory(actor, { kind: 'monthly' }),
      ).toMatchObject({
        total: 1,
        records: [
          { userId: 'salary-worker', current: { amountMinor: 250050 } },
        ],
      })
      expect(
        await service.readSalaryDirectory(actor, { q: 'salary-other' }),
      ).toMatchObject({
        total: 1,
        records: [{ current: null, next: { version: 1 } }],
      })
      expect((await service.readSalaryDirectory(actor, { q: '%' })).total).toBe(
        0,
      )
      expect(
        (await service.readSalaryDirectory(actor, { page: 2 })).records,
      ).toHaveLength(0)
      await sql().query(
        "update employee set status='inactive' where user_id='salary-worker'",
      )
      expect(
        (await service.readSalaryDirectory(actor, { status: 'inactive' }))
          .total,
      ).toBe(1)
      for (let version = 2; version <= 12; version++)
        await service.saveSalaryTerms(
          actor,
          input({
            targets: [
              { userId: 'salary-worker', expectedVersion: version - 1 },
            ],
          }),
        )
      expect((await read()).history).toHaveLength(10)
      expect((await read({ page: 2 })).history).toHaveLength(2)
    })
  },
)
