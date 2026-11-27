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
import type * as RestDayService from './rest-day-policy.service.server'
import type * as AttendancePayrollService from './attendance-payroll.service.server'
import type * as MonthlyService from './monthly.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'

vi.mock('@tanstack/react-start/server-only', () => ({}))

const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_att_payroll_test_${randomBytes(8).toString('hex')}`

let admin: pg.Client | undefined
let connection: pg.Client | undefined
let applicationDatabase: typeof Database | undefined
let restDayService: typeof RestDayService
let reviewService: typeof AttendancePayrollService
let monthlyService: typeof MonthlyService
let created = false

const hrActor: Actor = {
  id: 'ap-hr',
  name: 'HR მენეჯერი',
  roles: ['hr_manager'],
  email: null,
  emailVerified: false,
}
const accountantActor: Actor = {
  id: 'ap-accountant',
  name: 'ბუღალტერი',
  roles: ['accountant'],
  email: null,
  emailVerified: false,
}
const employeeActor: Actor = {
  id: 'ap-fixed',
  name: 'ფიქსირებული თანამშრომელი',
  roles: ['employee'],
  email: null,
  emailVerified: false,
}

function sql() {
  if (!connection) throw new Error('Isolated local database required')
  return connection
}

async function seedSchedule(userId: string) {
  const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    hours: weekday <= 5 ? { start: '10:00', end: '19:00' } : null,
  }))
  await sql().query(
    `insert into employee_schedule_version(employee_id, version, effective_from, days, source, actor_id)
     select id, 1, '2026-01-01', $2::jsonb, 'provisioned', 'ap-hr'
     from employee where user_id = $1`,
    [userId, JSON.stringify(days)],
  )
}

async function seedSession(
  userId: string,
  workDate: string,
  startIso: string,
  endIso: string | null,
  reviewState = 'approved',
) {
  await sql().query(
    `insert into attendance_session(
      employee_id, request_id, work_date, timezone, schedule_effective_from,
      expected_start_at, expected_end_at, started_at, ended_at,
      original_started_at, original_ended_at, review_state
     )
     select id, $2, $3, 'Asia/Tbilisi', '2026-01-01',
            $4::timestamptz, $4::timestamptz, $4::timestamptz, $5::timestamptz,
            $4::timestamptz, $5::timestamptz, $6
     from employee where user_id = $1`,
    [userId, randomUUID(), workDate, startIso, endIso, reviewState],
  )
}

describe.runIf(process.env.RUN_MONTHLY_DB_TESTS === '1')(
  'attendance-based payroll against isolated PostgreSQL',
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
        .sort()) {
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
      }
      process.env.DATABASE_URL = url.toString()
      vi.resetModules()
      applicationDatabase = (await import('#/db')).db
      restDayService = await import('./rest-day-policy.service.server')
      reviewService = await import('./attendance-payroll.service.server')
      monthlyService = await import('./monthly.service.server')
    }, 30000)

    afterAll(async () => {
      vi.useRealTimers()
      await applicationDatabase?.$client.end()
      await connection?.end()
      process.env.DATABASE_URL = originalUrl
      if (admin && created) {
        await admin.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
          [databaseName],
        )
        await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`)
      }
      await admin?.end()
    }, 30000)

    beforeEach(async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-26T12:00:00+04:00'))
      await sql().query(
        'truncate employee_rest_day_policy, payroll_attendance_decision, payroll_payment, payroll_monthly_entry, payroll_policy, employee_salary_term, employee_employment_period, employee_schedule_version, attendance_session, leave_request, company_schedule_day, company_schedule, employee, "user" cascade',
      )
      await sql().query(
        `insert into "user"(id, name, email, email_verified, roles, access_state) values
         ('ap-hr', 'HR მენეჯერი', 'hr@test.local', true, 'hr_manager', 'active'),
         ('ap-accountant', 'ბუღალტერი', 'acc@test.local', true, 'accountant', 'active'),
         ('ap-fixed', 'გიორგი ფიქსირებული', 'fixed@test.local', true, 'employee', 'active'),
         ('ap-hourly', 'დათო საათობრივი', 'hourly@test.local', true, 'employee', 'active')`,
      )
      await sql().query(
        `insert into employee(user_id, full_name, status, employment_revision) values
         ('ap-hr', 'HR მენეჯერი', 'active', 1),
         ('ap-accountant', 'ბუღალტერი', 'active', 1),
         ('ap-fixed', 'გიორგი ფიქსირებული', 'active', 1),
         ('ap-hourly', 'დათო საათობრივი', 'active', 1)`,
      )
      await sql().query(
        `insert into company_schedule(effective_from, timezone, late_grace_minutes, early_departure_grace_minutes) values ('2026-01-01', 'Asia/Tbilisi', 0, 0)`,
      )
      for (let d = 1; d <= 7; d++) {
        await sql().query(
          `insert into company_schedule_day(effective_from, weekday, start_time, end_time) values ('2026-01-01', $1, $2, $3)`,
          [d, d <= 5 ? '10:00' : null, d <= 5 ? '19:00' : null],
        )
      }
      await sql().query(
        `insert into payroll_policy(version, schedule, actor_id, reason) values (1, $1::jsonb, 'ap-accountant', 'საწყისი გრაფიკი')`,
        [JSON.stringify(paymentScheduleDefaults)],
      )
      for (const uid of ['ap-fixed', 'ap-hourly']) {
        await sql().query(
          `insert into employee_employment_period(employee_id, start_date, end_date)
           select id, '2026-01-01', null from employee where user_id = $1`,
          [uid],
        )
        await seedSchedule(uid)
      }
      await sql().query(
        `insert into employee_salary_term(employee_id, version, effective_from, kind, amount_minor, amount_basis, currency, actor_id, reason)
         select id, 1, '2026-01-01', 'monthly', 210000, 'net', 'GEL', 'ap-accountant', 'შეთანხმებული ხელფასი' from employee where user_id = 'ap-fixed'`,
      )
      await sql().query(
        `insert into employee_salary_term(employee_id, version, effective_from, kind, amount_minor, amount_basis, currency, actor_id, reason)
         select id, 1, '2026-01-01', 'hourly', 2000, 'net', 'GEL', 'ap-accountant', 'საათობრივი ტარიფი' from employee where user_id = 'ap-hourly'`,
      )
    })

    it('enforces rest-day policy defaults, effective dates, self-edit block, and permission boundaries', async () => {
      const initial = await restDayService.readEmployeeRestDayPolicy(hrActor, {
        userId: 'ap-fixed',
        page: 1,
      })
      expect(initial.current.restDayClockInAllowed).toBe(true)
      expect(initial.current.autoRestDayBonusEnabled).toBe(false)
      expect(initial.canEdit).toBe(true)

      const accView = await restDayService.readEmployeeRestDayPolicy(
        accountantActor,
        { userId: 'ap-fixed', page: 1 },
      )
      expect(accView.canEdit).toBe(false)

      await expect(
        restDayService.saveEmployeeRestDayPolicy(accountantActor, {
          userId: 'ap-fixed',
          expectedVersion: 0,
          effectiveFrom: '2026-11-01',
          restDayClockInAllowed: true,
          autoRestDayBonusEnabled: true,
        }),
      ).rejects.toThrow()

      await expect(
        restDayService.saveEmployeeRestDayPolicy(hrActor, {
          userId: 'ap-hr',
          expectedVersion: 0,
          effectiveFrom: '2026-11-01',
          restDayClockInAllowed: false,
          autoRestDayBonusEnabled: true,
        }),
      ).rejects.toThrow('საკუთარი')

      await expect(
        restDayService.readEmployeeRestDayPolicy(employeeActor, {
          userId: 'ap-fixed',
          page: 1,
        }),
      ).rejects.toThrow()

      const saved = await restDayService.saveEmployeeRestDayPolicy(hrActor, {
        userId: 'ap-fixed',
        expectedVersion: 0,
        effectiveFrom: '2026-11-01',
        restDayClockInAllowed: false,
        autoRestDayBonusEnabled: true,
        reason: 'ჩართულია დასვენების დღის ბონუსი',
      })
      expect(saved.version).toBe(1)

      const updated = await restDayService.readEmployeeRestDayPolicy(hrActor, {
        userId: 'ap-fixed',
        page: 1,
      })
      expect(updated.salaryKind).toBe('monthly')
      expect(updated.current.restDayClockInAllowed).toBe(false)
      expect(updated.current.autoRestDayBonusEnabled).toBe(true)
      expect(updated.history).toHaveLength(1)

      // Hourly employee cannot enable the fixed-salary rest-day bonus switch (they always get +30% automatically)
      const hourlyPolicy = await restDayService.readEmployeeRestDayPolicy(
        hrActor,
        { userId: 'ap-hourly', page: 1 },
      )
      expect(hourlyPolicy.salaryKind).toBe('hourly')
      await expect(
        restDayService.saveEmployeeRestDayPolicy(hrActor, {
          userId: 'ap-hourly',
          expectedVersion: 0,
          effectiveFrom: '2026-11-01',
          restDayClockInAllowed: true,
          autoRestDayBonusEnabled: true,
        }),
      ).rejects.toThrow('მხოლოდ ფიქსირებული')
    })

    it('calculates fixed rest-day bonus, blocks short-shift payout until HR reviews, and flows approved override into adjustments payment', async () => {
      await restDayService.saveEmployeeRestDayPolicy(hrActor, {
        userId: 'ap-fixed',
        expectedVersion: 0,
        effectiveFrom: '2026-11-01',
        restDayClockInAllowed: true,
        autoRestDayBonusEnabled: true,
      })

      // Saturday 2026-11-21 short 2-hour session -> 2100 GEL / 21 weekdays * 1.30 = 130.00 GEL + short_rest_day_session flag
      await seedSession(
        'ap-fixed',
        '2026-11-21',
        '2026-11-21T10:00:00+04:00',
        '2026-11-21T12:00:00+04:00',
      )

      const beforePreview = await monthlyService.previewMonthlyPayments(
        accountantActor,
        { month: '2026-11', stage: 'adjustments' },
      )
      expect(beforePreview.ready).toHaveLength(0)
      expect(beforePreview.pending).toHaveLength(1)
      expect(beforePreview.pending[0].message).toContain('გადამოწმებას')

      const detail = await reviewService.readEmployeeAttendancePayrollDetail(
        hrActor,
        { month: '2026-11', userId: 'ap-fixed' },
      )
      const bonusItem = detail.items.find(
        (i) => i.itemKind === 'fixed_rest_day_bonus',
      )!
      expect(bonusItem.calculatedAmountMinor).toBe(13000)
      expect(bonusItem.flags).toContain('short_rest_day_session')

      // HR overrides bonus to 95.00 GEL with required reason
      await reviewService.saveAttendancePayrollDecision(hrActor, {
        month: '2026-11',
        userId: 'ap-fixed',
        itemKey: bonusItem.itemKey,
        itemKind: bonusItem.itemKind,
        expectedVersion: 0,
        sourceHash: bonusItem.sourceHash,
        action: 'overridden',
        overrideAmountMinor: 9500,
        overrideSeconds: 7200,
        reason: '2 საათიანი ვიზიტის კორექტირება',
        requestId: randomUUID(),
      })

      const afterPreview = await monthlyService.previewMonthlyPayments(
        accountantActor,
        { month: '2026-11', stage: 'adjustments' },
      )
      expect(afterPreview.ready).toHaveLength(1)
      expect(afterPreview.ready[0].bonusMinor).toBe(9500)
      expect(afterPreview.ready[0].totalMinor).toBe(9500)
    })

    it('calculates hourly time bands and overnight splits automatically into first and final salary payments', async () => {
      // First half: 2026-11-10 (Tue) 10:00-21:00 = 11h @ 20 GEL = 220.00 GEL
      await seedSession(
        'ap-hourly',
        '2026-11-10',
        '2026-11-10T10:00:00+04:00',
        '2026-11-10T21:00:00+04:00',
      )
      // Second half: 2026-11-18 20:00 -> 2026-11-19 01:00 = 20 + 66 + 26 = 112.00 GEL
      await seedSession(
        'ap-hourly',
        '2026-11-18',
        '2026-11-18T20:00:00+04:00',
        '2026-11-19T01:00:00+04:00',
      )

      const firstPreview = await monthlyService.previewMonthlyPayments(
        accountantActor,
        { month: '2026-11', stage: 'first', userId: 'ap-hourly' },
      )
      expect(firstPreview.ready).toHaveLength(1)
      expect(firstPreview.ready[0].baseMinor).toBe(22000)

      // Total month preview (without publishing first yet) = 220 + 112 = 332.00 GEL
      const finalPreview = await monthlyService.previewMonthlyPayments(
        accountantActor,
        { month: '2026-11', stage: 'salary', userId: 'ap-hourly' },
      )
      expect(finalPreview.ready).toHaveLength(1)
      expect(finalPreview.ready[0].baseMinor).toBe(33200)
    })

    it('blocks self rest-day clock-in on the server when restDayClockInAllowed is OFF', async () => {
      await sql().query(
        `insert into attendance_security_policy(id, passkey_required) values (1, false) on conflict do nothing;
         insert into attendance_device(user_id, token_hash, name, state) values ('ap-fixed', 'ap-fixed', 'ტესტის ბრაუზერი', 'approved') on conflict do nothing;`,
      )
      // Saturday 2026-11-21 is a configured rest day
      vi.setSystemTime(new Date('2026-11-21T11:00:00+04:00'))
      await restDayService.saveEmployeeRestDayPolicy(hrActor, {
        userId: 'ap-fixed',
        expectedVersion: 0,
        effectiveFrom: '2026-11-01',
        restDayClockInAllowed: false,
        autoRestDayBonusEnabled: false,
      })

      const attendanceService = await import(
        '#/features/attendance/server/attendance.service.server'
      )
      const overview = await attendanceService.getAttendanceOverview(employeeActor)
      expect(overview.workday.kind).toBe('day_off')
      expect(overview.restDayClockInAllowed).toBe(false)

      await expect(
        attendanceService.checkIn(
          employeeActor,
          {
            requestId: randomUUID(),
            expectedLastSessionId: null,
            confirmedNonWorkingDate: '2026-11-21',
          },
          {
            userId: employeeActor.id,
            tokenHash: employeeActor.id,
            sessionHash: employeeActor.id,
            ip: '127.0.0.1',
          },
        ),
      ).rejects.toThrow('გამორთულია')
    })

    it('auto-prorates Fixed -> Hourly and Hourly -> Fixed transitions on Dec 9 across directory, first payment, and final salary payment', async () => {
      vi.setSystemTime(new Date('2026-12-28T12:00:00+04:00'))

      // Set Fixed 2,300 GEL -> Hourly 20 GEL on 2026-12-09 for ap-fixed
      await sql().query(
        `update employee_salary_term set amount_minor = 230000 where employee_id = (select id from employee where user_id = 'ap-fixed')`,
      )
      await sql().query(
        `insert into employee_salary_term(employee_id, version, effective_from, kind, amount_minor, amount_basis, currency, actor_id, reason)
         select id, 2, '2026-12-09', 'hourly', 2000, 'net', 'GEL', 'ap-accountant', 'საათობრივზე გადასვლა' from employee where user_id = 'ap-fixed'`,
      )

      // Set Hourly 20 GEL -> Fixed 2,300 GEL on 2026-12-09 for ap-hourly
      await sql().query(
        `insert into employee_salary_term(employee_id, version, effective_from, kind, amount_minor, amount_basis, currency, actor_id, reason)
         select id, 2, '2026-12-09', 'monthly', 230000, 'net', 'GEL', 'ap-accountant', 'ფიქსირებულზე გადასვლა' from employee where user_id = 'ap-hourly'`,
      )

      // ap-fixed attends all 6 fixed scheduled days (Dec 1-4, 7-8) + hourly sessions Dec 10 (8h = 160 GEL) and Dec 18 (8h = 160 GEL)
      for (const d of [
        '2026-12-01',
        '2026-12-02',
        '2026-12-03',
        '2026-12-04',
        '2026-12-07',
        '2026-12-08',
      ]) {
        await seedSession(
          'ap-fixed',
          d,
          `${d}T10:00:00+04:00`,
          `${d}T19:00:00+04:00`,
        )
      }
      await seedSession(
        'ap-fixed',
        '2026-12-10',
        '2026-12-10T10:00:00+04:00',
        '2026-12-10T18:00:00+04:00',
      )
      await seedSession(
        'ap-fixed',
        '2026-12-18',
        '2026-12-18T10:00:00+04:00',
        '2026-12-18T18:00:00+04:00',
      )

      // ap-hourly works 8h on Dec 3 (160 GEL) and attends all past fixed scheduled days Dec 9-25
      await seedSession(
        'ap-hourly',
        '2026-12-03',
        '2026-12-03T10:00:00+04:00',
        '2026-12-03T18:00:00+04:00',
      )
      for (const d of [
        '2026-12-09',
        '2026-12-10',
        '2026-12-11',
        '2026-12-14',
        '2026-12-15',
        '2026-12-16',
        '2026-12-17',
        '2026-12-18',
        '2026-12-21',
        '2026-12-22',
        '2026-12-23',
        '2026-12-24',
        '2026-12-25',
      ]) {
        await seedSession(
          'ap-hourly',
          d,
          `${d}T10:00:00+04:00`,
          `${d}T19:00:00+04:00`,
        )
      }

      // Directory period = 'all': ap-fixed = 600 + 320 = 920 GEL, ap-hourly = 160 + 1700 = 1860 GEL
      const allDir = await monthlyService.readMonthlyPayroll(accountantActor, {
        month: '2026-12',
        period: 'all',
      })
      const fixedRow = allDir.records.find((r) => r.userId === 'ap-fixed')!
      const hourlyRow = allDir.records.find((r) => r.userId === 'ap-hourly')!
      expect(fixedRow.hasMixedSalaryKinds).toBe(true)
      expect(fixedRow.baseMinor).toBe(92000)
      expect(fixedRow.baseNeedsConfirmation).toBe(false)
      expect(hourlyRow.hasMixedSalaryKinds).toBe(true)
      expect(hourlyRow.baseMinor).toBe(186000)
      expect(hourlyRow.baseNeedsConfirmation).toBe(false)

      // First payment preview & publish (Dec 1-15):
      // ap-fixed: 600 fixed + 160 hourly = 760 GEL; ap-hourly: 160 hourly + 500 fixed (5/23) = 660 GEL
      const firstPreview = await monthlyService.previewMonthlyPayments(
        accountantActor,
        { month: '2026-12', stage: 'first' },
      )
      expect(firstPreview.pending).toEqual([])
      expect(firstPreview.ready).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'გიორგი ფიქსირებული',
            baseMinor: 76000,
          }),
          expect.objectContaining({
            name: 'დათო საათობრივი',
            baseMinor: 66000,
          }),
        ]),
      )

      await monthlyService.publishMonthlyPayments(accountantActor, {
        month: '2026-12',
        stage: 'first',
        expectedToken: firstPreview.token,
        requestId: randomUUID(),
      })

      // Final salary stage on 2027-01-10:
      // ap-fixed remainder = 920 - 760 = 160 GEL; ap-hourly remainder = 1860 - 660 = 1200 GEL
      vi.setSystemTime(new Date('2027-01-10T12:00:00+04:00'))
      // Seed remaining Dec 28-31 attendance for ap-hourly so no missing scheduled days trigger on Jan 10
      for (const d of ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']) {
        await seedSession(
          'ap-hourly',
          d,
          `${d}T10:00:00+04:00`,
          `${d}T19:00:00+04:00`,
        )
      }

      const finalPreview = await monthlyService.previewMonthlyPayments(
        accountantActor,
        { month: '2026-12', stage: 'salary' },
      )
      expect(finalPreview.pending).toEqual([])
      expect(finalPreview.ready).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'გიორგი ფიქსირებული',
            baseMinor: 16000,
          }),
          expect.objectContaining({
            name: 'დათო საათობრივი',
            baseMinor: 120000,
          }),
        ]),
      )
    })
  },
)
