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
import type { Actor } from '#/lib/authorization/actor'
import type * as PayrollService from './payroll-settings.service.server'
import type { db as Database } from '#/db'
import { paymentScheduleDefaults } from '../payroll-settings.schemas'
import { roleSchema } from '#/lib/authorization/permissions'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const enabled = process.env.RUN_PAYROLL_DB_TESTS === '1'
const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_payroll_test_${randomBytes(8).toString('hex')}`
let admin: pg.Client | undefined
let connection: pg.Client | undefined
let database: typeof Database | undefined
let service: typeof PayrollService
let created = false
const actor = (role = 'accountant'): Actor => ({
  id: role,
  name: 'ტესტის ბუღალტერი',
  email: null,
  emailVerified: false,
  roles: ['accountant'],
})
const request = { expectedVersion: 0, schedule: paymentScheduleDefaults }
function sql() {
  if (!connection) throw new Error('Test connection unavailable')
  return connection
}

describe.runIf(enabled)(
  'payroll configuration against isolated PostgreSQL',
  () => {
    beforeAll(async () => {
      if (!originalUrl)
        throw new Error('Local PostgreSQL configuration is required')
      const target = new URL(originalUrl)
      if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
        throw new Error('Payroll tests require local PostgreSQL')
      admin = new pg.Client({ connectionString: originalUrl })
      await admin.connect()
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      created = true
      target.pathname = `/${databaseName}`
      connection = new pg.Client({ connectionString: target.toString() })
      await connection.connect()
      for (const file of readdirSync('drizzle')
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort()) {
        if (file === '0072_payroll_payment_runs.sql') {
          await sql().query(`
            insert into "user" (id, name, email, roles)
            values ('legacy-policy-author', 'Legacy policy author', 'legacy@payroll.invalid', 'accountant');
            insert into payroll_policy (
              version, effective_from, amount_basis, day_basis, income_tax_enabled, income_tax_basis_points,
              pension_enabled, employee_pension_basis_points, employer_pension_basis_points, actor_id, reason
            ) values (
              1, '2026-01-01', 'gross', 'scheduled_workdays', false, 2000,
              false, 200, 200, 'legacy-policy-author', 'Legacy configuration'
            );
          `)
        }
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
      }
      expect(
        (
          await sql().query(
            'select version, schedule, actor_id, reason from payroll_policy',
          )
        ).rows,
      ).toEqual([
        {
          version: 1,
          schedule: null,
          actor_id: 'legacy-policy-author',
          reason: 'Legacy configuration',
        },
      ])
      for (const role of roleSchema.options)
        await sql().query(
          'insert into "user" (id,name,email,roles) values ($1,$1,$2,$1)',
          [role, `${role}@payroll.invalid`],
        )
      await sql().query(
        'insert into employee (user_id,full_name) values ($1,$2)',
        ['accountant', 'ტესტის ბუღალტერი'],
      )
      process.env.DATABASE_URL = target.toString()
      vi.resetModules()
      database = (await import('#/db')).db
      service = await import('./payroll-settings.service.server')
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-24T10:00:00.000Z'))
    }, 30000)
    beforeEach(async () => {
      await sql().query('delete from payroll_policy')
      await sql().query(
        `update "user" set roles=id, access_state='active', permission_overrides='{"allow":[],"deny":[]}'::jsonb`,
      )
      await sql().query("update employee set status='active'")
    })
    afterAll(async () => {
      vi.useRealTimers()
      await database?.$client.end()
      await connection?.end()
      process.env.DATABASE_URL = originalUrl
      if (admin) {
        if (created)
          await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
        await admin.end()
      }
    })

    it('returns an unconfigured state without creating a policy on read', async () => {
      expect(await service.readPayrollSettings(actor())).toEqual({
        latest: null,
      })
      expect(
        (await sql().query('select count(*)::int as total from payroll_policy'))
          .rows[0].total,
      ).toBe(0)
    })
    it('rechecks persisted roles rather than accepting a forged or stale actor', async () => {
      for (const role of roleSchema.options) {
        if (['hr_manager', 'admin', 'owner', 'accountant'].includes(role)) {
          await expect(
            service.readPayrollSettings(actor(role)),
          ).resolves.toBeDefined()
        } else {
          await sql().query(
            `update "user" set permission_overrides='{"allow":["manage.access","payroll.configure"],"deny":[]}' where id=$1`,
            [role],
          )
          await expect(
            service.readPayrollSettings(actor(role)),
          ).rejects.toThrow()
          await expect(
            service.savePayrollSettings(actor(role), request),
          ).rejects.toThrow()
        }
      }
      await expect(service.readPayrollSettings(null)).rejects.toThrow()
      await expect(service.savePayrollSettings(null, request)).rejects.toThrow()
    })
    it('denies suspended, terminated and explicitly denied accountants', async () => {
      await sql().query(
        "update \"user\" set access_state='suspended' where id='accountant'",
      )
      await expect(
        service.savePayrollSettings(actor(), request),
      ).rejects.toThrow()
      await sql().query(
        "update \"user\" set access_state='active' where id='accountant'",
      )
      await sql().query(
        "update employee set status='inactive' where user_id='accountant'",
      )
      await expect(service.readPayrollSettings(actor())).rejects.toThrow()
      await sql().query(
        "update employee set status='active' where user_id='accountant'",
      )
      await sql().query(
        `update "user" set permission_overrides='{"allow":[],"deny":["payroll.configure"]}'::jsonb where id='accountant'`,
      )
      await expect(
        service.savePayrollSettings(actor(), request),
      ).rejects.toThrow()
    })
    it('keeps immutable audited schedule versions and one-pay configuration', async () => {
      await service.savePayrollSettings(actor(), request)
      const latest = {
        ...request.schedule,
        first: null,
        adjustments: { ...request.schedule.adjustments, offset: 0 as const },
      }
      await service.savePayrollSettings(actor('admin'), {
        schedule: latest,
        expectedVersion: 1,
      })
      const rows = (
        await sql().query(
          'select actor_id, version, schedule from payroll_policy order by version',
        )
      ).rows
      expect(rows).toEqual([
        { actor_id: 'accountant', version: 1, schedule: request.schedule },
        { actor_id: 'admin', version: 2, schedule: latest },
      ])
      expect((await service.readPayrollSettings(actor())).latest).toMatchObject(
        { version: 2, schedule: latest },
      )
    })
    it('rejects stale saves and concurrent first writes without losing audit history', async () => {
      const results = await Promise.allSettled([
        service.savePayrollSettings(actor(), request),
        service.savePayrollSettings(actor('admin'), {
          ...request,
        }),
      ])
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1)
      await expect(
        service.savePayrollSettings(actor(), request),
      ).rejects.toThrow(/პარამეტრები სხვა მომხმარებელმა შეცვალა/)
      expect(
        (await sql().query('select count(*)::int as total from payroll_policy'))
          .rows[0].total,
      ).toBe(1)
    })
    it('rejects legacy settings, malformed schedules and client-supplied audit identities', async () => {
      for (const changes of [
        {
          schedule: {
            ...request.schedule,
            salary: { offset: 1, start: 31, end: 2 },
          },
        },
        { incomeTaxBasisPoints: 20.5 },
        { actorId: 'owner' },
      ])
        await expect(
          service.savePayrollSettings(actor(), { ...request, ...changes }),
        ).rejects.toThrow()
      expect(
        (await sql().query('select count(*)::int as total from payroll_policy'))
          .rows[0].total,
      ).toBe(0)
    })
  },
)
