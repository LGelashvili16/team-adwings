import type {
  AttendancePayrollFlag,
  AttendancePayrollReviewStatus,
  HourlyBandKind,
} from './attendance-payroll.types'
import type {
  PayrollAttendanceDecisionAction,
  PayrollAttendanceItemKind,
} from '#/db/schema/payroll/payroll-attendance.schema'

export const attendancePayrollFlagLabels: Record<
  AttendancePayrollFlag,
  string
> = {
  missing_scheduled_attendance: 'დაგეგმილ დღეს დასწრება არ ფიქსირდება',
  short_rest_day_session: 'დასვენების დღეს 4 საათზე ნაკლები ნამუშევარია',
  incomplete_attendance: 'სესია ღიაა ან ავტომატურად დაიხურა',
  divisor_needs_review: 'არასრული თვე, შეცვლილი ტარიფი ან უცნობი განრიგი',
  excess_daytime_hours: 'დღის საათები აღემატება განრიგი + 2 სთ ზღვარს',
  schedule_unknown: 'ამ თარიღზე სამუშაო განრიგი უცნობია',
  gps_conflict_manual_punch: 'GPS ვიზიტი დაემთხვა ხელით დასწრებას',
  gps_uncertain_visit: 'GPS ვიზიტი დაუსრულებელია ან დაუზუსტებელია',
  stale_override: 'წყარო შეიცვალა - საჭიროა ხელახალი გადამოწმება',
}

export const attendancePayrollStatusPresentation: Record<
  AttendancePayrollReviewStatus,
  { label: string; variant: 'green' | 'yellow' | 'orange' | 'secondary' | 'red' }
> = {
  ready: { label: 'მზადაა', variant: 'green' },
  approved: { label: 'დადასტურებული', variant: 'green' },
  overridden: { label: 'შესწორებული', variant: 'orange' },
  resolved: { label: 'გადაწყვეტილი', variant: 'green' },
  voided: { label: 'გაუქმებული', variant: 'secondary' },
  needs_review: { label: 'გადასამოწმებელია', variant: 'yellow' },
}

export const attendancePayrollKindLabels: Record<
  PayrollAttendanceItemKind,
  string
> = {
  fixed_rest_day_bonus: 'დასვენების დღის ბონუსი',
  missing_scheduled_day: 'დასწრების გადამოწმება',
  hourly_earning: 'საათობრივი დარიცხვა',
  gps_job_earning: 'GPS სამუშაო დარიცხვა',
  gps_conflict: 'GPS დასწრების კონფლიქტი',
}

export const attendancePayrollActionLabels: Record<
  PayrollAttendanceDecisionAction,
  string
> = {
  approved: 'დადასტურება',
  overridden: 'კორექტირება',
  voided: 'გაუქმება',
  resolved: 'გადაწყვეტილად მონიშვნა',
}

export const hourlyBandLabels: Record<HourlyBandKind, string> = {
  daytime: 'დღის საათები (10:00-21:00 · 1.0x)',
  daytime_excess: 'დღის ზედმეტი საათები (> განრიგი + 2 სთ · 1.0x)',
  evening: 'საღამოს საათები (21:00-00:00 · +10%)',
  night: 'ღამის საათები (00:00-10:00 · +30%)',
  rest_day: 'დასვენების დღე (+30%)',
  gps_job: 'GPS ობიექტი (+20 წთ · +30%)',
}
