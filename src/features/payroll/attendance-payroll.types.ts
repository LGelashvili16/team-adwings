import type {
  PayrollAttendanceDecisionAction,
  PayrollAttendanceItemKind,
} from '#/db/schema/payroll/payroll-attendance.schema'
import type { SalaryTerm } from './salary.types'

export type AttendancePayrollFlag =
  | 'missing_scheduled_attendance'
  | 'short_rest_day_session'
  | 'incomplete_attendance'
  | 'divisor_needs_review'
  | 'excess_daytime_hours'
  | 'schedule_unknown'
  | 'gps_conflict_manual_punch'
  | 'gps_uncertain_visit'
  | 'stale_override'

export type AttendancePayrollReviewStatus =
  | 'ready'
  | 'needs_review'
  | 'approved'
  | 'overridden'
  | 'voided'
  | 'resolved'

export type HourlyBandKind =
  | 'daytime'
  | 'daytime_excess'
  | 'evening'
  | 'night'
  | 'rest_day'
  | 'gps_job'

export type HourlyBandSegment = {
  date: string
  band: HourlyBandKind
  multiplierPercent: number
  rateMinor: number
  seconds: number
  amountMinor: number
  sessionIds: string[]
}

export type AttendancePayrollDecisionRecord = {
  version: number
  action: PayrollAttendanceDecisionAction
  sourceHash: string
  calculatedSeconds: number | null
  overrideSeconds: number | null
  calculatedAmountMinor: number | null
  overrideAmountMinor: number | null
  note: string
  reason: string
  actorName: string
  recordedAt: string
}

export type AttendancePayrollItem = {
  itemKey: string
  itemKind: PayrollAttendanceItemKind
  date: string
  title: string
  note: string
  sourceHash: string
  calculatedSeconds: number | null
  effectiveSeconds: number | null
  calculatedAmountMinor: number | null
  effectiveAmountMinor: number | null
  flags: AttendancePayrollFlag[]
  reviewStatus: AttendancePayrollReviewStatus
  stage: 'salary' | 'adjustments'
  /** Structured formula details for transparent review in HR/admin UI. */
  formula: {
    monthlySalaryMinor?: number
    workingDays?: number
    hourlyRateMinor?: number
    multiplierPercent?: number
    allowanceMinutes?: number
    jobId?: string
    jobTitle?: string
    visitId?: string
    sessionIds?: string[]
    segments?: HourlyBandSegment[]
  }
  decision: AttendancePayrollDecisionRecord | null
}

export type FixedProrationSegment = {
  version: number
  startDate: string
  endDate: string
  monthlySalaryMinor: number
  coveredWorkingDays: number
  firstHalfCoveredWorkingDays: number
  totalWorkingDays: number
  amountMinor: number
  firstHalfAmountMinor: number
}

export type EmployeeAttendancePayrollEvaluation = {
  userId: string
  employeeId: string
  employeeName: string
  month: string
  timezone: string
  salary: SalaryTerm | null
  restDayClockInAllowed: boolean
  autoRestDayBonusEnabled: boolean
  scheduledWorkingDays: number
  /** True when the employee has both fixed monthly and hourly terms active on employed days within the month. */
  hasMixedSalaryKinds: boolean
  /** True when mixed-month fixed proration has a complete schedule and net-only terms and can calculate automatically. */
  fixedProrationComplete: boolean
  /** Prorated fixed-salary earnings in integer tetri for mixed Fixed <-> Hourly months. */
  proratedFixedMinor: number
  /** First-half (days 1..15) prorated fixed-salary earnings for split schedules in mixed months. */
  firstHalfProratedFixedMinor: number
  /** Transparent per-segment fixed proration breakdown for mixed months. */
  fixedProrationSegments: FixedProrationSegment[]
  /** Sum of non-voided automatic fixed rest-day bonuses in integer tetri. */
  autoBonusMinor: number
  /** Sum of non-voided calculated hourly earnings (ordinary + GPS) in integer tetri. */
  hourlyCalculatedMinor: number
  /** Total non-voided payable hourly seconds (ordinary + GPS including 20m allowances). */
  hourlyPayableSeconds: number
  /** First-half (days 1..15) calculated hourly earnings for split schedules. */
  firstHalfHourlyMinor: number
  /** First-half payable hourly seconds. */
  firstHalfHourlySeconds: number
  /** Unresolved items blocking the salary stage. */
  salaryNeedsReviewCount: number
  /** Unresolved items blocking the adjustments/bonus stage. */
  adjustmentsNeedsReviewCount: number
  items: AttendancePayrollItem[]
}

export type AttendancePayrollReviewRow = {
  userId: string
  employeeName: string
  salaryKind: 'monthly' | 'hourly' | null
  hasMixedSalaryKinds: boolean
  proratedFixedMinor: number
  autoRestDayBonusEnabled: boolean
  restDayClockInAllowed: boolean
  autoBonusMinor: number
  hourlyCalculatedMinor: number
  hourlyPayableSeconds: number
  needsReviewCount: number
  totalItems: number
}

export type AttendancePayrollReviewDirectory = {
  month: string
  records: AttendancePayrollReviewRow[]
  total: number
  pageSize: number
  canReview: boolean
}

export type AttendancePayrollEmployeeDetail =
  EmployeeAttendancePayrollEvaluation & {
    canReview: boolean
    canEditSelf: boolean
    history: Record<string, AttendancePayrollDecisionRecord[]>
  }
