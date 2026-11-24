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
const request = {
  effectiveFrom: '2026-11-24',
  amountBasis: 'gross',
  dayBasis: 'scheduled_workdays',
  incomeTaxEnabled: true,
  incomeTaxBasisPoints: 2000,
  pensionEnabled: true,
  employeePensionBasisPoints: 200,
  employerPensionBasisPoints: 200,
  expectedVersion: 0,
  reason: 'საწყისი წესების განსაზღვრა',
}
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
        .sort())
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
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
        today: request.effectiveFrom,
        current: null,
        latest: null,
      })
      expect(
        (await sql().query('select count(*)::int as total from payroll_policy'))
          .rows[0].total,
      ).toBe(0)
    })
    it('rechecks persisted roles rather than accepting a forged or stale actor', async () => {
      for (const role of roleSchema.options) {
        if (['admin', 'owner', 'accountant'].includes(role)) {
          await expect(
            service.readPayrollSettings(actor(role)),
          ).resolves.toBeDefined()
        } else {
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
    it('retains every same-date version with its trusted actor, reason and exact rates', async () => {
      await service.savePayrollSettings(actor(), request)
      await service.savePayrollSettings(actor('admin'), {
        ...request,
        expectedVersion: 1,
        employeePensionBasisPoints: 225,
        reason: 'პროცენტის განახლება',
      })
      const rows = (
        await sql().query('select * from payroll_policy order by version')
      ).rows
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({
        actor_id: 'accountant',
        version: 1,
        employee_pension_basis_points: 200,
        reason: request.reason,
      })
      expect(rows[1]).toMatchObject({
        actor_id: 'admin',
        version: 2,
        employee_pension_basis_points: 225,
      })
      expect(
        (await service.readPayrollSettings(actor())).current?.version,
      ).toBe(2)
    })
    it('rejects stale saves and concurrent first writes without losing audit history', async () => {
      const results = await Promise.allSettled([
        service.savePayrollSettings(actor(), request),
        service.savePayrollSettings(actor('admin'), {
          ...request,
          reason: 'სხვა მომხმარებლის ცვლილება',
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
    it('separates scheduled policy from current policy and selects by effective date before version', async () => {
      await service.savePayrollSettings(actor(), {
        ...request,
        effectiveFrom: '2026-12-01',
      })
      expect((await service.readPayrollSettings(actor())).current).toBeNull()
      await service.savePayrollSettings(actor(), {
        ...request,
        expectedVersion: 1,
      })
      expect(
        (await service.readPayrollSettings(actor())).current?.version,
      ).toBe(2)
      vi.setSystemTime(new Date('2026-12-02T10:00:00.000Z'))
      expect(
        (await service.readPayrollSettings(actor())).current?.version,
      ).toBe(1)
      vi.setSystemTime(new Date('2026-11-24T10:00:00.000Z'))
    })
    it('rejects retroactive policies, malformed inputs and client-supplied audit identities', async () => {
      for (const changes of [
        { effectiveFrom: '2026-11-23' },
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
