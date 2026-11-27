import { createHash } from 'node:crypto'
import { monthlyBounds } from './monthly.rules'
import type { EmployeeScheduleDay } from '#/features/scheduling/scheduling.types'
import type { SalaryTerm } from './salary.types'
import type {
  AttendancePayrollDecisionRecord,
  AttendancePayrollFlag,
  AttendancePayrollItem,
  AttendancePayrollReviewStatus,
  FixedProrationSegment,
  HourlyBandKind,
  HourlyBandSegment,
} from './attendance-payroll.types'

/** Sessions shorter than 4 hours on a rest day still calculate full 130% (Option 1A) but flag for HR review. */
export const SHORT_REST_DAY_SECONDS = 4 * 3600
/** Two extra daytime hours (in seconds) allowed at normal 1.00x rate between 10:00 and 21:00. */
export const HOURLY_DAYTIME_ALLOWANCE_SECONDS = 2 * 3600
/** Fixed 20-minute GPS job paid allowance in seconds (once per job per day). */
export const GPS_JOB_ALLOWANCE_SECONDS = 20 * 60

export type PolicyPoint = {
  version: number
  effectiveFrom: string
  restDayClockInAllowed: boolean
  autoRestDayBonusEnabled: boolean
}

export type AttendanceSessionInput = {
  id: string
  workDate: string
  timezone: string
  startedAt: Date
  endedAt: Date | null
  autoClosedAt: Date | null
  reviewState: string
  gpsVisitId?: string | null
}

export type ApprovedLeaveRange = {
  kind: 'vacation' | 'sick_leave' | 'day_off'
  startDate: string
  endDate: string | null
}

export type EmploymentPeriodInput = {
  startDate: string
  endDate: string | null
}

export type GpsJobVisitPayrollInput = {
  visitId: string
  jobId: string
  jobTitle: string
  workDate: string
  confirmedEntryAt: Date
  confirmedExitAt: Date | null
  onSiteSeconds: number
  status: 'open' | 'completed' | 'uncertain' | 'conflict'
  conflictReason?: string | null
  attendanceSessionId?: string | null
}

/** Exact half-up integer tetri formula: (monthlySalaryMinor / scheduledWorkingDays) * 1.30. */
export function calculateFixedRestDayBonusMinor(
  monthlySalaryMinor: number,
  scheduledWorkingDays: number,
): number {
  if (monthlySalaryMinor <= 0 || scheduledWorkingDays <= 0) return 0
  const numerator = BigInt(monthlySalaryMinor) * 130n
  const denominator = BigInt(scheduledWorkingDays) * 100n
  return Number((numerator + denominator / 2n) / denominator)
}

/** Exact half-up integer tetri formula for prorated fixed salary: (monthlySalaryMinor * coveredWorkingDays) / scheduledWorkingDays. */
export function calculateProratedFixedMinor(
  monthlySalaryMinor: number,
  coveredWorkingDays: number,
  scheduledWorkingDays: number,
): number {
  if (
    monthlySalaryMinor <= 0 ||
    coveredWorkingDays <= 0 ||
    scheduledWorkingDays <= 0
  ) {
    return 0
  }
  if (coveredWorkingDays >= scheduledWorkingDays) return monthlySalaryMinor
  const numerator = BigInt(monthlySalaryMinor) * BigInt(coveredWorkingDays)
  const denominator = BigInt(scheduledWorkingDays)
  return Number((numerator + denominator / 2n) / denominator)
}

/** Exact half-up integer tetri formula for hourly earnings: (hourlyRateMinor * seconds * multiplierPercent) / 360000. */
export function calculateHourlySegmentMinor(
  hourlyRateMinor: number,
  seconds: number,
  multiplierPercent: number,
): number {
  if (hourlyRateMinor <= 0 || seconds <= 0 || multiplierPercent <= 0) return 0
  const numerator =
    BigInt(hourlyRateMinor) * BigInt(seconds) * BigInt(multiplierPercent)
  const denominator = 360000n
  return Number((numerator + denominator / 2n) / denominator)
}

/** Resolves effective employee rest-day switches on a company-local date from descending-ordered timeline. */
export function resolveRestDayPolicy(
  timeline: readonly PolicyPoint[],
  date: string,
) {
  for (const point of timeline) {
    if (point.effectiveFrom <= date) {
      return {
        restDayClockInAllowed: point.restDayClockInAllowed,
        autoRestDayBonusEnabled: point.autoRestDayBonusEnabled,
      }
    }
  }
  return {
    restDayClockInAllowed: true,
    autoRestDayBonusEnabled: false,
  }
}

