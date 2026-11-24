// @vitest-environment node
import 'dotenv/config'
import { randomBytes, randomUUID } from 'node:crypto'
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
import type * as Service from './bonus-rules.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_bonus_test_${randomBytes(8).toString('hex')}`
let admin: pg.Client | undefined,
  connection: pg.Client | undefined,
  applicationDatabase: typeof Database | undefined,
  service: typeof Service,
  created = false
const actor: Actor = {
  id: 'bonus-accountant',
  name: 'ბუღალტერი',
  email: null,
  emailVerified: false,
  roles: ['accountant'],
}
const input = (extra = {}) => ({
  ruleId: null,
  expectedVersion: 0,
  requestId: randomUUID(),
  name: 'დამატებითი მონტაჟი',
  kind: 'bonus',
  calculation: 'job',
  unitLabel: '',
  qualification: 'მიღებული სამუშაოს დადასტურებული შესრულება',
  amountMinor: 12345,
  amountBasis: 'gross',
  currency: 'GEL',
  enabled: true,
  effectiveFrom: '2026-11-25',
  reason: 'დადასტურებული სატარიფო ცვლილება',
  ...extra,
})
function sql() {
  if (!connection) throw new Error('Isolated local database required')
  return connection
}
const read = (extra = {}) => service.readBonusRules(actor, extra)
const detail = (ruleId: string, extra = {}) =>
  service.readBonusRule(actor, { ruleId, ...extra })
