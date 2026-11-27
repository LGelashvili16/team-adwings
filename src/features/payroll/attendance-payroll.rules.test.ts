import { describe, expect, it } from 'vitest'
import {
  calculateFixedRestDayBonusMinor,
  calculateHourlySegmentMinor,
  calculateProratedFixedMinor,
  evaluateAttendancePayrollMonth,
  localDateTimeToUtcMs,
  resolveRestDayPolicy,
} from './attendance-payroll.rules'
import type { EmployeeScheduleDay } from '#/features/scheduling/scheduling.types'
import type { SalaryTerm } from './salary.types'

const TZ = 'Asia/Tbilisi'

function buildMonthSchedule(
  month: string,
  hours: { start: string; end: string } = { start: '10:00', end: '19:00' },
  offWeekdays: number[] = [6, 7],
): EmployeeScheduleDay[] {
  const [year, m] = month.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate()
  const result: EmployeeScheduleDay[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7
    const isOff = offWeekdays.includes(weekday)
    result.push({
      date,
      kind: isOff ? 'day_off' : 'scheduled',
      source: 'company',
      employeeVersion: 1,
      companyEffectiveFrom: '2026-01-01',
      timezone: TZ,
      hours: isOff ? null : hours,
    })
  }
  return result
}

function tbilisi(date: string, clock: string) {
  const [h, m, s = 0] = clock.split(':').map(Number)
  return new Date(localDateTimeToUtcMs(date, h, m, s, TZ))
}

const monthly2200: SalaryTerm = {
  version: 1,
  effectiveFrom: '2026-01-01',
  kind: 'monthly',
  amountBasis: 'net',
  amountMinor: 220000,
  currency: 'GEL',
}

const hourly20: SalaryTerm = {
  version: 1,
  effectiveFrom: '2026-01-01',
  kind: 'hourly',
  amountBasis: 'net',
  amountMinor: 2000,
  currency: 'GEL',
}

