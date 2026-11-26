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
import { paymentScheduleDefaults } from '../payroll-settings.schemas'
import type { PayStage } from '../payroll-settings.schemas'
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
async function inbox(id = 'monthly-worker') {
  const { listOwnNotifications } =
    await import('#/features/notifications/server/notifications.service.server')
  return (
    await listOwnNotifications(
      { ...actor, id, roles: ['employee'] },
      { limit: 10, offset: 0 },
    )
  ).items
}
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
const setDate = (date: string) =>
  vi.setSystemTime(new Date(date + 'T12:00:00+04:00'))
const preview = (stage: PayStage = 'first', earningMonth = month) =>
  service.previewMonthlyPayments(actor, { month: earningMonth, stage })
async function decision(stage: PayStage = 'first', earningMonth = month) {
  return {
    month: earningMonth,
    stage,
    expectedToken: (await preview(stage, earningMonth)).token,
    requestId: randomUUID(),
  }
}
async function publish(stage: PayStage = 'first') {
  return service.publishMonthlyPayments(actor, await decision(stage))
}
async function salary(
  userId: string,
  version: number,
  effectiveFrom: string,
  kind = 'monthly',
  amount = 100000,
  basis = 'net',
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
      setDate('2026-11-25')
      await sql().query(
        'truncate notification,payroll_payment,payroll_policy,payroll_monthly_entry,employee_salary_term,employee_employment_period cascade',
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
      await sql().query(
        'insert into payroll_policy (version, schedule, actor_id, reason) values (1, $1, $2, $3)',
        [
          JSON.stringify(paymentScheduleDefaults),
          actor.id,
          'Test payment schedule',
        ],
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

    it('shows the assigned salary before monthly confirmation and retains edited drafts', async () => {
      const before = await service.readMonthlyPayroll(actor, {
        month,
        period: 'all',
        q: 'monthly-worker',
      })
      expect(before.records).toMatchObject([
        {
          salary: { amountMinor: 100000, kind: 'monthly' },
          baseMinor: 100000,
          totalMinor: 100000,
          baseNeedsConfirmation: false,
          status: null,
        },
      ])
      await service.saveMonthlyAdjustments(actor, {
        month,
        userId: 'monthly-worker',
        expectedVersion: 0,
        requestId: randomUUID(),
        adjustments: [{ kind: 'bonus', amountMinor: 1500 }],
      })
      expect(
        (
          await service.readMonthlyPayroll(actor, {
            month,
            period: 'all',
            q: 'monthly-worker',
          })
        ).records,
      ).toMatchObject([{ baseMinor: 100000, totalMinor: 101500 }])
      await service.saveMonthlyEmployee(
        actor,
        await input({
          expectedVersion: 1,
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
      expect(
        (
          await service.readMonthlyPayroll(actor, {
            month,
            q: 'monthly-worker',
          })
        ).records,
      ).toMatchObject([
        {
          salary: { amountMinor: 100000 },
          baseMinor: null,
          totalMinor: null,
          baseNeedsConfirmation: true,
        },
      ])
      await expect(
        service.saveMonthlyEmployee(actor, await input()),
      ).rejects.toThrow('დაადასტურეთ თვის ხელფასი')
      await service.saveMonthlyEmployee(
        actor,
        await input({
          baseOverrideMinor: 50000,
          baseReason: undefined,
        }),
      )
      expect((await detail()).current).toMatchObject({
        baseMinor: 50000,
        baseReason: 'თვის ხელფასი დადასტურებულია.',
      })
      await salary('monthly-other', 2, '2026-11-15', 'hourly', 15000)
      expect(
        (await detail('monthly-other')).source?.requiresBaseConfirmation,
      ).toBe(true)
      await salary('monthly-other', 3, '2026-11-20', 'hourly', 15000, 'gross')
      expect((await detail('monthly-other')).source).toBeNull()
      await salary('monthly-other', 4, '2026-11-20', 'hourly', 15000, 'net')
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
      ).rejects.toThrow('დაადასტურეთ თვის ხელფასი')
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
      expect(await publish()).toEqual({ saved: 1 })
      expect((await detail()).payments[0]?.baseMinor).toBe(25000)
      expect((await detail()).current).toMatchObject({
        baseMinor: 50000,
        bonusMinor: 10000,
        totalMinor: 60000,
        status: 'draft',
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
    it('refreshes an unpaid fixed salary after correcting the agreement in a partial month', async () => {
      await sql().query(
        `update employee_employment_period set start_date='2026-11-25' where employee_id=(select id from employee where user_id='monthly-worker')`,
      )
      await salary('monthly-worker', 2, '2026-11-25', 'monthly', 50000)
      await service.saveMonthlyEmployee(
        actor,
        await input({ baseOverrideMinor: 50000, baseReason: undefined }),
      )
      await salary('monthly-worker', 3, '2026-11-25', 'monthly', 70000)
      const view = await service.readMonthlyPayroll(actor, {
        month,
        period: 'all',
        q: 'monthly-worker',
      })
      expect(view.records).toMatchObject([
        {
          salary: { amountMinor: 70000 },
          baseMinor: null,
          baseNeedsConfirmation: true,
          totalMinor: null,
        },
      ])
      expect(await detail()).toMatchObject({
        baseNeedsReview: true,
        source: { salary: { amountMinor: 70000 } },
        history: [{ baseMinor: 50000 }],
      })
      expect((await preview()).pending).toContainEqual({
        name: 'ანა თანამშრომელი',
        message: expect.stringContaining('შეიცვალა'),
      })
      await service.saveMonthlyEmployee(
        actor,
        await input({
          expectedVersion: 1,
          baseOverrideMinor: 70000,
          baseReason: undefined,
        }),
      )
      expect(await detail()).toMatchObject({
        baseNeedsReview: false,
        current: { baseMinor: 70000 },
      })
    })
    it('refreshes the full-month balance and preserves recorded installments', async () => {
      const read = async (period: 'all' | 'first' | 'salary' = 'all') =>
        (
          await service.readMonthlyPayroll(actor, {
            month,
            period,
            q: 'monthly-worker',
          })
        ).records.at(0)
      await salary('monthly-worker', 2, '2026-11-01', 'monthly', 50000)
      await service.saveMonthlyEmployee(
        actor,
        await input({ baseOverrideMinor: 50000, baseReason: undefined }),
      )
      await salary('monthly-worker', 3, '2026-12-01', 'monthly', 100000)
      expect((await read())?.baseMinor).toBe(50000)
      expect(await publish()).toEqual({ saved: 1 })
      await salary('monthly-worker', 4, '2026-11-01', 'monthly', 70000)
      expect(await read()).toMatchObject({
        salary: { amountMinor: 70000 },
        baseMinor: 70000,
        totalMinor: 70000,
        baseNeedsConfirmation: false,
      })
      expect((await read('first'))?.baseMinor).toBe(25000)
      expect((await read('salary'))?.baseMinor).toBe(45000)
      expect((await detail()).baseNeedsReview).toBe(false)
      setDate('2026-12-10')
      expect((await preview('salary')).ready).toMatchObject([
        { baseMinor: 45000 },
      ])
      expect(await publish('salary')).toEqual({ saved: 1 })
      await salary('monthly-worker', 5, '2026-11-01', 'monthly', 90000)
      expect((await read())?.baseMinor).toBe(70000)
      expect((await read('salary'))?.baseMinor).toBe(45000)
      expect((await detail()).payments).toMatchObject([
        { stage: 'first', baseMinor: 25000 },
        { stage: 'salary', baseMinor: 45000 },
      ])
    })
    it('requires review for a custom amount after a full-month salary correction', async () => {
      await service.saveMonthlyEmployee(
        actor,
        await input({ baseOverrideMinor: 50000, baseReason: undefined }),
      )
      await salary('monthly-worker', 2, '2026-01-01', 'monthly', 70000)
      expect(await detail()).toMatchObject({
        baseNeedsReview: true,
        current: { baseMinor: 50000 },
      })
      expect((await preview()).pending).toMatchObject([
        { name: 'ბექა თანამშრომელი' },
        {
          name: 'ანა თანამშრომელი',
          message: expect.stringContaining('შეიცვალა'),
        },
      ])
    })
    it('rejects missing employment and stale salary/employment sources at save or publication', async () => {
      const stale = await input()
      await salary('monthly-worker', 2, '2026-01-01', 'monthly', 120000)
      await expect(service.saveMonthlyEmployee(actor, stale)).rejects.toThrow(
        'შეიცვალა',
      )
      await service.saveMonthlyEmployee(actor, await input())
      await sql().query(
        `update employee set employment_revision=2 where user_id='monthly-worker'`,
      )
      expect((await preview()).pending).toContainEqual({
        name: 'ანა თანამშრომელი',
        message: expect.stringContaining('შეიცვალა'),
      })
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
        employmentNeedsReview: true,
        canOpenEmployeeProfile: false,
      })
      await sql().query(`update "user" set roles='owner' where id='monthly-hr'`)
      expect(
        await service.readMonthlyEmployee(
          { ...actor, id: 'monthly-hr', roles: ['owner'] },
          { month, userId: 'monthly-worker' },
        ),
      ).toMatchObject({
        employmentNeedsReview: true,
        canOpenEmployeeProfile: true,
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
      const command = await decision()
      expect(
        await Promise.all([
          service.publishMonthlyPayments(actor, command),
          service.publishMonthlyPayments(actor, command),
        ]),
      ).toEqual([{ saved: 1 }, { saved: 1 }])
      expect((await detail()).payments).toHaveLength(1)
      await expect(
        service.publishMonthlyPayments(actor, { ...command, stage: 'salary' }),
      ).rejects.toThrow()
    })
    it('publishes only the previewed employee and leaves the other employee for a later run', async () => {
      await salary('monthly-other', 2, '2026-11-01', 'monthly', 160000)
      const bulk = await decision()
      const selection = { month, stage: 'first', userId: 'monthly-worker' }
      const selected = await service.previewMonthlyPayments(actor, selection)
      expect(selected.ready).toMatchObject([
        { name: 'ანა თანამშრომელი', totalMinor: 50000 },
      ])
      expect(selected.pending).toEqual([])
      const single = {
        ...selection,
        expectedToken: selected.token,
        requestId: randomUUID(),
      }
      for (const userId of [undefined, 'monthly-other']) {
        await expect(
          service.publishMonthlyPayments(actor, { ...single, userId }),
        ).rejects.toThrow('გასაცემი თანხები შეიცვალა')
      }
      const denied: Actor = {
        ...actor,
        id: 'monthly-hr',
        roles: ['hr_manager'],
      }
      await expect(
        service.previewMonthlyPayments(denied, selection),
      ).rejects.toThrow()
      await expect(
        service.publishMonthlyPayments(denied, single),
      ).rejects.toThrow()
      await expect(
        service.publishMonthlyPayments(actor, {
          ...single,
          userId: actor.id,
        }),
      ).rejects.toThrow('საკუთარი თანხა')
      expect(await inbox()).toEqual([])
      expect(
        await Promise.all([
          service.publishMonthlyPayments(actor, single),
          service.publishMonthlyPayments(actor, single),
        ]),
      ).toEqual([{ saved: 1 }, { saved: 1 }])
      expect((await detail()).payments).toMatchObject([
        { stage: 'first', totalMinor: 50000 },
      ])
      expect((await detail('monthly-other')).payments).toEqual([])
      expect(await inbox()).toMatchObject([
        {
          body: expect.stringContaining('ხელფასის პირველი ნაწილი'),
          destination: { kind: 'payroll', month },
        },
      ])
      expect(await inbox('monthly-other')).toEqual([])
      await expect(service.publishMonthlyPayments(actor, bulk)).rejects.toThrow(
        'გასაცემი თანხები შეიცვალა',
      )
      expect(await publish()).toEqual({ saved: 1 })
      expect((await detail()).payments).toHaveLength(1)
      expect((await detail('monthly-other')).payments).toMatchObject([
        { stage: 'first', totalMinor: 80000 },
      ])
      expect(await inbox('monthly-other')).toHaveLength(1)
      expect(await inbox()).toHaveLength(1)
      expect(await inbox(actor.id)).toEqual([])
    })
    it('only exposes the employee’s own legacy statements and filters and pages them', async () => {
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
      await sql().query(
        "update payroll_monthly_entry set status='finalized' where month='2026-11-01'",
      )
      expect(
        (await readMySalary(worker, { month })).statements.records,
      ).toEqual([
        {
          month,
          amountBasis: 'net',
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
      expect(await preview().catch((error: unknown) => error)).toBeInstanceOf(
        Error,
      )
    })
    it('serializes different publishers without locking out each other’s eligible salary', async () => {
      await sql().query(`update "user" set roles='owner' where id='monthly-hr'`)
      const owner: Actor = { ...actor, id: 'monthly-hr', roles: ['owner'] }
      await salary(actor.id, 1, '2026-01-01')
      await salary(owner.id, 1, '2026-01-01')
      const accountantCommand = await decision()
      const ownerPreview = await service.previewMonthlyPayments(owner, {
        month,
        stage: 'first',
      })
      const results = await Promise.allSettled([
        service.publishMonthlyPayments(actor, accountantCommand),
        service.publishMonthlyPayments(owner, {
          ...accountantCommand,
          expectedToken: ownerPreview.token,
          requestId: randomUUID(),
        }),
      ])
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1)
      const rejected = results.find((result) => result.status === 'rejected')
      expect(rejected?.reason).toBeInstanceOf(service.MonthlyPayrollError)
      expect(rejected?.reason.message).toContain('შეიცვალა')
      expect(
        (
          await sql().query(
            'select count(*)::int as total from payroll_payment',
          )
        ).rows[0].total,
      ).toBe(2)
    })
    it('pays ready employees, leaving incomplete employees eligible for later runs', async () => {
      const first = await preview()
      expect(first.ready).toMatchObject([
        { name: 'ანა თანამშრომელი', totalMinor: 50000 },
      ])
      expect(first.pending).toMatchObject([{ name: 'ბექა თანამშრომელი' }])
      await publish()
      expect((await detail()).payments).toMatchObject([
        { stage: 'first', baseMinor: 50000 },
      ])
      expect((await detail('monthly-other')).payments).toEqual([])
      const hourly = await detail('monthly-other')
      await service.saveMonthlyEmployee(
        actor,
        await input({
          userId: 'monthly-other',
          sourceToken: hourly.source!.sourceToken,
          workedSeconds: 3600,
        }),
      )
      expect(await publish()).toEqual({ saved: 1 })
      expect((await detail('monthly-other')).payments[0]?.totalMinor).toBe(
        12345,
      )
      await service.saveMonthlyEmployee(
        actor,
        await input({
          userId: 'monthly-other',
          sourceToken: hourly.source!.sourceToken,
          expectedVersion: 1,
          workedSeconds: 7200,
        }),
      )
      setDate('2026-12-10')
      await publish('salary')
      expect(
        (await detail('monthly-other')).payments.map((line) => line.totalMinor),
      ).toEqual([12345, 12345])
    })

    it('follows the current company-local half unless the period is selected explicitly', async () => {
      vi.setSystemTime(new Date('2026-11-15T19:59:59Z'))
      expect(await service.readMonthlyPayroll(actor, {})).toMatchObject({
        month,
        period: 'first',
        nextPeriodChangeAt: Date.parse('2026-11-15T20:00:00Z'),
      })
      vi.setSystemTime(new Date('2026-11-15T20:00:00Z'))
      expect(await service.readMonthlyPayroll(actor, { month })).toMatchObject({
        month,
        period: 'salary',
        nextPeriodChangeAt: Date.parse('2026-11-30T20:00:00Z'),
      })
      expect(
        await service.readMonthlyPayroll(actor, { month, period: 'all' }),
      ).toMatchObject({
        period: 'all',
        nextPeriodChangeAt: null,
      })
      expect(
        await service.readMonthlyPayroll(actor, { month: '2026-10' }),
      ).toMatchObject({
        period: 'all',
        nextPeriodChangeAt: null,
      })
      vi.setSystemTime(new Date('2026-11-30T20:00:00Z'))
      expect(await service.readMonthlyPayroll(actor, {})).toMatchObject({
        month: '2026-12',
        period: 'first',
      })
      expect(await service.readMonthlyPayroll(actor, { month })).toMatchObject({
        period: 'all',
        nextPeriodChangeAt: null,
      })
    })

    it('validates the approved preview and prevents changing a published payment', async () => {
      const viewed = await decision()
      await service.saveMonthlyEmployee(
        actor,
        await input({
          firstPaymentMinor: 40000,
          fineStage: 'salary',
          paymentDates: { salary: '2026-12-12' },
          adjustments: [
            { kind: 'bonus', amountMinor: 2000 },
            {
              kind: 'fine',
              amountMinor: 1000,
              reason: 'დადასტურებული საფუძველი',
            },
          ],
        }),
      )
      const search = { month, q: 'monthly-worker' }
      const first = await service.readMonthlyPayroll(actor, {
        ...search,
        period: 'first',
      })
      expect(first).toMatchObject({
        period: 'first',
        records: [
          {
            baseMinor: 40000,
            totalMinor: 40000,
            paidMinor: null,
            bonusMinor: null,
            fineMinor: 0,
            payoutDates: { first: { start: '2026-11-25', end: '2026-11-29' } },
          },
        ],
      })
      expect(
        await service.readMonthlyPayroll(actor, {
          ...search,
          period: 'salary',
        }),
      ).toMatchObject({
        period: 'salary',
        records: [
          {
            baseMinor: 60000,
            totalMinor: 59000,
            paidMinor: null,
            bonusMinor: null,
            fineMinor: 1000,
            payoutDates: { salary: { start: '2026-12-12', end: '2026-12-12' } },
          },
        ],
      })
      expect(
        await service.readMonthlyPayroll(actor, { ...search, period: 'all' }),
      ).toMatchObject({
        records: [
          {
            baseMinor: 100000,
            totalMinor: 101000,
            bonusMinor: 2000,
            payoutDates: {
              adjustments: { start: '2026-12-15', end: '2026-12-20' },
            },
          },
        ],
      })
      expect(
        await service.readMonthlyPayroll(
          actor,
          { ...search, period: 'first', page: 2 },
          true,
        ),
      ).toEqual(first)
      await expect(
        service.publishMonthlyPayments(actor, viewed),
      ).rejects.toThrow('შეიცვალა')
      setDate('2026-11-26')
      await publish()
      expect((await detail()).payments[0]?.baseMinor).toBe(40000)
      expect(
        await service.readMonthlyPayroll(actor, { ...search, period: 'first' }),
      ).toMatchObject({
        records: [
          {
            baseMinor: 40000,
            totalMinor: 40000,
            paidMinor: 40000,
            payoutDates: {
              first: {
                start: '2026-11-25',
                end: '2026-11-29',
                paidOn: '2026-11-26',
              },
            },
          },
        ],
      })
      await expect(
        service.saveMonthlyEmployee(
          actor,
          await input({ expectedVersion: 1, firstPaymentMinor: 41000 }),
        ),
      ).rejects.toThrow('გაცემული')
      await expect(
        service.removeMonthlyEmployee(actor, {
          month,
          userId: 'monthly-worker',
          expectedVersion: 1,
          reason: 'Incorrect draft',
          requestId: randomUUID(),
        }),
      ).rejects.toThrow('გაცემული')
    })

    it('publishes distinct stages and exposes only paid components to the employee', async () => {
      const { readMySalary } = await import('./salary.service.server')
      const worker: Actor = {
        ...actor,
        id: 'monthly-worker',
        roles: ['employee'],
      }
      await service.saveMonthlyEmployee(
        actor,
        await input({
          firstPaymentMinor: 40000,
          fineStage: 'adjustments',
          adjustments: [
            { kind: 'premium', amountMinor: 10000 },
            { kind: 'bonus', amountMinor: 1000 },
            { kind: 'fine', amountMinor: 3000, reason: 'Internal audit note' },
          ],
        }),
      )
      expect((await readMySalary(worker, { month })).statements.total).toBe(0)
      expect(await inbox()).toEqual([])
      await publish()
      expect(
        (await readMySalary(worker, { month })).statements.records[0],
      ).toMatchObject({
        bonusMinor: 0,
        premiumMinor: 0,
        fineMinor: 0,
        totalMinor: 40000,
        payments: [{ stage: 'first', paidOn: '2026-11-25', totalMinor: 40000 }],
      })
      const command = await decision('salary')
      expect((await preview('salary')).available).toBe(false)
      await expect(
        service.publishMonthlyPayments(actor, command),
      ).rejects.toThrow()
      await sql().query(
        'insert into payroll_policy (version, schedule, actor_id, reason) values (2, $1, $2, $3)',
        [
          JSON.stringify({
            ...paymentScheduleDefaults,
            first: null,
            fineStage: 'salary',
          }),
          actor.id,
          'Next month schedule',
        ],
      )
      setDate('2026-12-15')
      await publish('salary')
      await publish('adjustments')
      const now = Date.now()
      const hour = 60 * 60 * 1000
      await sql().query(
        `update payroll_payment set created_at = case when stage = 'adjustments' then $1::timestamptz else $2::timestamptz end`,
        [new Date(now - hour), new Date(now - 24 * hour)],
      )
      const result = await readMySalary(worker, { month })
      expect(result.statements.records[0]).toMatchObject({
        baseMinor: 100000,
        bonusMinor: 1000,
        premiumMinor: 10000,
        fineMinor: 3000,
        totalMinor: 108000,
        payments: [
          { stage: 'first', totalMinor: 40000 },
          { stage: 'salary', totalMinor: 60000 },
          { stage: 'adjustments', totalMinor: 8000 },
        ],
      })
      expect(
        result.statements.records[0].payments?.map((line) => line.recentUntil),
      ).toEqual([undefined, undefined, now + 23 * hour])
      vi.setSystemTime(new Date(now + 23 * hour))
      expect(
        (await readMySalary(worker, { month })).statements.records[0].payments,
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ recentUntil: expect.any(Number) }),
        ]),
      )
      expect(JSON.stringify(result)).not.toContain('Internal audit note')
      const notifications = await inbox()
      expect(notifications).toMatchObject([
        {
          body: expect.stringMatching(
            /ნოემბერი 2026.*ბონუსი.*პრემია.*ჯარიმის დაქვითვა/,
          ),
          destination: { kind: 'payroll', month },
        },
        { body: expect.stringContaining('ხელფასის მეორე ნაწილი') },
        { body: expect.stringContaining('ხელფასის პირველი ნაწილი') },
      ])
      expect(JSON.stringify(notifications)).not.toContain('Internal audit note')
      expect(
        (await readMySalary(worker, { month: '2026-12' })).statements.total,
      ).toBe(0)
      expect(
        (
          await sql().query(
            'select distinct policy_version from payroll_payment',
          )
        ).rows,
      ).toEqual([{ policy_version: 1 }])
    })

    it('schedules same-month bonuses and a salary-stage fine on selected dates', async () => {
      await sql().query('update payroll_policy set schedule = $1', [
        JSON.stringify({
          ...paymentScheduleDefaults,
          first: null,
          adjustments: { ...paymentScheduleDefaults.adjustments, offset: 0 },
        }),
      ])
      await service.saveMonthlyEmployee(
        actor,
        await input({
          paymentDates: { adjustments: '2026-11-27', salary: '2026-12-12' },
          adjustments: [
            { kind: 'fine', amountMinor: 3000, reason: 'Approved fine' },
            { kind: 'bonus', amountMinor: 1000 },
          ],
        }),
      )
      await expect(preview()).rejects.toThrow()
      expect(await preview('adjustments')).toMatchObject({
        start: '2026-11-15',
        end: '2026-11-20',
        available: true,
        ready: [],
        pending: [{ name: 'ანა თანამშრომელი' }],
      })
      expect(
        (await service.readMonthlyPayroll(actor, { month, view: 'bonuses' }))
          .records[0].adjustmentDates,
      ).toEqual([
        { stage: 'adjustments', start: '2026-11-27', paid: false },
        { stage: 'salary', start: '2026-12-12', paid: false },
      ])
      setDate('2026-11-28')
      await publish('adjustments')
      expect(
        (await service.readMonthlyPayroll(actor, { month, view: 'bonuses' }))
          .records[0].adjustmentDates[0],
      ).toEqual({ stage: 'adjustments', start: '2026-11-28', paid: true })
      await expect(
        service.saveMonthlyEmployee(
          actor,
          await input({
            expectedVersion: 1,
            paymentDates: { adjustments: '2026-11-29', salary: '2026-12-12' },
          }),
        ),
      ).rejects.toThrow('თარიღი ვერ შეიცვლება')
      setDate('2026-12-10')
      expect((await preview('salary')).ready).toEqual([])
      setDate('2026-12-12')
      await publish('salary')
      expect((await detail()).payments).toMatchObject([
        { stage: 'adjustments', paidOn: '2026-11-28', totalMinor: 1000 },
        {
          stage: 'salary',
          baseMinor: 100000,
          fineMinor: 3000,
          totalMinor: 97000,
        },
      ])
      const report = await service.readMonthlyPayroll(actor, {
        month,
        q: 'monthly-worker',
      })
      expect(report.records[0].payoutDates).toMatchObject({
        adjustments: {
          start: '2026-11-27',
          end: '2026-11-27',
          paidOn: '2026-11-28',
        },
        salary: {
          start: '2026-12-12',
          end: '2026-12-12',
          paidOn: '2026-12-12',
        },
      })
      await expect(publish('salary')).rejects.toThrow()
    })

    it.each([
      [undefined, 'თვის ჩანაწერი ამოღებულია.'],
      ['შეცდომით დამატებული ჩანაწერი', 'შეცდომით დამატებული ჩანაწერი'],
    ])(
      'removes a draft and retains its history with reason %s',
      async (reason, auditNote) => {
        await service.saveMonthlyEmployee(actor, await input())
        const remove = {
          month,
          userId: 'monthly-worker',
          expectedVersion: 1,
          reason,
          requestId: randomUUID(),
        }
        await service.removeMonthlyEmployee(actor, {
          ...remove,
          reason: reason ?? '   ',
        })
        await service.removeMonthlyEmployee(actor, remove)
        expect(
          (await service.readMonthlyPayroll(actor, { month })).entryCount,
        ).toBe(0)
        expect((await detail()).current).toMatchObject({
          status: 'voided',
          reason: auditNote,
        })
        await service.saveMonthlyEmployee(
          actor,
          await input({ expectedVersion: 2 }),
        )
        expect((await detail()).total).toBe(3)
        expect(
          (await service.readMonthlyPayroll(actor, { month })).entryCount,
        ).toBe(1)
      },
    )
    it.each([
      [
        'payroll_payment',
        "new.employee_id = (select id from employee where user_id='monthly-other')",
      ],
      ['notification', "new.recipient_id = 'monthly-other'"],
    ])(
      'rolls back payments and notifications when a %s insert fails',
      async (table, condition) => {
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
          `create function fail_monthly_final() returns trigger language plpgsql as $$ begin if ${condition} then raise exception 'test rollback'; end if; return NEW; end $$; create trigger fail_monthly_final before insert on ${table} for each row execute function fail_monthly_final()`,
        )
        try {
          await expect(publish()).rejects.toThrow()
        } finally {
          await sql().query(
            `drop trigger fail_monthly_final on ${table}; drop function fail_monthly_final()`,
          )
        }
        expect((await detail()).total).toBe(1)
        expect((await detail('monthly-other')).payments).toEqual([])
        expect((await detail()).payments).toEqual([])
        expect(await inbox()).toEqual([])
        expect(await inbox('monthly-other')).toEqual([])
      },
    )
    it('keeps filtering and paginated history scoped, and preserves agreement bases', async () => {
      await salary(
        'monthly-worker',
        2,
        '2026-01-01',
        'monthly',
        100000,
        'gross',
      )
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
      expect((await preview()).pending).toContainEqual({
        name: 'ანა თანამშრომელი',
        message: expect.stringContaining('გასაცემი თანხა'),
      })
      expect((await preview('first', '2026-12')).available).toBe(false)
    })

    it('records adjustments before salary setup and publishes once a valid salary is configured', async () => {
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
      expect((await preview()).pending).toMatchObject([
        { name: 'ბექა თანამშრომელი' },
        { name: 'ანა თანამშრომელი' },
      ])

      await salary('monthly-worker', 1, '2026-01-01')
      await service.saveMonthlyEmployee(
        actor,
        await input({ expectedVersion: 1, adjustments }),
      )
      expect(await publish()).toEqual({ saved: 1 })
      expect((await detail()).current).toMatchObject({
        status: 'draft',
        totalMinor: 95000,
      })
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
      const payroll = await service.readMonthlyPayroll(actor, {
        month,
        period: 'all',
      })
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