describe.runIf(process.env.RUN_BONUS_RULE_DB_TESTS === '1')(
  'dated bonus rule catalog against PostgreSQL',
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
      for (const role of ['accountant', 'admin', 'hr_manager']) {
        await sql().query(
          'insert into "user" (id,name,email,roles,access_state) values ($1,$1,$2,$3,\'active\')',
          [`bonus-${role}`, `bonus-${role}@example.invalid`, role],
        )
        await sql().query(
          'insert into employee (user_id,full_name,username) values ($1,$1,$1)',
          [`bonus-${role}`],
        )
      }
      await sql().query(
        "insert into company_schedule (effective_from,timezone,late_grace_minutes,early_departure_grace_minutes) values ('2026-01-01','Asia/Tbilisi',0,0)",
      )
      process.env.DATABASE_URL = target.toString()
      vi.resetModules()
      applicationDatabase = (await import('#/db')).db
      service = await import('./bonus-rules.service.server')
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-25T12:00:00+04:00'))
    }, 30000)
    beforeEach(async () => {
      await sql().query(
        'truncate payroll_bonus_rule_version, payroll_bonus_rule cascade',
      )
      await sql().query("update employee set status='active'")
      await sql().query(
        `update "user" set access_state='active', permission_overrides='{"allow":[],"deny":[]}', roles=case when id='bonus-admin' then 'admin' when id='bonus-accountant' then 'accountant' else 'hr_manager' end`,
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
    it('starts unconfigured without fabricating awards or salary terms', async () => {
      expect(await read()).toMatchObject({
        items: [],
        total: 0,
        today: '2026-11-25',
      })
      expect(
        (
          await sql().query(
            'select count(*)::int as total from employee_salary_term',
          )
        ).rows[0].total,
      ).toBe(0)
    })
    it('saves exact rates and atomic author/reason history for all supported rule types', async () => {
      for (const [kind, calculation, unitLabel] of [
        ['bonus', 'fixed', ''],
        ['bonus', 'job', ''],
        ['bonus', 'task', ''],
        ['bonus', 'additional_work', 'საათი'],
        ['premium', 'fixed', ''],
      ]) {
        const saved = await service.saveBonusRule(
          actor,
          input({ kind, calculation, unitLabel }),
        )
        const result = await detail(saved.ruleId)
        expect(result.current).toMatchObject({
          amountMinor: 12345,
          currency: 'GEL',
          kind,
          calculation,
          unitLabel,
          enabled: true,
        })
        expect(result.history[0]).toMatchObject({
          actorName: actor.id,
          reason: 'დადასტურებული სატარიფო ცვლილება',
          version: 1,
        })
        expect(JSON.stringify(result)).not.toContain('requestId')
      }
    })
    it('preserves future changes and resolves greatest effective date then same-day version', async () => {
      const saved = await service.saveBonusRule(actor, input())
      await service.saveBonusRule(
        actor,
        input({
          ruleId: saved.ruleId,
          expectedVersion: 1,
          effectiveFrom: '2027-01-01',
          amountMinor: 50000,
        }),
      )
      await service.saveBonusRule(
        actor,
        input({ ruleId: saved.ruleId, expectedVersion: 2, amountMinor: 15000 }),
      )
      expect(await detail(saved.ruleId)).toMatchObject({
        current: { version: 3, amountMinor: 15000 },
        next: { version: 2, amountMinor: 50000 },
        latest: { version: 3 },
      })
      await service.saveBonusRule(
        actor,
        input({
          ruleId: saved.ruleId,
          expectedVersion: 3,
          effectiveFrom: '2027-01-01',
          enabled: false,
        }),
      )
      expect((await detail(saved.ruleId)).next).toMatchObject({
        version: 4,
        enabled: false,
      })
    })
    it('shows a future-only rule explicitly without a current or invented zero rate', async () => {
      const saved = await service.saveBonusRule(
        actor,
        input({ effectiveFrom: '2026-12-01' }),
      )
      expect(await detail(saved.ruleId)).toMatchObject({
        current: null,
        next: { version: 1, amountMinor: 12345 },
      })
      expect((await read()).items[0].current).toBeNull()
    })
    it('serializes stale writers and commits one immutable update', async () => {
      const saved = await service.saveBonusRule(actor, input())
      const results = await Promise.allSettled(
        [1, 2].map((n) =>
          service.saveBonusRule(
            actor,
            input({
              ruleId: saved.ruleId,
              expectedVersion: 1,
              amountMinor: n * 100,
            }),
          ),
        ),
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect((await detail(saved.ruleId)).total).toBe(2)
    })
    it('makes repeated commands exactly once and rejects changed retries', async () => {
      const payload = input()
      const results = await Promise.all([
        service.saveBonusRule(actor, payload),
        service.saveBonusRule(actor, payload),
      ])
      expect(results[0]).toEqual(results[1])
      expect((await read()).total).toBe(1)
      expect((await detail(results[0].ruleId)).total).toBe(1)
      await expect(
        service.saveBonusRule(actor, { ...payload, amountMinor: 99 }),
      ).rejects.toThrow('მოთხოვნის მონაცემები შეიცვალა')
      await sql().query(
        'update "user" set access_state=\'suspended\' where id=$1',
        [actor.id],
      )
      await expect(service.saveBonusRule(actor, payload)).rejects.toThrow()
    })
    it('rechecks current grants, denial overrides and inactive employment for reads and writes', async () => {
      await expect(service.readBonusRules(null, {})).rejects.toThrow()
      await expect(
        service.saveBonusRule({ ...actor, id: 'bonus-hr_manager' }, input()),
      ).rejects.toThrow()
      await sql().query(
        "update \"user\" set permission_overrides='{}'::jsonb || jsonb_build_object('deny',jsonb_build_array('payroll.configure')) where id=$1",
        [actor.id],
      )
      await expect(read()).rejects.toThrow()
      await expect(service.saveBonusRule(actor, input())).rejects.toThrow()
      await sql().query(
        'update "user" set permission_overrides=\'{"allow":[],"deny":[]}\' where id=$1',
        [actor.id],
      )
      await sql().query(
        "update employee set status='inactive' where user_id=$1",
        [actor.id],
      )
      await expect(read()).rejects.toThrow()
    })
    it('bounds directory/history pages, escapes SQL wildcard searches and scopes rule history', async () => {
      const saved = await service.saveBonusRule(
        actor,
        input({ name: 'მონტაჟი 100% _' }),
      )
      for (let version = 1; version <= 11; version++)
        await service.saveBonusRule(
          actor,
          input({
            ruleId: saved.ruleId,
            expectedVersion: version,
            reason: `სატარიფო ცვლილება ${version}`,
          }),
        )
      await service.saveBonusRule(actor, input({ name: 'სხვა წესი' }))
      expect((await read({ q: '%' })).total).toBe(0)
      expect((await read({ q: 'სხვა' })).total).toBe(1)
      expect((await detail(saved.ruleId)).history).toHaveLength(10)
      expect((await detail(saved.ruleId, { page: 2 })).history).toHaveLength(2)
      expect(
        (await detail(saved.ruleId, { q: 'სატარიფო ცვლილება' })).total,
      ).toBe(12)
      expect((await detail(saved.ruleId, { q: 'არარსებული' })).total).toBe(0)
      expect((await detail(saved.ruleId, { q: '%' })).total).toBe(0)
    })
    it('rejects backdating and malformed premium/extra-work inputs before persistence', async () => {
      for (const extra of [
        { effectiveFrom: '2026-11-24' },
        { kind: 'premium' },
        { calculation: 'additional_work' },
        { amountMinor: 1.2 },
        { actorId: 'forged' },
      ])
        await expect(
          service.saveBonusRule(actor, input(extra)),
        ).rejects.toThrow()
      expect((await read()).total).toBe(0)
    })
    it('rolls back the rule identity when its audited version cannot be written', async () => {
      await sql().query(
        "create function reject_bonus_version() returns trigger language plpgsql as $$ begin raise exception 'test'; end $$",
      )
      await sql().query(
        'create trigger reject_bonus_version before insert on payroll_bonus_rule_version for each row execute function reject_bonus_version()',
      )
      try {
        await expect(service.saveBonusRule(actor, input())).rejects.toThrow()
      } finally {
        await sql().query(
          'drop trigger reject_bonus_version on payroll_bonus_rule_version',
        )
        await sql().query('drop function reject_bonus_version()')
      }
      expect(
        (
          await sql().query(
            'select count(*)::int as total from payroll_bonus_rule',
          )
        ).rows[0].total,
      ).toBe(0)
    })
  },
)