export function resolveSalaryTermOnDate(
  terms: readonly SalaryTerm[],
  date: string,
): SalaryTerm | null {
  let winner: SalaryTerm | null = null
  for (const term of terms) {
    if (term.effectiveFrom > date) continue
    if (
      !winner ||
      term.effectiveFrom > winner.effectiveFrom ||
      (term.effectiveFrom === winner.effectiveFrom &&
        term.version > winner.version)
    ) {
      winner = term
    }
  }
  return winner
}

function isDateWithinEmployment(
  periods: readonly EmploymentPeriodInput[],
  date: string,
) {
  return periods.some(
    (period) =>
      period.startDate <= date &&
      (period.endDate === null || period.endDate >= date),
  )
}

function isDateCoveredByApprovedLeave(
  leaves: readonly ApprovedLeaveRange[],
  date: string,
) {
  return leaves.some(
    (leave) =>
      leave.startDate <= date &&
      (leave.endDate === null || leave.endDate >= date),
  )
}

function parseClockMinutes(clock: string) {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

function scheduledDurationSeconds(day: EmployeeScheduleDay): number {
  if (day.kind !== 'scheduled' || !day.hours) return 0
  const startMin = parseClockMinutes(day.hours.start)
  const endMin = parseClockMinutes(day.hours.end)
  return endMin > startMin ? (endMin - startMin) * 60 : 0
}

const partFormatters = new Map<string, Intl.DateTimeFormat>()
function getLocalFormatter(timezone: string) {
  let formatter = partFormatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    partFormatters.set(timezone, formatter)
  }
  return formatter
}

export function getLocalParts(utcMs: number, timezone: string) {
  const parts = getLocalFormatter(timezone).formatToParts(new Date(utcMs))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour') % 24
  const minute = get('minute')
  const second = get('second')
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { year, month, day, hour, minute, second, date }
}

/** Converts a wall-clock local date + HH:MM:SS in the given IANA timezone to UTC epoch milliseconds. */
export function localDateTimeToUtcMs(
  date: string,
  hour: number,
  minute: number,
  second: number,
  timezone: string,
): number {
  const [year, month, day] = date.split('-').map(Number)
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  let guess = targetAsUtc
  // Two-pass offset convergence handles both fixed-offset zones (Asia/Tbilisi) and DST transitions cleanly.
  for (let i = 0; i < 2; i++) {
    const actual = getLocalParts(guess, timezone)
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    )
    const diff = targetAsUtc - actualAsUtc
    if (diff === 0) break
    guess += diff
  }
  return guess
}

