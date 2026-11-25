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
import type * as Service from './monthly.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const originalUrl = process.env.DATABASE_URL,
  databaseName = `team_adwings_monthly_test_${randomBytes(8).toString('hex')}`
let admin: pg.Client | undefined,
  connection: pg.Client | undefined,
  applicationDatabase: typeof Database | undefined,
  service: typeof Service,
  created = false
const actor: Actor = {
  id: 'monthly-accountant',
  name: 'ბუღალტერი',
  roles: ['accountant'],
  email: null,
  emailVerified: false,
}
const month = '2026-11'
function sql() {
  if (!connection) throw new Error('Isolated local database required')
  return connection
}
const detail = (userId = 'monthly-worker', page = 1) =>
  service.readMonthlyEmployee(actor, { month, userId, page })
async function input(extra = {}) {
  return {
    month,
    userId: 'monthly-worker',
    expectedVersion: 0,
    sourceToken: (await detail()).source!.sourceToken,
    workedSeconds: 0,
    baseOverrideMinor: null,
    baseReason: '',
    adjustments: [],
    requestId: randomUUID(),
    ...extra,
  }
}
async function decision(
  action: 'finalize' | 'reopen' = 'finalize',
  extra = {},
) {
  return {
    month,
    expectedToken: (await service.readMonthlyPayroll(actor, { month })).token,
    action,
    reason: 'თვის თანხები გადამოწმებულია',
    requestId: randomUUID(),
    ...extra,
  }
}
async function salary(
  userId: string,
  version: number,
  effectiveFrom: string,
  kind = 'monthly',
  amount = 100000,
  basis = 'gross',
) {
  await sql().query(
    `insert into employee_salary_term(employee_id,version,effective_from,kind,amount_minor,amount_basis,currency,actor_id,reason) select id,$2,$3,$4,$5,$6,'GEL','monthly-accountant','შეთანხმებული ტარიფი' from employee where user_id=$1`,
    [userId, version, effectiveFrom, kind, amount, basis],
  )
}
describe.runIf(process.env.RUN_MONTHLY_DB_TESTS === '1')(
  'simple monthly payroll against PostgreSQL',
  () => {
    beforeAll(async () => {
      if (!originalUrl) throw new Error('Local database required')
      const url = new URL(originalUrl)
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw new Error('Local database required')
      admin = new pg.Client({
        connectionString: originalUrl,
        connectionTimeoutMillis: 3000,
      })
      await admin.connect()
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      created = true
      url.pathname = `/${databaseName}`
      connection = new pg.Client({ connectionString: url.toString() })
      await connection.connect()
      for (const file of readdirSync('drizzle')
        .filter((f) => /^\d+.*\.sql$/.test(f))
        .sort())
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
      for (const [suffix, role, name] of [
        ['accountant', 'accountant', 'ბუღალტერი'],
        ['worker', 'employee', 'ანა თანამშრომელი'],
        ['other', 'employee', 'ბექა თანამშრომელი'],
        ['hr', 'hr_manager', 'კადრები'],
      ]) {
        const id = `monthly-${suffix}`
        await sql().query(
          `insert into "user"(id,name,email,roles,access_state) values ($1,$2,$3,$4,'active')`,
          [id, name, `${id}@example.invalid`, role],
        )
        await sql().query(
          `insert into employee(user_id,full_name,username,employment_revision) values ($1,$2,$1,1)`,
          [id, name],
        )
      }
      await sql().query(
        `insert into company_schedule(effective_from,timezone,late_grace_minutes,early_departure_grace_minutes) values ('2026-01-01','Asia/Tbilisi',0,0)`,
      )
      process.env.DATABASE_URL = url.toString()
      vi.resetModules()
      applicationDatabase = (await import('#/db')).db
      service = await import('./monthly.service.server')
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-25T12:00:00+04:00'))
    }, 30000)
    beforeEach(async () => {
      await sql().query(
        'truncate payroll_monthly_entry,employee_salary_term,employee_employment_period cascade',
      )
      await sql().query(
        `update employee set status='active',employment_revision=1`,
      )
      await sql().query(
        `update "user" set access_state='active', permission_overrides='{"allow":[],"deny":[]}', roles=case when id='monthly-accountant' then 'accountant' when id='monthly-hr' then 'hr_manager' else 'employee' end`,
      )
      await sql().query(
        `insert into employee_employment_period(employee_id,start_date) select id,'2026-01-01' from employee`,
      )
      await salary('monthly-worker', 1, '2026-01-01')
      await salary('monthly-other', 1, '2026-01-01', 'hourly', 12345)
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

    it('saves fixed salaries, distinct reasoned additions/fines and minimal immutable history', async () => {
      await service.saveMonthlyEmployee(
        actor,
        await input({
          adjustments: [
            { kind: 'bonus', amountMinor: 10001, reason: 'დამატებითი სამუშაო' },
            {
              kind: 'premium',
              amountMinor: 20002,
              reason: 'ერთჯერადი წახალისება',
            },
            {
              kind: 'fine',
              amountMinor: 3003,
              reason: 'დადასტურებული საფუძველი',
            },
          ],
        }),
      )
      const result = await detail()
      expect(result.current).toMatchObject({
        baseMinor: 100000,
        bonusMinor: 10001,
        premiumMinor: 20002,
        fineMinor: 3003,
        totalMinor: 127000,
        actorName: actor.name,
        reason: 'თვის ჩანაწერი შენახულია.',
        status: 'draft',
      })
      expect(JSON.stringify(result.current)).not.toMatch(
        /commandHash|requestId|sourceToken|employeeId/,
      )
      expect(
        (
          await sql().query(
            'select count(*)::int as total from attendance_session',
          )
        ).rows[0].total,
      ).toBe(0)
    })
    it('calculates exact hourly pay from confirmed seconds, with zero distinct from missing terms', async () => {
      await service.saveMonthlyEmployee(
        actor,
        await input({
          userId: 'monthly-other',
          sourceToken: (await detail('monthly-other')).source!.sourceToken,
          workedSeconds: 4788,
        }),
      )
      expect((await detail('monthly-other')).current).toMatchObject({
        baseMinor: 16419,
        totalMinor: 16419,
        workedSeconds: 4788,
      })
      expect((await detail('monthly-hr')).source).toBeNull()
      await expect(
        service.saveMonthlyEmployee(actor, await input({ workedSeconds: 1 })),
      ).rejects.toThrow('საათები')
      await expect(
        service.saveMonthlyEmployee(
          actor,
          await input({
            adjustments: [
              {
                kind: 'fine',
                amountMinor: 100001,
                reason: 'დადასტურებული საფუძველი',
              },
            ],
          }),
        ),
      ).rejects.toThrow('ჯამი')
    })
    it('requires current grants, denies stale/suspended identities and self modifications', async () => {
      await expect(service.readMonthlyPayroll(null, {})).rejects.toThrow()
      const staleHr = { ...actor, id: 'monthly-hr' }
      await sql().query(
        `update "user" set permission_overrides='{"allow":["payroll.read.all","payroll.manage"],"deny":[]}' where id=$1`,
        [staleHr.id],
      )
      await expect(
        service.readMonthlyPayroll(staleHr, { month }),
      ).rejects.toThrow()
      await expect(
        service.saveMonthlyEmployee(staleHr, await input()),
      ).rejects.toThrow()
      await salary(actor.id, 1, '2026-01-01')
      await expect(
        service.saveMonthlyEmployee(
          actor,
          await input({
            userId: actor.id,
            sourceToken: (await detail(actor.id)).source!.sourceToken,
          }),
        ),
      ).rejects.toThrow('საკუთარი')
      await sql().query(
        `update "user" set permission_overrides='{"allow":[],"deny":["payroll.manage"]}' where id=$1`,
        [actor.id],
      )
      await expect(
        service.saveMonthlyEmployee(actor, await input()),
      ).rejects.toThrow()
      await sql().query(
        `update "user" set access_state='suspended' where id=$1`,
        [actor.id],
      )
      await expect(service.readMonthlyPayroll(actor, {})).rejects.toThrow()
    })
    it('requires a reasoned explicit base for partial months and changing rates', async () => {
      await sql().query(
        `update employee_employment_period set start_date='2026-11-15' where employee_id=(select id from employee where user_id='monthly-worker')`,
      )
      expect((await detail()).source?.requiresBaseConfirmation).toBe(true)
      await expect(
        service.saveMonthlyEmployee(actor, await input()),
      ).rejects.toThrow('საბაზო')
      await service.saveMonthlyEmployee(
        actor,
        await input({
          baseOverrideMinor: 50000,
          baseReason: undefined,
        }),
      )
      expect((await detail()).current).toMatchObject({
        baseMinor: 50000,
        baseReason: 'საბაზო თანხა დადასტურებულია.',
      })
      await salary('monthly-other', 2, '2026-11-15', 'hourly', 15000)
      expect(
        (await detail('monthly-other')).source?.requiresBaseConfirmation,
      ).toBe(true)
      await salary('monthly-other', 3, '2026-11-20', 'hourly', 15000, 'net')
      expect((await detail('monthly-other')).source).toBeNull()
      await salary('monthly-other', 4, '2026-11-20', 'hourly', 15000, 'gross')
      expect(
        (await detail('monthly-other')).source?.requiresBaseConfirmation,
      ).toBe(true)
    })
    it('saves a bonus when the first salary starts partway through the selected month', async () => {
      await sql().query(
        `update employee_salary_term set effective_from='2026-11-25' where employee_id=(select id from employee where user_id='monthly-worker')`,
      )
      expect((await detail()).source).toMatchObject({
        salary: { effectiveFrom: '2026-11-25' },
        requiresBaseConfirmation: true,
      })
      await expect(
        service.saveMonthlyEmployee(actor, await input()),
      ).rejects.toThrow('საბაზო')
      await service.saveMonthlyEmployee(
        actor,
        await input({
          baseOverrideMinor: 50000,
          baseReason: 'თვის შეთანხმებული საბაზო თანხა',
          adjustments: [
            { kind: 'bonus', amountMinor: 10000, reason: 'დამატებითი სამუშაო' },
          ],
        }),
      )
      await service.decideMonthlyPayroll(actor, await decision())
      expect((await detail()).current).toMatchObject({
        baseMinor: 50000,
        bonusMinor: 10000,
        totalMinor: 60000,
        status: 'finalized',
      })
    })
    it('rejects a first salary effective after employment ended in the selected month', async () => {
      await sql().query(
        `update employee_employment_period set end_date='2026-11-24' where employee_id=(select id from employee where user_id='monthly-worker')`,
      )
      await sql().query(
        `update employee_salary_term set effective_from='2026-11-25' where employee_id=(select id from employee where user_id='monthly-worker')`,
      )
      expect(await detail()).toMatchObject({
        source: null,
        salaryMissing: true,
      })
    })
    it('rejects missing employment and stale salary/employment sources at save or finalization', async () => {
      const stale = await input()
      await salary('monthly-worker', 2, '2026-01-01', 'monthly', 120000)
      await expect(service.saveMonthlyEmployee(actor, stale)).rejects.toThrow(
        'შეიცვალა',
      )
      await service.saveMonthlyEmployee(actor, await input())
      await sql().query(
        `update employee set employment_revision=2 where user_id='monthly-worker'`,
      )
      await expect(
        service.decideMonthlyPayroll(actor, await decision()),
      ).rejects.toThrow('შეიცვალა')
      expect((await detail()).current?.status).toBe('draft')
      await sql().query(
        `delete from employee_employment_period where employee_id=(select id from employee where user_id='monthly-worker')`,
      )
      expect(await detail()).toMatchObject({
        sourceMessage: expect.stringContaining('დასაქმების'),
        salaryMissing: false,
      })
      await sql().query(
        `delete from employee_salary_term where employee_id=(select id from employee where user_id='monthly-worker')`,
      )
      expect(await detail()).toMatchObject({
        sourceMessage: expect.stringContaining('დასაქმების'),
        salaryMissing: true,
      })
      expect((await detail('monthly-other')).salaryMissing).toBe(false)
    })
    it('makes identical retries idempotent and rejects changed command reuse', async () => {
      const data = await input()
      await Promise.all([
        service.saveMonthlyEmployee(actor, data),
        service.saveMonthlyEmployee(actor, data),
      ])
      expect((await detail()).total).toBe(1)
      await expect(
        service.saveMonthlyEmployee(actor, {
          ...data,
          reason: 'შეცვლილი მოთხოვნა',
        }),
      ).rejects.toThrow('მოთხოვნა')
      const finalize = await decision()
      await Promise.all([
        service.decideMonthlyPayroll(actor, finalize),
        service.decideMonthlyPayroll(actor, finalize),
      ])
      expect((await detail()).total).toBe(2)
    })
    it('only exposes the employee’s own latest finalized statements and filters and pages them', async () => {
      const { readMySalary } = await import('./salary.service.server')
      const worker: Actor = {
        ...actor,
        id: 'monthly-worker',
        roles: ['employee'],
      }
      await expect(readMySalary(null, {})).rejects.toThrow()
      await expect(
        readMySalary(worker, { userId: 'monthly-other' }),
      ).rejects.toThrow()
      await service.saveMonthlyEmployee(
        actor,
        await input({
          adjustments: [
            { kind: 'bonus', amountMinor: 10000 },
            { kind: 'premium', amountMinor: 2000 },
            { kind: 'fine', amountMinor: 1000, reason: 'შიდა განმარტება' },
          ],
        }),
      )
      await service.saveMonthlyEmployee(
        actor,
        await input({
          userId: 'monthly-other',
          sourceToken: (await detail('monthly-other')).source!.sourceToken,
          workedSeconds: 3600,
        }),
      )
      expect((await readMySalary(worker, {})).statements.total).toBe(0)
      await service.decideMonthlyPayroll(actor, await decision())
      expect(
        (await readMySalary(worker, { month })).statements.records,
      ).toEqual([
        {
          month,
          amountBasis: 'gross',
          baseMinor: 100000,
          bonusMinor: 10000,
          premiumMinor: 2000,
          fineMinor: 1000,
          totalMinor: 111000,
        },
      ])
      expect(
        (await readMySalary(worker, { month: '2026-12' })).statements.total,
      ).toBe(0)
      await expect(readMySalary(worker, { month: '2026-13' })).rejects.toThrow()
      await sql().query(
        `insert into payroll_monthly_entry (employee_id,month,version,status,salary,source_token,worked_seconds,manual_base,base_reason,base_minor,adjustments,bonus_minor,premium_minor,fine_minor,total_minor,actor_id,reason,request_id,command_hash)
          select p.employee_id, m::date, 1, p.status, p.salary, p.source_token, p.worked_seconds, p.manual_base, p.base_reason, p.base_minor, p.adjustments, p.bonus_minor, p.premium_minor, p.fine_minor, p.total_minor, p.actor_id, p.reason, gen_random_uuid(), p.command_hash
          from payroll_monthly_entry p
          cross join generate_series(date '2026-01-01', date '2026-10-01', interval '1 month') m
          where p.employee_id=(select id from employee where user_id='monthly-worker') and p.month='2026-11-01' and p.status='finalized'`,
      )
      expect((await readMySalary(worker, {})).statements).toMatchObject({
        total: 11,
        page: 1,
        pageSize: 10,
      })
      expect(
        (
          await readMySalary(worker, { statementPage: 2 })
        ).statements.records.map((record) => record.month),
      ).toEqual(['2026-01'])
      await service.decideMonthlyPayroll(actor, await decision('reopen'))
      expect((await readMySalary(worker, { month })).statements.total).toBe(0)
    })
    it('finalizes the whole month atomically, blocks new/edited rows and reopens with retained history', async () => {
      await service.saveMonthlyEmployee(actor, await input())
      await service.saveMonthlyEmployee(
        actor,
        await input({
          userId: 'monthly-other',
          sourceToken: (await detail('monthly-other')).source!.sourceToken,
          workedSeconds: 3600,
        }),
      )
      expect(
        await service.decideMonthlyPayroll(actor, await decision()),
      ).toEqual({ saved: 2 })
      expect((await detail()).closed).toBe(true)
      await expect(
        service.saveMonthlyEmployee(actor, await input({ expectedVersion: 2 })),
      ).rejects.toThrow('დასრულებულია')
      await expect(
        service.removeMonthlyEmployee(actor, {
          month,
          userId: 'monthly-other',
          expectedVersion: 2,
          reason: 'შეცდომით შეტანილი ჩანაწერი',
          requestId: randomUUID(),
        }),
      ).rejects.toThrow('გახსენით')
      await service.decideMonthlyPayroll(actor, await decision('reopen'))
      await service.saveMonthlyEmployee(
        actor,
        await input({
          expectedVersion: 3,
          baseOverrideMinor: 99999,
          baseReason: 'გადამოწმებული საბაზო თანხა',
        }),
      )
      expect((await detail()).history.map((r) => r.status)).toEqual([
        'draft',
        'draft',
        'finalized',
        'draft',
      ])
      expect((await detail()).current?.totalMinor).toBe(99999)
    })
    it('detects competing saves and stale month confirmations without partial writes', async () => {
      const draft = await input(),
        staleDecision = await decision()
      const results = await Promise.allSettled([
        service.saveMonthlyEmployee(actor, draft),
        service.saveMonthlyEmployee(actor, {
          ...draft,
          requestId: randomUUID(),
        }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      await expect(
        service.decideMonthlyPayroll(actor, staleDecision),
      ).rejects.toThrow('უწყისი შეიცვალა')
      const correction = await input({ expectedVersion: 1 }),
        finalize = await decision()
      const race = await Promise.allSettled([
        service.saveMonthlyEmployee(actor, correction),
        service.decideMonthlyPayroll(actor, finalize),
      ])
      expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect((await detail()).total).toBe(2)
    })
    it('removes an erroneous draft without deleting history and allows explicit restoration', async () => {
      await service.saveMonthlyEmployee(actor, await input())
      const remove = {
        month,
        userId: 'monthly-worker',
        expectedVersion: 1,
        reason: 'შეცდომით დამატებული ჩანაწერი',
        requestId: randomUUID(),
      }
      await service.removeMonthlyEmployee(actor, remove)
      await service.removeMonthlyEmployee(actor, remove)
      expect(
        (await service.readMonthlyPayroll(actor, { month })).entryCount,
      ).toBe(0)
      expect((await detail()).current?.status).toBe('voided')
      await expect(
        service.decideMonthlyPayroll(actor, await decision()),
      ).rejects.toThrow('დაამატეთ')
      await service.saveMonthlyEmployee(
        actor,
        await input({ expectedVersion: 2 }),
      )
      expect((await detail()).total).toBe(3)
      expect(
        (await service.readMonthlyPayroll(actor, { month })).entryCount,
      ).toBe(1)
    })
    it('rolls back the entire month if any audit insert fails', async () => {
      await service.saveMonthlyEmployee(actor, await input())
      await service.saveMonthlyEmployee(
        actor,
        await input({
          userId: 'monthly-other',
          sourceToken: (await detail('monthly-other')).source!.sourceToken,
          workedSeconds: 3600,
        }),
      )
      await sql().query(
        `create function fail_monthly_final() returns trigger language plpgsql as $$ begin if NEW.status = 'finalized' and NEW.employee_id = (select id from employee where user_id='monthly-other') then raise exception 'test rollback'; end if; return NEW; end $$; create trigger fail_monthly_final before insert on payroll_monthly_entry for each row execute function fail_monthly_final()`,
      )
      try {
        await expect(
          service.decideMonthlyPayroll(actor, await decision()),
        ).rejects.toThrow()
      } finally {
        await sql().query(
          'drop trigger fail_monthly_final on payroll_monthly_entry; drop function fail_monthly_final()',
        )
      }
      expect((await detail()).total).toBe(1)
      expect((await detail('monthly-other')).total).toBe(1)
    })
    it('keeps filtering and paginated history scoped, and preserves agreement bases', async () => {
      await service.saveMonthlyEmployee(actor, await input())
      for (let version = 1; version <= 11; version++)
        await service.saveMonthlyEmployee(
          actor,
          await input({ expectedVersion: version }),
        )
      expect((await detail('monthly-worker', 2)).history).toHaveLength(2)
      expect((await detail('monthly-other')).history).toHaveLength(0)
      expect(
        (await service.readMonthlyPayroll(actor, { month, q: '%' })).records,
      ).toHaveLength(0)
      expect(
        (await service.readMonthlyPayroll(actor, { month, q: '%' })).entryCount,
      ).toBe(1)
      expect(
        (await service.readMonthlyPayroll(actor, { month, q: 'ანა' }))
          .records[0].salary?.amountBasis,
      ).toBe('gross')
      expect(
        (await service.readMonthlyEmployees(actor, { q: 'ბექა' })).records[0]
          .id,
      ).toBe('monthly-other')
      expect(
        (await service.readMonthlyPayroll(actor, { month, q: 'monthly-other' }))
          .records,
      ).toMatchObject([
        { userId: 'monthly-other', status: null, baseMinor: null },
      ])
      expect(
        (
          await service.readMonthlyPayroll(actor, {
            month,
            q: 'monthly-other',
            view: 'bonuses',
          })
        ).records,
      ).toEqual([])
      await service.decideMonthlyPayroll(actor, await decision())
      expect(
        (await service.readMonthlyPayroll(actor, { month, q: 'monthly-other' }))
          .records,
      ).toEqual([])
      const futureSource = await service.readMonthlyEmployee(actor, {
        month: '2026-12',
        userId: 'monthly-worker',
      })
      await service.saveMonthlyEmployee(actor, {
        ...(await input()),
        month: '2026-12',
        sourceToken: futureSource.source!.sourceToken,
      })
      await expect(
        service.decideMonthlyPayroll(
          actor,
          await decision('finalize', {
            month: '2026-12',
            expectedToken: (
              await service.readMonthlyPayroll(actor, { month: '2026-12' })
            ).token,
          }),
        ),
      ).rejects.toThrow('მომავალი')
    })

    it('records adjustments before salary setup and requires base pay before finalizing', async () => {
      await sql().query(
        `delete from employee_salary_term where employee_id=(select id from employee where user_id='monthly-worker')`,
      )
      const fine = {
        kind: 'fine',
        amountMinor: 15000,
        reason: 'დადასტურებული საფუძველი',
      }
      const adjustments = [{ kind: 'bonus', amountMinor: 10000 }, fine]
      const data = {
        month,
        userId: 'monthly-worker',
        expectedVersion: 0,
        adjustments,
        requestId: randomUUID(),
      }
      await service.saveMonthlyAdjustments(actor, data)
      await service.saveMonthlyAdjustments(actor, data)
      expect((await detail()).current).toMatchObject({
        version: 1,
        salary: null,
        bonusMinor: 10000,
        fineMinor: 15000,
        totalMinor: -5000,
        adjustments: [{ kind: 'bonus', amountMinor: 10000, reason: '' }, fine],
      })
      expect(
        (await service.readMonthlyPayroll(actor, { month, view: 'bonuses' }))
          .total,
      ).toBe(1)
      await expect(
        service.decideMonthlyPayroll(actor, await decision()),
      ).rejects.toThrow('საბაზო')

      await salary('monthly-worker', 1, '2026-01-01')
      await service.saveMonthlyEmployee(
        actor,
        await input({ expectedVersion: 1, adjustments }),
      )
      await service.decideMonthlyPayroll(actor, await decision())
      expect((await detail()).current).toMatchObject({
        status: 'finalized',
        totalMinor: 95000,
      })
      await expect(
        service.saveMonthlyAdjustments(actor, {
          ...data,
          expectedVersion: 3,
          requestId: randomUUID(),
        }),
      ).rejects.toThrow('დასრულებულია')
    })

    it('edits adjustments without overwriting existing base pay or hours', async () => {
      const other = await detail('monthly-other')
      const fine = {
        kind: 'fine',
        amountMinor: 200,
        reason: 'დადასტურებული საფუძველი',
      }
      await service.saveMonthlyEmployee(
        actor,
        await input({
          userId: 'monthly-other',
          sourceToken: other.source!.sourceToken,
          workedSeconds: 3600,
          baseOverrideMinor: 17000,
          baseReason: 'თვის შეთანხმებული საბაზო თანხა',
          adjustments: [fine],
        }),
      )
      const data = {
        month,
        userId: 'monthly-other',
        expectedVersion: 1,
        adjustments: [
          fine,
          {
            kind: 'premium',
            amountMinor: 3000,
            reason: 'ერთჯერადი წახალისება',
          },
        ],
        requestId: randomUUID(),
      }
      await service.saveMonthlyAdjustments(actor, data)
      await expect(
        service.saveMonthlyAdjustments(actor, {
          ...data,
          requestId: randomUUID(),
        }),
      ).rejects.toThrow('შეიცვალა')
      await expect(
        service.saveMonthlyAdjustments(actor, {
          ...data,
          expectedVersion: 2,
          adjustments: [{ ...fine, reason: '' }],
          requestId: randomUUID(),
        }),
      ).rejects.toThrow()
      expect((await detail('monthly-other')).current).toMatchObject({
        version: 2,
        workedSeconds: 3600,
        manualBase: true,
        baseMinor: 17000,
        fineMinor: 200,
        premiumMinor: 3000,
        totalMinor: 19800,
      })
    })

    it('removes an employee’s adjustment row without removing base pay or audit history', async () => {
      const adjustments = [{ kind: 'bonus', amountMinor: 1000 }]
      await service.saveMonthlyEmployee(actor, await input({ adjustments }))
      const remove = {
        month,
        userId: 'monthly-worker',
        expectedVersion: 1,
        adjustments: [],
        requestId: randomUUID(),
      }
      await service.saveMonthlyAdjustments(actor, remove)
      await service.saveMonthlyAdjustments(actor, remove)
      const prepared = await detail()
      expect(prepared.current).toMatchObject({
        version: 2,
        status: 'draft',
        baseMinor: 100000,
        totalMinor: 100000,
        adjustments: [],
      })
      expect(prepared.history[1]).toMatchObject({ bonusMinor: 1000 })

      const other = { ...remove, userId: 'monthly-other' }
      await service.saveMonthlyAdjustments(actor, {
        ...other,
        expectedVersion: 0,
        adjustments,
        requestId: randomUUID(),
      })
      await service.saveMonthlyAdjustments(actor, {
        ...other,
        requestId: randomUUID(),
      })
      const unprepared = await detail('monthly-other')
      expect(unprepared.current).toMatchObject({ version: 2, status: 'voided' })
      expect(unprepared.history[1]).toMatchObject({ bonusMinor: 1000 })
      expect(
        (await service.readMonthlyPayroll(actor, { month, view: 'bonuses' }))
          .records,
      ).toHaveLength(0)
    })

    it('shows the selected month’s latest adjustments, including fine-only rows', async () => {
      await service.saveMonthlyEmployee(
        actor,
        await input({
          adjustments: [
            { kind: 'bonus', amountMinor: 1000, reason: 'დამატებითი სამუშაო' },
            { kind: 'bonus', amountMinor: 500, reason: 'დამატებითი ბონუსი' },
            {
              kind: 'premium',
              amountMinor: 2000,
              reason: 'ერთჯერადი წახალისება',
            },
          ],
        }),
      )
      const other = await detail('monthly-other')
      await service.saveMonthlyEmployee(
        actor,
        await input({
          userId: 'monthly-other',
          sourceToken: other.source!.sourceToken,
          workedSeconds: 3600,
          adjustments: [
            {
              kind: 'fine',
              amountMinor: 100,
              reason: 'დადასტურებული საფუძველი',
            },
          ],
        }),
      )

      const bonuses = await service.readMonthlyPayroll(actor, {
        month,
        view: 'bonuses',
      })
      const payroll = await service.readMonthlyPayroll(actor, { month })
      expect(bonuses.total).toBe(2)
      expect(
        bonuses.records.find((row) => row.userId === 'monthly-other'),
      ).toMatchObject({ fineMinor: 100 })
      const worker = bonuses.records.find(
        (row) => row.userId === 'monthly-worker',
      )
      expect(worker).toMatchObject({
        userId: 'monthly-worker',
        bonusMinor: 1500,
        premiumMinor: 2000,
        totalMinor: 103500,
      })
      expect(payroll.entryCount).toBe(2)
      expect(
        payroll.records.find((row) => row.userId === 'monthly-worker'),
      ).toEqual(worker)
      expect(
        (
          await service.readMonthlyPayroll(actor, {
            month: '2026-10',
            view: 'bonuses',
          })
        ).total,
      ).toBe(0)

      await service.saveMonthlyEmployee(
        actor,
        await input({ expectedVersion: 1 }),
      )
      expect(
        (await service.readMonthlyPayroll(actor, { month, view: 'bonuses' }))
          .total,
      ).toBe(1)
    })
  },
)
