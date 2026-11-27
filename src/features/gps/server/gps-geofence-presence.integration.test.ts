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
import type * as GpsPresenceService from './gps-geofence-presence.service.server'
import type * as AttendancePayrollService from '#/features/payroll/server/attendance-payroll.service.server'
import type * as AttendanceReviewService from '#/features/attendance/server/attendance-review.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'

vi.mock('@tanstack/react-start/server-only', () => ({}))

const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_gps_presence_test_${randomBytes(8).toString('hex')}`

let admin: pg.Client | undefined
let connection: pg.Client | undefined
let applicationDatabase: typeof Database | undefined
let presenceService: typeof GpsPresenceService
let payrollReviewService: typeof AttendancePayrollService
let attendanceReviewService: typeof AttendanceReviewService
let created = false

const hrActor: Actor = {
  id: 'gps-hr',
  name: 'HR მენეჯერი',
  roles: ['hr_manager'],
  email: null,
  emailVerified: false,
}
const adminActor: Actor = {
  id: 'gps-admin',
  name: 'ადმინისტრატორი',
  roles: ['admin'],
  email: null,
  emailVerified: false,
}

const JOB_LAT = 41.7151
const JOB_LNG = 44.8271
const INSIDE_LAT = 41.7152
const INSIDE_LNG = 44.82715
const OUTSIDE_LAT = 41.7185
const OUTSIDE_LNG = 44.8271

function sql() {
  if (!connection) throw new Error('Isolated local database required')
  return connection
}

async function insertFix(
  deviceId: string,
  fixIso: string,
  lat: number,
  lng: number,
  valid = true,
) {
  await sql().query(
    `insert into gps_position(device_id, fingerprint, fix_at, received_at, valid, latitude, longitude, speed_kmh, course)
     values ($1, $2, $3::timestamptz, $3::timestamptz, $4, $5, $6, 0, 0)`,
    [deviceId, randomBytes(16).toString('hex'), fixIso, valid, lat, lng],
  )
}

describe.runIf(process.env.RUN_MONTHLY_DB_TESTS === '1')(
  'GPS geofence presence, sleep mode, auto attendance, and hourly payroll against PostgreSQL',
  () => {
    let deviceId: string
    let jobId: string

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
      presenceService = await import('./gps-geofence-presence.service.server')
      payrollReviewService = await import(
        '#/features/payroll/server/attendance-payroll.service.server'
      )
      attendanceReviewService = await import(
        '#/features/attendance/server/attendance-review.service.server'
      )
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
      vi.setSystemTime(new Date('2026-11-21T14:00:00+04:00'))
      await sql().query(
        'truncate gps_job_visit_crew, gps_job_presence, gps_job_visit, gps_position, job_employee, job_event, job, gps_device, job_geofence_setting, attendance_audit, attendance_session, employee_salary_term, employee_employment_period, employee_schedule_version, company_schedule_day, company_schedule, employee, "user" cascade',
      )
      await sql().query(
        `insert into "user"(id, name, email, email_verified, roles, access_state) values
         ('gps-hr', 'HR მენეჯერი', 'hr@gps.local', true, 'hr_manager', 'active'),
         ('gps-admin', 'ადმინისტრატორი', 'admin@gps.local', true, 'admin', 'active'),
         ('gps-hourly-a', 'დათო მონტაჟნიკი', 'a@gps.local', true, 'employee', 'active'),
         ('gps-hourly-b', 'ლუკა მონტაჟნიკი', 'b@gps.local', true, 'employee', 'active'),
         ('gps-fixed-c', 'ნინო ფიქსირებული', 'c@gps.local', true, 'employee', 'active')`,
      )
      await sql().query(
        `insert into employee(user_id, full_name, status, employment_revision) values
         ('gps-hr', 'HR მენეჯერი', 'active', 1),
         ('gps-admin', 'ადმინისტრატორი', 'active', 1),
         ('gps-hourly-a', 'დათო მონტაჟნიკი', 'active', 1),
         ('gps-hourly-b', 'ლუკა მონტაჟნიკი', 'active', 1),
         ('gps-fixed-c', 'ნინო ფიქსირებული', 'active', 1)`,
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
      const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        hours: weekday <= 5 ? { start: '10:00', end: '19:00' } : null,
      }))
      for (const uid of ['gps-hourly-a', 'gps-hourly-b', 'gps-fixed-c']) {
        await sql().query(
          `insert into employee_employment_period(employee_id, start_date, end_date)
           select id, '2026-01-01', null from employee where user_id = $1`,
          [uid],
        )
        await sql().query(
          `insert into employee_schedule_version(employee_id, version, effective_from, days, source, actor_id)
           select id, 1, '2026-01-01', $2::jsonb, 'provisioned', 'gps-hr' from employee where user_id = $1`,
          [uid, JSON.stringify(week)],
        )
      }
      await sql().query(
        `insert into employee_salary_term(employee_id, version, effective_from, kind, amount_minor, amount_basis, currency, actor_id, reason)
         select id, 1, '2026-01-01', 'hourly', 2000, 'net', 'GEL', 'gps-admin', 'საათობრივი ტარიფი' from employee where user_id = 'gps-hourly-a'`,
      )
      await sql().query(
        `insert into employee_salary_term(employee_id, version, effective_from, kind, amount_minor, amount_basis, currency, actor_id, reason)
         select id, 1, '2026-01-01', 'hourly', 1500, 'net', 'GEL', 'gps-admin', 'საათობრივი ტარიფი' from employee where user_id = 'gps-hourly-b'`,
      )
      await sql().query(
        `insert into employee_salary_term(employee_id, version, effective_from, kind, amount_minor, amount_basis, currency, actor_id, reason)
         select id, 1, '2026-01-01', 'monthly', 200000, 'net', 'GEL', 'gps-admin', 'ფიქსირებული ტარიფი' from employee where user_id = 'gps-fixed-c'`,
      )

      deviceId = (
        await sql().query(
          `insert into gps_device(name, reported_id, enabled) values ('ბრიგადა 1', '860123456789012', true) returning id`,
        )
      ).rows[0].id

      jobId = (
        await sql().query(
          `insert into job(request_id, title, kind, status, longitude, latitude, created_by, gps_device_id)
           values ($1, 'ბანერის მონტაჟი', 'installation', 'pending', $2, $3, 'gps-admin', $4) returning id`,
          [randomUUID(), JOB_LNG, JOB_LAT, deviceId],
        )
      ).rows[0].id

      for (const uid of ['gps-hourly-a', 'gps-hourly-b', 'gps-fixed-c']) {
        await sql().query(
          `insert into job_employee(job_id, user_id) values ($1, $2)`,
          [jobId, uid],
        )
      }
    })

    it('runs in observation mode by default without creating attendance punches or payroll amounts', async () => {
      await insertFix(deviceId, '2026-11-21T07:00:00Z', INSIDE_LAT, INSIDE_LNG)
      await insertFix(deviceId, '2026-11-21T07:03:00Z', INSIDE_LAT, INSIDE_LNG)
      await insertFix(deviceId, '2026-11-21T09:00:00Z', OUTSIDE_LAT, OUTSIDE_LNG)
      await insertFix(deviceId, '2026-11-21T09:05:00Z', OUTSIDE_LAT, OUTSIDE_LNG)

      const res = await presenceService.processGpsGeofencePresence({
        now: new Date('2026-11-21T10:00:00Z'),
      })
      expect(res.visitsOpened).toBe(1)
      expect(res.visitsCompleted).toBe(1)
      expect(res.sessionsClockedIn).toBe(0)

      const sessions = await sql().query(
        'select count(*)::int as total from attendance_session',
      )
      expect(sessions.rows[0].total).toBe(0)

      const detail =
        await payrollReviewService.readEmployeeAttendancePayrollDetail(hrActor, {
          month: '2026-11',
          userId: 'gps-hourly-a',
        })
      expect(detail.hourlyCalculatedMinor).toBe(0)
    })

    it('auto clocks in/out crew across tracker sleep mode, preserves conflict on-site duration, computes 60.67 GEL + 45.50 GEL, and lets admin correct GPS punches', async () => {
      // Enable automatic GPS attendance
      await sql().query(
        `insert into job_geofence_setting(version, diameter, auto_attendance_enabled, actor_id) values (1, 200, true, 'gps-admin')`,
      )

      // Pre-seed an open manual session for gps-hourly-b to simulate a conflict!
      await sql().query(
        `insert into attendance_session(
          employee_id, request_id, work_date, timezone, schedule_effective_from,
          expected_start_at, expected_end_at, started_at, original_started_at
        )
        select id, $1, '2026-11-21', 'Asia/Tbilisi', '2026-01-01',
               '2026-11-21T06:00:00Z', '2026-11-21T06:00:00Z', '2026-11-21T06:00:00Z', '2026-11-21T06:00:00Z'
        from employee where user_id = 'gps-hourly-b'`,
        [randomUUID()],
      )

      // 11:00 Tbilisi (07:00Z) single inside fix -> tracker sleeps 2 hours -> wakes up outside at 13:00 (09:00Z) -> confirmed outside at 13:05 (09:05Z)
      await insertFix(deviceId, '2026-11-21T07:00:00Z', INSIDE_LAT, INSIDE_LNG)
      await insertFix(deviceId, '2026-11-21T09:00:00Z', OUTSIDE_LAT, OUTSIDE_LNG)
      await insertFix(deviceId, '2026-11-21T09:05:00Z', OUTSIDE_LAT, OUTSIDE_LNG)

      const res = await presenceService.processGpsGeofencePresence({
        now: new Date('2026-11-21T10:00:00Z'),
      })
      expect(res.visitsOpened).toBe(1)
      expect(res.visitsCompleted).toBe(1)
      expect(res.sessionsClockedIn).toBe(2) // gps-hourly-a and gps-fixed-c clocked in; gps-hourly-b had conflict
      expect(res.sessionsClockedOut).toBe(2)
      expect(res.conflictsRecorded).toBe(1)

      // Re-running processor is completely idempotent (zero duplicate visits or sessions)
      const replayRes = await presenceService.processGpsGeofencePresence({
        now: new Date('2026-11-21T10:01:00Z'),
      })
      expect(replayRes.visitsOpened).toBe(0)
      expect(replayRes.sessionsClockedIn).toBe(0)

      // Check gps-hourly-a (20 GEL/h): (2h + 20m) * 20 * 1.30 = 60.67 GEL (6067 tetri), clean & ready!
      const detailA =
        await payrollReviewService.readEmployeeAttendancePayrollDetail(hrActor, {
          month: '2026-11',
          userId: 'gps-hourly-a',
        })
      expect(detailA.hourlyCalculatedMinor).toBe(6067)
      expect(detailA.hourlyPayableSeconds).toBe(8400)
      expect(detailA.salaryNeedsReviewCount).toBe(0)
      expect(detailA.items).toHaveLength(1)
      expect(detailA.items[0].itemKind).toBe('gps_job_earning')

      // Check gps-hourly-b (conflict with manual open session):
      // Manual session was NOT closed, AND detected 2h on-site duration was saved on conflict item for HR review!
      const detailB =
        await payrollReviewService.readEmployeeAttendancePayrollDetail(hrActor, {
          month: '2026-11',
          userId: 'gps-hourly-b',
        })
      const conflictItem = detailB.items.find(
        (i) => i.itemKind === 'gps_conflict',
      )!
      expect(conflictItem).toBeDefined()
      expect(conflictItem.flags).toContain('gps_conflict_manual_punch')
      expect(conflictItem.reviewStatus).toBe('needs_review')
      expect(conflictItem.calculatedSeconds).toBe(7200) // Exact 2h on-site duration preserved!

      // Check gps-fixed-c (fixed monthly salary): attendance session created, NO hourly GPS payout created
      const detailC =
        await payrollReviewService.readEmployeeAttendancePayrollDetail(hrActor, {
          month: '2026-11',
          userId: 'gps-fixed-c',
        })
      expect(detailC.hourlyCalculatedMinor).toBe(0)

      // Admin (without attendance.correct.all) CAN correct gps-hourly-a's GPS-created session via attendance.gps.correct!
      const gpsSession = (
        await sql().query(
          `select id, revision from attendance_session where gps_visit_id is not null and employee_id = (select id from employee where user_id = 'gps-hourly-a')`,
        )
      ).rows[0]

      await attendanceReviewService.correctAttendance(adminActor, {
        sessionId: gpsSession.id,
        revision: gpsSession.revision,
        start: '2026-11-21T11:00',
        end: '2026-11-21T13:30',
        reason: 'GPS გასვლის დროის დაზუსტება ობიექტზე',
      })

      // After admin corrects the GPS session to 2h30m, payroll recalculates automatically to (2h30m + 20m) * 20 * 1.30 = 73.67 GEL!
      const detailAfterCorrect =
        await payrollReviewService.readEmployeeAttendancePayrollDetail(hrActor, {
          month: '2026-11',
          userId: 'gps-hourly-a',
        })
      expect(detailAfterCorrect.hourlyPayableSeconds).toBe(2.5 * 3600 + 1200)
      expect(detailAfterCorrect.hourlyCalculatedMinor).toBe(7367)
    })
  },
)