function addDays(date: string, delta: number) {
  const dt = new Date(`${date}T12:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

function hashSource(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function applyDecision(
  item: Omit<
    AttendancePayrollItem,
    'effectiveSeconds' | 'effectiveAmountMinor' | 'reviewStatus' | 'decision'
  >,
  decision: AttendancePayrollDecisionRecord | null,
): AttendancePayrollItem {
  const flags = [...item.flags]
  if (!decision) {
    const reviewStatus: AttendancePayrollReviewStatus =
      flags.length === 0 ? 'ready' : 'needs_review'
    return {
      ...item,
      flags,
      effectiveSeconds: item.calculatedSeconds,
      effectiveAmountMinor: item.calculatedAmountMinor,
      reviewStatus,
      decision: null,
    }
  }
  if (decision.sourceHash !== item.sourceHash) {
    if (!flags.includes('stale_override')) flags.push('stale_override')
    return {
      ...item,
      flags,
      effectiveSeconds: item.calculatedSeconds,
      effectiveAmountMinor: item.calculatedAmountMinor,
      reviewStatus: 'needs_review',
      decision,
    }
  }
  if (decision.action === 'voided') {
    return {
      ...item,
      flags,
      effectiveSeconds: 0,
      effectiveAmountMinor: 0,
      reviewStatus: 'voided',
      decision,
    }
  }
  if (decision.action === 'overridden') {
    return {
      ...item,
      flags,
      note: decision.note || item.note,
      effectiveSeconds: decision.overrideSeconds ?? item.calculatedSeconds,
      effectiveAmountMinor:
        decision.overrideAmountMinor ?? item.calculatedAmountMinor,
      reviewStatus: 'overridden',
      decision,
    }
  }
  return {
    ...item,
    flags,
    note: decision.note || item.note,
    effectiveSeconds: item.calculatedSeconds,
    effectiveAmountMinor: item.calculatedAmountMinor,
    reviewStatus: decision.action,
    decision,
  }
}

export type EvaluateMonthInput = {
  month: string
  today: string
  timezone: string
  employmentPeriods: readonly EmploymentPeriodInput[]
  employmentConfirmed: boolean
  salaryTerms: readonly SalaryTerm[]
  scheduleDays: readonly EmployeeScheduleDay[]
  approvedLeaves: readonly ApprovedLeaveRange[]
  restDayPolicyTimeline: readonly PolicyPoint[]
  sessions: readonly AttendanceSessionInput[]
  gpsVisits?: readonly GpsJobVisitPayrollInput[]
  decisionsByKey: ReadonlyMap<string, AttendancePayrollDecisionRecord>
}

export type EvaluateMonthResult = {
  scheduledWorkingDays: number
  hasMixedSalaryKinds: boolean
  fixedProrationComplete: boolean
  proratedFixedMinor: number
  firstHalfProratedFixedMinor: number
  fixedProrationSegments: FixedProrationSegment[]
  autoBonusMinor: number
  hourlyCalculatedMinor: number
  hourlyPayableSeconds: number
  firstHalfHourlyMinor: number
  firstHalfHourlySeconds: number
  salaryNeedsReviewCount: number
  adjustmentsNeedsReviewCount: number
  items: AttendancePayrollItem[]
}

/** Splits one closed UTC interval at local 00:00, 10:00, and 21:00 boundaries within the earning month. */
export function splitIntervalByLocalBands(
  startMs: number,
  endMs: number,
  monthStartMs: number,
  nextMonthStartMs: number,
  timezone: string,
): { date: string; band: 'night' | 'daytime' | 'evening'; seconds: number }[] {
  const clampedStart = Math.max(startMs, monthStartMs)
  const clampedEnd = Math.min(endMs, nextMonthStartMs)
  if (clampedEnd <= clampedStart) return []

  const firstDate = getLocalParts(clampedStart, timezone).date
  const lastDate = getLocalParts(clampedEnd - 1, timezone).date
  const boundaries = new Set<number>([clampedStart, clampedEnd])

  let cursor = firstDate
  while (cursor <= lastDate) {
    for (const hour of [0, 10, 21]) {
      const boundary = localDateTimeToUtcMs(cursor, hour, 0, 0, timezone)
      if (boundary > clampedStart && boundary < clampedEnd)
        boundaries.add(boundary)
    }
    cursor = addDays(cursor, 1)
  }

  const sorted = [...boundaries].sort((a, b) => a - b)
  const slices: {
    date: string
    band: 'night' | 'daytime' | 'evening'
    seconds: number
  }[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const sliceStart = sorted[i]
    const sliceEnd = sorted[i + 1]
    const seconds = Math.round((sliceEnd - sliceStart) / 1000)
    if (seconds <= 0) continue
    const local = getLocalParts(sliceStart, timezone)
    const band =
      local.hour < 10 ? 'night' : local.hour < 21 ? 'daytime' : 'evening'
    slices.push({ date: local.date, band, seconds })
  }
  return slices
}

/** Pure, deterministic monthly attendance-based payroll evaluator covering fixed rest-day bonuses, scheduled-day checks, hourly pay bands, and GPS job visits. */
export function evaluateAttendancePayrollMonth(
  input: EvaluateMonthInput,
): EvaluateMonthResult {
  const { start, end } = monthlyBounds(input.month)
  const nextMonthStartDate = addDays(end, 1)
  const monthStartMs = localDateTimeToUtcMs(start, 0, 0, 0, input.timezone)
  const nextMonthStartMs = localDateTimeToUtcMs(
    nextMonthStartDate,
    0,
    0,
    0,
    input.timezone,
  )

  const scheduleByDate = new Map(
    input.scheduleDays.map((day) => [day.date, day]),
  )
  const scheduledWorkingDays = input.scheduleDays.filter(
    (day) => day.kind === 'scheduled',
  ).length
  const scheduleHasGaps = input.scheduleDays.some(
    (day) => day.kind === 'unknown_history' || day.kind === 'unconfigured',
  )

  const fullMonthEmployed =
    input.employmentConfirmed &&
    input.employmentPeriods.length === 1 &&
    input.employmentPeriods[0].startDate <= start &&
    (input.employmentPeriods[0].endDate === null ||
      input.employmentPeriods[0].endDate >= end)

  const items: AttendancePayrollItem[] = []
  const validSessions = input.sessions.filter(
    (session) => session.reviewState !== 'rejected',
  )

  // Resolve the active salary term on each employed day so same-day superseded terms do not create false transitions.
  const employedDays = input.scheduleDays.filter((day) =>
    isDateWithinEmployment(input.employmentPeriods, day.date),
  )
  const resolvedDailyTerms = employedDays
    .map((day) => ({
      day,
      term: resolveSalaryTermOnDate(input.salaryTerms, day.date),
    }))
    .filter(
      (entry): entry is { day: EmployeeScheduleDay; term: SalaryTerm } =>
        entry.term !== null,
    )
  const hasFixed = resolvedDailyTerms.some(
    ({ term }) => term.kind === 'monthly',
  )
  const hasHourly = resolvedDailyTerms.some(
    ({ term }) => term.kind === 'hourly',
  )
  const hasMixedSalaryKinds = input.employmentConfirmed && hasFixed && hasHourly

  const fixedProrationSegments: FixedProrationSegment[] = []
  let proratedFixedMinor = 0
  let firstHalfProratedFixedMinor = 0
  let fixedProrationComplete = false

  if (hasMixedSalaryKinds) {
    const firstHalfCutoff = `${input.month}-15`
    const allTermsNet = resolvedDailyTerms.every(
      ({ term }) => term.amountBasis === 'net',
    )
    fixedProrationComplete =
      allTermsNet && scheduledWorkingDays > 0 && !scheduleHasGaps

    let current: {
      version: number
      startDate: string
      endDate: string
      monthlySalaryMinor: number
      coveredWorkingDays: number
      firstHalfCoveredWorkingDays: number
    } | null = null

    const flushSegment = () => {
      if (!current) return
      const amountMinor = fixedProrationComplete
        ? calculateProratedFixedMinor(
            current.monthlySalaryMinor,
            current.coveredWorkingDays,
            scheduledWorkingDays,
          )
        : 0
      const firstHalfAmountMinor = fixedProrationComplete
        ? Math.min(
            amountMinor,
            calculateProratedFixedMinor(
              current.monthlySalaryMinor,
              current.firstHalfCoveredWorkingDays,
              scheduledWorkingDays,
            ),
          )
        : 0
      fixedProrationSegments.push({
        ...current,
        totalWorkingDays: scheduledWorkingDays,
        amountMinor,
        firstHalfAmountMinor,
      })
      proratedFixedMinor += amountMinor
      firstHalfProratedFixedMinor += firstHalfAmountMinor
      current = null
    }

    for (const { day, term } of resolvedDailyTerms) {
      if (term.kind !== 'monthly') {
        flushSegment()
        continue
      }
      if (!current || current.version !== term.version) {
        flushSegment()
        current = {
          version: term.version,
          startDate: day.date,
          endDate: day.date,
          monthlySalaryMinor: term.amountMinor,
          coveredWorkingDays: 0,
          firstHalfCoveredWorkingDays: 0,
        }
      } else {
        current.endDate = day.date
      }
      if (day.kind === 'scheduled') {
        current.coveredWorkingDays += 1
        if (day.date <= firstHalfCutoff) {
          current.firstHalfCoveredWorkingDays += 1
        }
      }
    }
    flushSegment()
  }

  // 1. Fixed monthly salary evaluation: missing scheduled days + rest-day bonuses.
  if (hasFixed && input.employmentConfirmed) {
    const fixedTermsInMonth = input.scheduleDays
      .filter((day) =>
        isDateWithinEmployment(input.employmentPeriods, day.date),
      )
      .map((day) => resolveSalaryTermOnDate(input.salaryTerms, day.date))
      .filter((term): term is SalaryTerm => term?.kind === 'monthly')
    const singleFixedRate =
      fixedTermsInMonth.length > 0 &&
      fixedTermsInMonth.every(
        (term) => term.amountMinor === fixedTermsInMonth[0].amountMinor,
      )

    for (const day of input.scheduleDays) {
      if (!isDateWithinEmployment(input.employmentPeriods, day.date)) continue
      const termOnDay = resolveSalaryTermOnDate(input.salaryTerms, day.date)
      if (!termOnDay || termOnDay.kind !== 'monthly') continue

      const daySessions = validSessions.filter(
        (session) => session.workDate === day.date,
      )

      if (day.kind === 'scheduled') {
        // Flag missing attendance on past scheduled days without approved leave (no auto deduction).
        if (
          day.date < input.today &&
          !isDateCoveredByApprovedLeave(input.approvedLeaves, day.date) &&
          daySessions.length === 0
        ) {
          const itemKey = `missing_scheduled_day:${day.date}`
          const sourceHash = hashSource({
            kind: 'missing_scheduled_day',
            date: day.date,
            schedule: day.hours,
          })
          items.push(
            applyDecision(
              {
                itemKey,
                itemKind: 'missing_scheduled_day',
                date: day.date,
                title: `გამოუცხადებელი სამუშაო დღე (${day.date})`,
                note: `დაგეგმილ სამუშაო დღეს (${day.date}) დასწრება არ დაფიქსირდა`,
                sourceHash,
                calculatedSeconds: 0,
                calculatedAmountMinor: 0,
                flags: ['missing_scheduled_attendance'],
                stage: 'salary',
                formula: {},
              },
              input.decisionsByKey.get(itemKey) ?? null,
            ),
          )
        } else if (
          daySessions.some(
            (session) =>
              session.endedAt === null || session.autoClosedAt !== null,
          )
        ) {
          const itemKey = `missing_scheduled_day:${day.date}`
          const sourceHash = hashSource({
            kind: 'incomplete_scheduled_day',
            date: day.date,
            sessions: daySessions.map((s) => ({
              id: s.id,
              startedAt: s.startedAt.toISOString(),
              endedAt: s.endedAt?.toISOString() ?? null,
              autoClosedAt: s.autoClosedAt?.toISOString() ?? null,
            })),
          })
          items.push(
            applyDecision(
              {
                itemKey,
                itemKind: 'missing_scheduled_day',
                date: day.date,
                title: `დაუსრულებელი დასწრება (${day.date})`,
                note: `სამუშაო დღის (${day.date}) დასწრება ღიაა ან ავტომატურად დაიხურა`,
                sourceHash,
                calculatedSeconds: daySessions.reduce(
                  (sum, s) =>
                    s.endedAt
                      ? sum +
                        Math.max(
                          0,
                          Math.round(
                            (s.endedAt.getTime() - s.startedAt.getTime()) /
                              1000,
                          ),
                        )
                      : sum,
                  0,
                ),
                calculatedAmountMinor: 0,
                flags: ['incomplete_attendance'],
                stage: 'salary',
                formula: { sessionIds: daySessions.map((s) => s.id) },
              },
              input.decisionsByKey.get(itemKey) ?? null,
            ),
          )
        }
      } else if (day.kind === 'day_off') {
        const policy = resolveRestDayPolicy(
          input.restDayPolicyTimeline,
          day.date,
        )
        if (!policy.autoRestDayBonusEnabled || daySessions.length === 0)
          continue

        const flags: AttendancePayrollFlag[] = []
        const hasIncomplete = daySessions.some(
          (session) =>
            session.endedAt === null || session.autoClosedAt !== null,
        )
        if (hasIncomplete) flags.push('incomplete_attendance')

        const closedSeconds = daySessions.reduce((sum, session) => {
          if (!session.endedAt) return sum
          return (
            sum +
            Math.max(
              0,
              Math.round(
                (session.endedAt.getTime() - session.startedAt.getTime()) /
                  1000,
              ),
            )
          )
        }, 0)

        if (closedSeconds === 0 && !hasIncomplete) continue

        if (closedSeconds > 0 && closedSeconds < SHORT_REST_DAY_SECONDS) {
          flags.push('short_rest_day_session')
        }

        const divisorIssue =
          scheduleHasGaps ||
          scheduledWorkingDays <= 0 ||
          !fullMonthEmployed ||
          !singleFixedRate
        if (divisorIssue) flags.push('divisor_needs_review')

        const calculatedAmountMinor =
          scheduledWorkingDays > 0
            ? calculateFixedRestDayBonusMinor(
                termOnDay.amountMinor,
                scheduledWorkingDays,
              )
            : 0

        const itemKey = `fixed_rest_day_bonus:${day.date}`
        const sourceHash = hashSource({
          kind: 'fixed_rest_day_bonus',
          date: day.date,
          monthlySalaryMinor: termOnDay.amountMinor,
          scheduledWorkingDays,
          autoRestDayBonusEnabled: true,
          sessions: daySessions.map((s) => ({
            id: s.id,
            startedAt: s.startedAt.toISOString(),
            endedAt: s.endedAt?.toISOString() ?? null,
            autoClosedAt: s.autoClosedAt?.toISOString() ?? null,
          })),
        })

        items.push(
          applyDecision(
            {
              itemKey,
              itemKind: 'fixed_rest_day_bonus',
              date: day.date,
              title: `დასვენების დღის ბონუსი (${day.date})`,
              note: `დასვენების დღეს მუშაობის ბონუსი (${day.date})`,
              sourceHash,
              calculatedSeconds: closedSeconds,
              calculatedAmountMinor,
              flags,
              stage: 'adjustments',
              formula: {
                monthlySalaryMinor: termOnDay.amountMinor,
                workingDays: scheduledWorkingDays,
                multiplierPercent: 130,
                sessionIds: daySessions.map((s) => s.id),
              },
            },
            input.decisionsByKey.get(itemKey) ?? null,
          ),
        )
      }
    }
  }

  // 2. Hourly salary evaluation: GPS job visits (highest priority) + ordinary hourly time bands & rest days.
  let firstHalfHourlyMinor = 0
  let firstHalfHourlySeconds = 0

  if (hasHourly && input.employmentConfirmed) {
    const gpsSessionIds = new Set<string>()
    const gpsAllowanceGranted = new Set<string>() // key: `${jobId}:${workDate}`

    // 2a. GPS job visits (precedence #1: 1.30x + 20 minutes once per job per day).
    const sortedGpsVisits = [...(input.gpsVisits ?? [])].sort(
      (a, b) =>
        a.confirmedEntryAt.getTime() - b.confirmedEntryAt.getTime() ||
        a.visitId.localeCompare(b.visitId),
    )

    for (const visit of sortedGpsVisits) {
      if (visit.attendanceSessionId)
        gpsSessionIds.add(visit.attendanceSessionId)
      const termOnDay = resolveSalaryTermOnDate(
        input.salaryTerms,
        visit.workDate,
      )
      if (!termOnDay || termOnDay.kind !== 'hourly') continue
      if (visit.workDate < start || visit.workDate > end) continue

      const allowanceKey = `${visit.jobId}:${visit.workDate}`
      const grantAllowance =
        visit.status === 'completed' && !gpsAllowanceGranted.has(allowanceKey)
      if (grantAllowance) gpsAllowanceGranted.add(allowanceKey)
      const allowanceSeconds = grantAllowance ? GPS_JOB_ALLOWANCE_SECONDS : 0
      const payableSeconds =
        visit.status === 'completed'
          ? visit.onSiteSeconds + allowanceSeconds
          : visit.onSiteSeconds
      const calculatedAmountMinor = calculateHourlySegmentMinor(
        termOnDay.amountMinor,
        payableSeconds,
        130,
      )

      const flags: AttendancePayrollFlag[] = []
      if (visit.status === 'conflict') flags.push('gps_conflict_manual_punch')
      else if (visit.status === 'uncertain' || visit.status === 'open')
        flags.push('gps_uncertain_visit')

      const itemKind =
        visit.status === 'conflict' ? 'gps_conflict' : 'gps_job_earning'
      const itemKey = `${itemKind}:${visit.visitId}`
      const sourceHash = hashSource({
        kind: itemKind,
        visitId: visit.visitId,
        jobId: visit.jobId,
        workDate: visit.workDate,
        onSiteSeconds: visit.onSiteSeconds,
        allowanceSeconds,
        status: visit.status,
        rateMinor: termOnDay.amountMinor,
      })

      const decided = applyDecision(
        {
          itemKey,
          itemKind,
          date: visit.workDate,
          title:
            visit.status === 'conflict'
              ? `GPS დასწრების კონფლიქტი · ${visit.jobTitle} (${visit.workDate})`
              : `GPS სამუშაო · ${visit.jobTitle} (${visit.workDate})`,
          note:
            visit.status === 'conflict'
              ? visit.conflictReason ||
                `GPS ვიზიტი დაემთხვა ხელით დასწრებას (${visit.jobTitle})`
              : `GPS ობიექტზე მუშაობა (${visit.jobTitle}, ${visit.workDate})`,
          sourceHash,
          calculatedSeconds: payableSeconds,
          calculatedAmountMinor,
          flags,
          stage: 'salary',
          formula: {
            hourlyRateMinor: termOnDay.amountMinor,
            multiplierPercent: 130,
            allowanceMinutes: allowanceSeconds / 60,
            jobId: visit.jobId,
            jobTitle: visit.jobTitle,
            visitId: visit.visitId,
            sessionIds: visit.attendanceSessionId
              ? [visit.attendanceSessionId]
              : [],
          },
        },
        input.decisionsByKey.get(itemKey) ?? null,
      )
      items.push(decided)

      if (
        decided.reviewStatus !== 'voided' &&
        visit.workDate <= `${input.month}-15`
      ) {
        firstHalfHourlyMinor += decided.effectiveAmountMinor ?? 0
        firstHalfHourlySeconds += decided.effectiveSeconds ?? 0
      }
    }

    // 2b. Ordinary hourly sessions (excluding sessions owned by GPS visits so seconds are counted once).
    const ordinarySessions = validSessions.filter(
      (session) =>
        !gpsSessionIds.has(session.id) && !(session.gpsVisitId ?? null),
    )

    // Group daily slices and incomplete flags by company-local calendar date.
    type DayBucket = {
      slices: {
        band: 'night' | 'daytime' | 'evening'
        seconds: number
        sessionId: string
      }[]
      incompleteSessionIds: string[]
      allSessionIds: Set<string>
    }
    const buckets = new Map<string, DayBucket>()
    const ensureBucket = (date: string) => {
      let bucket = buckets.get(date)
      if (!bucket) {
        bucket = {
          slices: [],
          incompleteSessionIds: [],
          allSessionIds: new Set(),
        }
        buckets.set(date, bucket)
      }
      return bucket
    }

    for (const session of ordinarySessions) {
      if (session.endedAt === null || session.autoClosedAt !== null) {
        if (session.workDate >= start && session.workDate <= end) {
          const bucket = ensureBucket(session.workDate)
          bucket.incompleteSessionIds.push(session.id)
          bucket.allSessionIds.add(session.id)
        }
        if (session.endedAt === null) continue
      }
      const slices = splitIntervalByLocalBands(
        session.startedAt.getTime(),
        session.endedAt.getTime(),
        monthStartMs,
        nextMonthStartMs,
        input.timezone,
      )
      for (const slice of slices) {
        const bucket = ensureBucket(slice.date)
        bucket.slices.push({
          band: slice.band,
          seconds: slice.seconds,
          sessionId: session.id,
        })
        bucket.allSessionIds.add(session.id)
      }
    }

    const sortedDates = [...buckets.keys()].sort()
    for (const date of sortedDates) {
      const bucket = buckets.get(date)!
      if (!isDateWithinEmployment(input.employmentPeriods, date)) continue
      const termOnDay = resolveSalaryTermOnDate(input.salaryTerms, date)
      if (!termOnDay || termOnDay.kind !== 'hourly') continue

      const daySchedule = scheduleByDate.get(date)
      const flags: AttendancePayrollFlag[] = []
      if (bucket.incompleteSessionIds.length > 0)
        flags.push('incomplete_attendance')
      if (
        !daySchedule ||
        daySchedule.kind === 'unknown_history' ||
        daySchedule.kind === 'unconfigured'
      ) {
        flags.push('schedule_unknown')
      }

      const segments: HourlyBandSegment[] = []
      if (daySchedule?.kind === 'day_off') {
        // Non-stacking rest-day rule: single 1.30x multiplier for all rest-day hours.
        const totalSeconds = bucket.slices.reduce(
          (sum, slice) => sum + slice.seconds,
          0,
        )
        if (totalSeconds > 0) {
          segments.push({
            date,
            band: 'rest_day',
            multiplierPercent: 130,
            rateMinor: termOnDay.amountMinor,
            seconds: totalSeconds,
            amountMinor: calculateHourlySegmentMinor(
              termOnDay.amountMinor,
              totalSeconds,
              130,
            ),
            sessionIds: [...bucket.allSessionIds],
          })
        }
      } else {
        const daytimeTotal = bucket.slices
          .filter((slice) => slice.band === 'daytime')
          .reduce((sum, slice) => sum + slice.seconds, 0)
        const eveningTotal = bucket.slices
          .filter((slice) => slice.band === 'evening')
          .reduce((sum, slice) => sum + slice.seconds, 0)
        const nightTotal = bucket.slices
          .filter((slice) => slice.band === 'night')
          .reduce((sum, slice) => sum + slice.seconds, 0)

        const allowance =
          (daySchedule ? scheduledDurationSeconds(daySchedule) : 0) +
          HOURLY_DAYTIME_ALLOWANCE_SECONDS
        const normalDaytime =
          daySchedule?.kind === 'scheduled'
            ? Math.min(daytimeTotal, allowance)
            : daytimeTotal
        const excessDaytime =
          daySchedule?.kind === 'scheduled'
            ? Math.max(0, daytimeTotal - allowance)
            : 0

        if (excessDaytime > 0) flags.push('excess_daytime_hours')

        const pushBand = (
          band: HourlyBandKind,
          seconds: number,
          multiplierPercent: number,
        ) => {
          if (seconds <= 0) return
          segments.push({
            date,
            band,
            multiplierPercent,
            rateMinor: termOnDay.amountMinor,
            seconds,
            amountMinor: calculateHourlySegmentMinor(
              termOnDay.amountMinor,
              seconds,
              multiplierPercent,
            ),
            sessionIds: [...bucket.allSessionIds],
          })
        }

        pushBand('daytime', normalDaytime, 100)
        pushBand('daytime_excess', excessDaytime, 100)
        pushBand('evening', eveningTotal, 110)
        pushBand('night', nightTotal, 130)
      }

      const totalSeconds = segments.reduce((sum, seg) => sum + seg.seconds, 0)
      const totalAmountMinor = segments.reduce(
        (sum, seg) => sum + seg.amountMinor,
        0,
      )
      if (totalSeconds === 0 && flags.length === 0) continue

      const itemKey = `hourly_earning:${date}`
      const sourceHash = hashSource({
        kind: 'hourly_earning',
        date,
        rateMinor: termOnDay.amountMinor,
        scheduleKind: daySchedule?.kind ?? 'unknown',
        scheduleHours: daySchedule?.hours ?? null,
        segments: segments.map((s) => ({
          band: s.band,
          seconds: s.seconds,
          multiplierPercent: s.multiplierPercent,
        })),
        incompleteSessionIds: bucket.incompleteSessionIds,
      })

      const decided = applyDecision(
        {
          itemKey,
          itemKind: 'hourly_earning',
          date,
          title:
            daySchedule?.kind === 'day_off'
              ? `საათობრივი ანაზღაურება · დასვენების დღე (${date})`
              : `საათობრივი ანაზღაურება (${date})`,
          note:
            daySchedule?.kind === 'day_off'
              ? `დასვენების დღის საათობრივი მუშაობა +30% (${date})`
              : `საათობრივი დარიცხვა (${date})`,
          sourceHash,
          calculatedSeconds: totalSeconds,
          calculatedAmountMinor: totalAmountMinor,
          flags,
          stage: 'salary',
          formula: {
            hourlyRateMinor: termOnDay.amountMinor,
            sessionIds: [...bucket.allSessionIds],
            segments,
          },
        },
        input.decisionsByKey.get(itemKey) ?? null,
      )
      items.push(decided)

      if (decided.reviewStatus !== 'voided' && date <= `${input.month}-15`) {
        firstHalfHourlyMinor += decided.effectiveAmountMinor ?? 0
        firstHalfHourlySeconds += decided.effectiveSeconds ?? 0
      }
    }
  }

  let autoBonusMinor = 0
  let hourlyCalculatedMinor = 0
  let hourlyPayableSeconds = 0
  let salaryNeedsReviewCount = 0
  let adjustmentsNeedsReviewCount = 0

  for (const item of items) {
    if (item.reviewStatus === 'needs_review') {
      if (item.stage === 'adjustments') adjustmentsNeedsReviewCount++
      else salaryNeedsReviewCount++
    }
    if (item.reviewStatus === 'voided') continue
    if (item.itemKind === 'fixed_rest_day_bonus') {
      autoBonusMinor += item.effectiveAmountMinor ?? 0
    } else if (
      item.itemKind === 'hourly_earning' ||
      item.itemKind === 'gps_job_earning' ||
      item.itemKind === 'gps_conflict'
    ) {
      hourlyCalculatedMinor += item.effectiveAmountMinor ?? 0
      hourlyPayableSeconds += item.effectiveSeconds ?? 0
    }
  }

  return {
    scheduledWorkingDays,
    hasMixedSalaryKinds,
    fixedProrationComplete,
    proratedFixedMinor,
    firstHalfProratedFixedMinor,
    fixedProrationSegments,
    autoBonusMinor,
    hourlyCalculatedMinor,
    hourlyPayableSeconds,
    firstHalfHourlyMinor,
    firstHalfHourlySeconds,
    salaryNeedsReviewCount,
    adjustmentsNeedsReviewCount,
    items,
  }
}