describe('attendance-payroll pure calculation rules', () => {
  it('computes exact fixed rest-day bonus (2,200 GEL / 22 days * 1.30 = 130.00 GEL)', () => {
    expect(calculateFixedRestDayBonusMinor(220000, 22)).toBe(13000)
    // Half-up rounding check: 100000 / 21 * 1.30 = 6190.476 -> 6190
    expect(calculateFixedRestDayBonusMinor(100000, 21)).toBe(6190)
  })

  it('computes exact hourly segments including 2h GPS visit + 20m at 20 GEL/h * 1.30 = 60.67 GEL', () => {
    expect(calculateHourlySegmentMinor(2000, 3600, 100)).toBe(2000)
    expect(calculateHourlySegmentMinor(2000, 3 * 3600, 110)).toBe(6600)
    expect(calculateHourlySegmentMinor(2000, 3600, 130)).toBe(2600)
    expect(calculateHourlySegmentMinor(2000, 2 * 3600 + 20 * 60, 130)).toBe(
      6067,
    )
  })

  it('defaults rest-day policy to clock-in ON and auto bonus OFF when no history exists', () => {
    expect(resolveRestDayPolicy([], '2026-11-21')).toEqual({
      restDayClockInAllowed: true,
      autoRestDayBonusEnabled: false,
    })
  })

  it('generates no fixed rest-day bonus when auto switch is OFF, and one 130 GEL bonus when ON even with two sessions on the same rest date', () => {
    // November 2026 has 21 weekdays; use a custom schedule with 22 scheduled working days to match the 2,200 / 22 = 100 -> 130 GEL example.
    const schedule = buildMonthSchedule('2026-11')
    // Turn Saturday 2026-11-07 into scheduled so total working days = 22, leaving 2026-11-21 (Saturday) as rest day.
    const idx = schedule.findIndex((d) => d.date === '2026-11-07')
    schedule[idx] = {
      ...schedule[idx],
      kind: 'scheduled',
      hours: { start: '10:00', end: '19:00' },
    }

    const baseInput = {
      month: '2026-11',
      today: '2026-11-22',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [monthly2200],
      scheduleDays: schedule,
      approvedLeaves: [],
      sessions: [
        {
          id: 's1',
          workDate: '2026-11-21',
          timezone: TZ,
          startedAt: tbilisi('2026-11-21', '10:00'),
          endedAt: tbilisi('2026-11-21', '14:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
        {
          id: 's2',
          workDate: '2026-11-21',
          timezone: TZ,
          startedAt: tbilisi('2026-11-21', '15:00'),
          endedAt: tbilisi('2026-11-21', '19:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
      ],
      decisionsByKey: new Map(),
    }

    const disabled = evaluateAttendancePayrollMonth({
      ...baseInput,
      restDayPolicyTimeline: [],
    })
    expect(disabled.autoBonusMinor).toBe(0)
    expect(
      disabled.items.filter((i) => i.itemKind === 'fixed_rest_day_bonus'),
    ).toHaveLength(0)

    const enabled = evaluateAttendancePayrollMonth({
      ...baseInput,
      restDayPolicyTimeline: [
        {
          version: 1,
          effectiveFrom: '2026-11-20',
          restDayClockInAllowed: true,
          autoRestDayBonusEnabled: true,
        },
      ],
    })
    const bonuses = enabled.items.filter(
      (i) => i.itemKind === 'fixed_rest_day_bonus',
    )
    expect(bonuses).toHaveLength(1)
    expect(bonuses[0].effectiveAmountMinor).toBe(13000)
    expect(bonuses[0].reviewStatus).toBe('ready')
    expect(bonuses[0].note).toBe('დასვენების დღეს მუშაობის ბონუსი (2026-11-21)')
    expect(enabled.autoBonusMinor).toBe(13000)
  })

  it('applies Option 1A for short fixed rest-day shift (<4h): full 130% bonus + needs_review warning', () => {
    const schedule = buildMonthSchedule('2026-11')
    const result = evaluateAttendancePayrollMonth({
      month: '2026-11',
      today: '2026-11-22',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [monthly2200],
      scheduleDays: schedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [
        {
          version: 1,
          effectiveFrom: '2026-11-01',
          restDayClockInAllowed: true,
          autoRestDayBonusEnabled: true,
        },
      ],
      sessions: [
        {
          id: 'short-1',
          workDate: '2026-11-21',
          timezone: TZ,
          startedAt: tbilisi('2026-11-21', '10:00'),
          endedAt: tbilisi('2026-11-21', '12:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
      ],
      decisionsByKey: new Map(),
    })

    const bonus = result.items.find(
      (i) => i.itemKind === 'fixed_rest_day_bonus',
    )!
    expect(bonus.flags).toContain('short_rest_day_session')
    expect(bonus.reviewStatus).toBe('needs_review')
    expect(bonus.calculatedAmountMinor).toBe(
      calculateFixedRestDayBonusMinor(220000, result.scheduledWorkingDays),
    )
    expect(result.adjustmentsNeedsReviewCount).toBe(1)
  })

  it('flags missing scheduled days without approved leave and skips days with approved leave', () => {
    const schedule = buildMonthSchedule('2026-11')
    const result = evaluateAttendancePayrollMonth({
      month: '2026-11',
      today: '2026-11-04', // Past scheduled days in Nov 2026: 2026-11-02 (Mon) and 2026-11-03 (Tue)
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [monthly2200],
      scheduleDays: schedule,
      approvedLeaves: [
        { kind: 'vacation', startDate: '2026-11-03', endDate: '2026-11-03' },
      ],
      restDayPolicyTimeline: [],
      sessions: [],
      decisionsByKey: new Map(),
    })

    const missing = result.items.filter(
      (i) => i.itemKind === 'missing_scheduled_day',
    )
    expect(missing.map((m) => m.date)).toEqual(['2026-11-02'])
    expect(missing[0].effectiveAmountMinor).toBe(0)
    expect(result.salaryNeedsReviewCount).toBe(1)
  })

  it('evaluates hourly 10:00-21:00 (220 GEL), overnight 20:00-01:00 (112 GEL), and non-stacking rest-day 2h (52 GEL)', () => {
    const schedule = buildMonthSchedule('2026-11', {
      start: '10:00',
      end: '19:00',
    })
    const result = evaluateAttendancePayrollMonth({
      month: '2026-11',
      today: '2026-11-25',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [hourly20],
      scheduleDays: schedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [],
      sessions: [
        // 2026-11-16 (Mon): 10:00-21:00 = 11h @ 20 GEL = 220 GEL
        {
          id: 'h1',
          workDate: '2026-11-16',
          timezone: TZ,
          startedAt: tbilisi('2026-11-16', '10:00'),
          endedAt: tbilisi('2026-11-16', '21:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
        // 2026-11-18 20:00 -> 2026-11-19 01:00: 1h@1.0 + 3h@1.1 + 1h@1.3 = 20 + 66 + 26 = 112 GEL
        {
          id: 'h2',
          workDate: '2026-11-18',
          timezone: TZ,
          startedAt: tbilisi('2026-11-18', '20:00'),
          endedAt: tbilisi('2026-11-19', '01:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
        // 2026-11-21 (Sat rest day): 00:00-02:00 = 2h @ 1.30x non-stacking = 52 GEL
        {
          id: 'h3',
          workDate: '2026-11-21',
          timezone: TZ,
          startedAt: tbilisi('2026-11-21', '00:00'),
          endedAt: tbilisi('2026-11-21', '02:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
      ],
      decisionsByKey: new Map(),
    })

    const byDate = new Map(result.items.map((i) => [i.date, i]))
    expect(byDate.get('2026-11-16')?.effectiveAmountMinor).toBe(22000)
    expect(byDate.get('2026-11-16')?.reviewStatus).toBe('ready')
    // 2026-11-18 has 20:00-21:00 (20 GEL) + 21:00-00:00 (66 GEL) = 86 GEL
    expect(byDate.get('2026-11-18')?.effectiveAmountMinor).toBe(8600)
    // 2026-11-19 has 00:00-01:00 (26 GEL)
    expect(byDate.get('2026-11-19')?.effectiveAmountMinor).toBe(2600)
    // Rest day 00:00-02:00 = 52 GEL (single 30%, no stacking)
    expect(byDate.get('2026-11-21')?.effectiveAmountMinor).toBe(5200)
    expect(result.hourlyCalculatedMinor).toBe(22000 + 8600 + 2600 + 5200)
    expect(result.salaryNeedsReviewCount).toBe(0)
  })

  it('flags daytime hours beyond scheduled + 2h for HR review while pricing at 1.00x', () => {
    const schedule = buildMonthSchedule('2026-11', {
      start: '10:00',
      end: '18:00', // 8h schedule -> allowance is 10h
    })
    const result = evaluateAttendancePayrollMonth({
      month: '2026-11',
      today: '2026-11-20',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [hourly20],
      scheduleDays: schedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [],
      sessions: [
        {
          id: 'long-day',
          workDate: '2026-11-16',
          timezone: TZ,
          startedAt: tbilisi('2026-11-16', '10:00'),
          endedAt: tbilisi('2026-11-16', '21:00'), // 11h daytime -> 1h excess
          autoClosedAt: null,
          reviewState: 'approved',
        },
      ],
      decisionsByKey: new Map(),
    })

    const item = result.items[0]
    expect(item.flags).toContain('excess_daytime_hours')
    expect(item.reviewStatus).toBe('needs_review')
    expect(item.calculatedAmountMinor).toBe(22000)
  })

  it('prices GPS job visits once with +20 min once per job per day and excludes linked GPS sessions from double counting', () => {
    const schedule = buildMonthSchedule('2026-11')
    const result = evaluateAttendancePayrollMonth({
      month: '2026-11',
      today: '2026-11-25',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [hourly20],
      scheduleDays: schedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [],
      sessions: [
        {
          id: 'gps-s1',
          workDate: '2026-11-17',
          timezone: TZ,
          startedAt: tbilisi('2026-11-17', '11:00'),
          endedAt: tbilisi('2026-11-17', '13:00'),
          autoClosedAt: null,
          reviewState: 'approved',
          gpsVisitId: 'v1',
        },
      ],
      gpsVisits: [
        {
          visitId: 'v1',
          jobId: 'job-1',
          jobTitle: 'ბანერის მონტაჟი',
          workDate: '2026-11-17',
          confirmedEntryAt: tbilisi('2026-11-17', '11:00'),
          confirmedExitAt: tbilisi('2026-11-17', '13:00'),
          onSiteSeconds: 7200,
          status: 'completed',
          attendanceSessionId: 'gps-s1',
        },
        // Same job, same day second visit: no duplicate +20 min allowance!
        {
          visitId: 'v2',
          jobId: 'job-1',
          jobTitle: 'ბანერის მონტაჟი',
          workDate: '2026-11-17',
          confirmedEntryAt: tbilisi('2026-11-17', '15:00'),
          confirmedExitAt: tbilisi('2026-11-17', '16:00'),
          onSiteSeconds: 3600,
          status: 'completed',
        },
      ],
      decisionsByKey: new Map(),
    })

    expect(result.items).toHaveLength(2)
    expect(result.items[0].effectiveAmountMinor).toBe(6067) // 2h20m * 20 * 1.30
    expect(result.items[0].formula.allowanceMinutes).toBe(20)
    expect(result.items[1].effectiveAmountMinor).toBe(2600) // 1h00m * 20 * 1.30 (no second +20m)
    expect(result.items[1].formula.allowanceMinutes).toBe(0)
    expect(result.hourlyCalculatedMinor).toBe(6067 + 2600)
  })

  it('detects stale HR overrides when underlying attendance changes', () => {
    const schedule = buildMonthSchedule('2026-11')
    const first = evaluateAttendancePayrollMonth({
      month: '2026-11',
      today: '2026-11-22',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [monthly2200],
      scheduleDays: schedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [
        {
          version: 1,
          effectiveFrom: '2026-11-01',
          restDayClockInAllowed: true,
          autoRestDayBonusEnabled: true,
        },
      ],
      sessions: [
        {
          id: 's1',
          workDate: '2026-11-21',
          timezone: TZ,
          startedAt: tbilisi('2026-11-21', '10:00'),
          endedAt: tbilisi('2026-11-21', '12:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
      ],
      decisionsByKey: new Map(),
    })
    const bonus = first.items.find((i) => i.itemKind === 'fixed_rest_day_bonus')!

    // Valid override matches sourceHash -> ready/overridden with 90 GEL
    const overridden = evaluateAttendancePayrollMonth({
      month: '2026-11',
      today: '2026-11-22',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [monthly2200],
      scheduleDays: schedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [
        {
          version: 1,
          effectiveFrom: '2026-11-01',
          restDayClockInAllowed: true,
          autoRestDayBonusEnabled: true,
        },
      ],
      sessions: [
        {
          id: 's1',
          workDate: '2026-11-21',
          timezone: TZ,
          startedAt: tbilisi('2026-11-21', '10:00'),
          endedAt: tbilisi('2026-11-21', '12:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
      ],
      decisionsByKey: new Map([
        [
          bonus.itemKey,
          {
            version: 1,
            action: 'overridden',
            sourceHash: bonus.sourceHash,
            calculatedSeconds: 7200,
            overrideSeconds: 7200,
            calculatedAmountMinor: bonus.calculatedAmountMinor,
            overrideAmountMinor: 9000,
            note: '',
            reason: 'შემცირდა 2-საათიანი ვიზიტის გამო',
            actorName: 'HR მენეჯერი',
            recordedAt: '2026-11-22T10:00:00.000Z',
          },
        ],
      ]),
    })
    expect(overridden.autoBonusMinor).toBe(9000)
    expect(overridden.adjustmentsNeedsReviewCount).toBe(0)

    // Session later edited to 16:00 -> sourceHash changes -> flagged stale_override!
    const stale = evaluateAttendancePayrollMonth({
      month: '2026-11',
      today: '2026-11-22',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [monthly2200],
      scheduleDays: schedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [
        {
          version: 1,
          effectiveFrom: '2026-11-01',
          restDayClockInAllowed: true,
          autoRestDayBonusEnabled: true,
        },
      ],
      sessions: [
        {
          id: 's1',
          workDate: '2026-11-21',
          timezone: TZ,
          startedAt: tbilisi('2026-11-21', '10:00'),
          endedAt: tbilisi('2026-11-21', '16:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
      ],
      decisionsByKey: new Map([
        [
          bonus.itemKey,
          {
            version: 1,
            action: 'overridden',
            sourceHash: bonus.sourceHash,
            calculatedSeconds: 7200,
            overrideSeconds: 7200,
            calculatedAmountMinor: bonus.calculatedAmountMinor,
            overrideAmountMinor: 9000,
            note: '',
            reason: 'შემცირდა 2-საათიანი ვიზიტის გამო',
            actorName: 'HR მენეჯერი',
            recordedAt: '2026-11-22T10:00:00.000Z',
          },
        ],
      ]),
    })
    const staleItem = stale.items.find(
      (i) => i.itemKind === 'fixed_rest_day_bonus',
    )!
    expect(staleItem.flags).toContain('stale_override')
    expect(staleItem.reviewStatus).toBe('needs_review')
    expect(stale.adjustmentsNeedsReviewCount).toBe(1)
  })

  it('prorates Fixed -> Hourly mid-month transitions on Dec 9 by scheduled working days and splits first/second half cleanly', () => {
    // December 2026 has 23 weekdays: Dec 1-8 has 6 weekdays, Dec 9-31 has 17 weekdays.
    expect(calculateProratedFixedMinor(230000, 6, 23)).toBe(60000)
    expect(calculateProratedFixedMinor(230000, 17, 23)).toBe(170000)

    const schedule = buildMonthSchedule('2026-12')
    const fixed2300: SalaryTerm = {
      version: 1,
      effectiveFrom: '2026-01-01',
      kind: 'monthly',
      amountBasis: 'net',
      amountMinor: 230000,
      currency: 'GEL',
    }
    const hourlyDec9: SalaryTerm = {
      version: 2,
      effectiveFrom: '2026-12-09',
      kind: 'hourly',
      amountBasis: 'net',
      amountMinor: 2000,
      currency: 'GEL',
    }

    // Attended all 6 fixed scheduled days (Dec 1-4, 7-8) + hourly sessions on Dec 10 (8h) and Dec 18 (8h)
    const fixedDates = [
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-07',
      '2026-12-08',
    ]
    const result = evaluateAttendancePayrollMonth({
      month: '2026-12',
      today: '2026-12-31',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [fixed2300, hourlyDec9],
      scheduleDays: schedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [],
      sessions: [
        ...fixedDates.map((d, idx) => ({
          id: `f-${idx}`,
          workDate: d,
          timezone: TZ,
          startedAt: tbilisi(d, '10:00'),
          endedAt: tbilisi(d, '19:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        })),
        {
          id: 'h-first',
          workDate: '2026-12-10',
          timezone: TZ,
          startedAt: tbilisi('2026-12-10', '10:00'),
          endedAt: tbilisi('2026-12-10', '18:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
        {
          id: 'h-second',
          workDate: '2026-12-18',
          timezone: TZ,
          startedAt: tbilisi('2026-12-18', '10:00'),
          endedAt: tbilisi('2026-12-18', '18:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
      ],
      decisionsByKey: new Map(),
    })

    expect(result.hasMixedSalaryKinds).toBe(true)
    expect(result.fixedProrationComplete).toBe(true)
    expect(result.scheduledWorkingDays).toBe(23)
    expect(result.proratedFixedMinor).toBe(60000)
    expect(result.firstHalfProratedFixedMinor).toBe(60000)
    expect(result.hourlyCalculatedMinor).toBe(32000)
    expect(result.firstHalfHourlyMinor).toBe(16000)
    expect(result.salaryNeedsReviewCount).toBe(0)
    expect(result.fixedProrationSegments).toEqual([
      {
        version: 1,
        startDate: '2026-12-01',
        endDate: '2026-12-08',
        monthlySalaryMinor: 230000,
        coveredWorkingDays: 6,
        firstHalfCoveredWorkingDays: 6,
        totalWorkingDays: 23,
        amountMinor: 60000,
        firstHalfAmountMinor: 60000,
      },
    ])
  })

  it('prorates Hourly -> Fixed mid-month transitions on Dec 9 symmetrically and falls back when schedule has gaps', () => {
    const schedule = buildMonthSchedule('2026-12')
    const hourlyStart: SalaryTerm = {
      version: 1,
      effectiveFrom: '2026-01-01',
      kind: 'hourly',
      amountBasis: 'net',
      amountMinor: 2000,
      currency: 'GEL',
    }
    const fixedDec9: SalaryTerm = {
      version: 2,
      effectiveFrom: '2026-12-09',
      kind: 'monthly',
      amountBasis: 'net',
      amountMinor: 230000,
      currency: 'GEL',
    }

    const result = evaluateAttendancePayrollMonth({
      month: '2026-12',
      today: '2026-12-09',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [hourlyStart, fixedDec9],
      scheduleDays: schedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [],
      sessions: [
        {
          id: 'h-early',
          workDate: '2026-12-03',
          timezone: TZ,
          startedAt: tbilisi('2026-12-03', '10:00'),
          endedAt: tbilisi('2026-12-03', '18:00'),
          autoClosedAt: null,
          reviewState: 'approved',
        },
      ],
      decisionsByKey: new Map(),
    })

    expect(result.hasMixedSalaryKinds).toBe(true)
    expect(result.fixedProrationComplete).toBe(true)
    // Dec 9-31 has 17 weekdays total, 5 weekdays in Dec 9-15
    expect(result.proratedFixedMinor).toBe(170000)
    expect(result.firstHalfProratedFixedMinor).toBe(50000)
    expect(result.hourlyCalculatedMinor).toBe(16000)
    expect(result.firstHalfHourlyMinor).toBe(16000)
    expect(result.salaryNeedsReviewCount).toBe(0)

    // Schedule gap disables automatic proration safely
    const gappedSchedule = schedule.map((day, idx) =>
      idx === 0 ? { ...day, kind: 'unknown_history' as const, hours: null } : day,
    )
    const gapped = evaluateAttendancePayrollMonth({
      month: '2026-12',
      today: '2026-12-09',
      timezone: TZ,
      employmentPeriods: [{ startDate: '2026-01-01', endDate: null }],
      employmentConfirmed: true,
      salaryTerms: [hourlyStart, fixedDec9],
      scheduleDays: gappedSchedule,
      approvedLeaves: [],
      restDayPolicyTimeline: [],
      sessions: [],
      decisionsByKey: new Map(),
    })
    expect(gapped.hasMixedSalaryKinds).toBe(true)
    expect(gapped.fixedProrationComplete).toBe(false)
    expect(gapped.proratedFixedMinor).toBe(0)
  })
})
