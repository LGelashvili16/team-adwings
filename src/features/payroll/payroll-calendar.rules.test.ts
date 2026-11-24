import { describe, expect, it } from 'vitest'
import {
  resolvePayrollCalendarDay,
  calendarMonthRange,
} from './payroll-calendar.rules'
import {
  payrollCalendarRangeSchema,
  saveCalendarExceptionSchema,
} from './payroll-calendar.schemas'
import { georgianPublicHolidays } from '#/features/scheduling/georgian-holidays.rules'
import type { EmployeeScheduleDay } from '#/features/scheduling/scheduling.types'
import type { CalendarException } from './payroll-calendar.types'

const base: EmployeeScheduleDay = {
  date: '2026-11-25',
  kind: 'scheduled',
  source: 'company',
  hours: { start: '10:00', end: '19:00' },
  employeeVersion: 1,
  companyEffectiveFrom: '2026-01-01',
  timezone: 'Asia/Tbilisi',
}
const working: CalendarException = {
  revision: 2,
  date: base.date,
  kind: 'working',
  hours: { start: '08:00', end: '16:00' },
}
const rest: CalendarException = {
  revision: 1,
  date: base.date,
  kind: 'day_off',
  hours: null,
}
describe('payroll calendar precedence and safe reference states', () => {
  it('applies employee exceptions before company exceptions, holidays and recurring schedules', () => {
    expect(resolvePayrollCalendarDay(base, false, rest, working)).toMatchObject(
      { kind: 'scheduled', source: 'employee_exception', hours: working.hours },
    )
    expect(resolvePayrollCalendarDay(base, false, rest, null)).toMatchObject({
      kind: 'day_off',
      source: 'company_exception',
      hours: null,
    })
    expect(resolvePayrollCalendarDay(base, false, null, null)).toMatchObject({
      kind: 'scheduled',
      source: 'company',
    })
  })
  it('restores inherited rules while retaining the original statutory holiday marker', () => {
    const inherit: CalendarException = { ...rest, revision: 3, kind: 'inherit' }
    expect(
      resolvePayrollCalendarDay(base, true, working, inherit),
    ).toMatchObject({
      source: 'company_exception',
      kind: 'scheduled',
      statutoryHoliday: true,
      holidayWorkReview: true,
    })
    expect(
      resolvePayrollCalendarDay(base, true, inherit, inherit),
    ).toMatchObject({
      source: 'holiday',
      kind: 'day_off',
      statutoryHoliday: true,
      hours: null,
    })
  })
  it.each(['unknown_history', 'unconfigured'] as const)(
    'does not fabricate a known schedule for %s',
    (kind) => {
      expect(
        resolvePayrollCalendarDay(
          { ...base, kind, hours: null },
          true,
          working,
          working,
        ),
      ).toMatchObject({
        kind,
        hours: null,
        statutoryHoliday: true,
        holidayWorkReview: false,
      })
    },
  )
  it('keeps pending/approved leave facts separate from expected work and preserves the reference date', () => {
    const day = resolvePayrollCalendarDay(base, false, null, null, [
      { id: 'request', kind: 'sick_leave', status: 'pending', revision: 1 },
    ])
    expect(day).toMatchObject({
      date: base.date,
      kind: 'scheduled',
      hours: base.hours,
      leaveReview: true,
    })
    expect(
      resolvePayrollCalendarDay(base, false, null, null, [
        { id: 'request', kind: 'vacation', status: 'approved', revision: 2 },
      ]),
    ).toMatchObject({ kind: 'scheduled', leaveReview: false })
  })
  it('uses the same fixed and movable Georgian holidays as leave allowance calculations', () => {
    for (const date of [
      '2026-01-01',
      '2026-04-10',
      '2026-04-11',
      '2026-04-12',
      '2026-04-13',
      '2026-05-17',
      '2026-11-23',
    ])
      expect(georgianPublicHolidays(2026).has(date)).toBe(true)
    expect(georgianPublicHolidays(2027).has('2027-05-02')).toBe(true)
    expect(calendarMonthRange('2028-02')).toEqual({
      startDate: '2028-02-01',
      endDate: '2028-02-29',
    })
  })
  it('blocks financial conclusions when historical statutory coverage is unverified', () => {
    expect(
      resolvePayrollCalendarDay(
        { ...base, date: '2024-05-17' },
        false,
        working,
        null,
        [],
        false,
      ),
    ).toMatchObject({
      kind: 'unconfigured',
      hours: null,
      legalCalendarKnown: false,
      statutoryHoliday: false,
    })
  })
  it('validates date boundaries, bounded ranges and exact working-hour facts', () => {
    const input = {
      userId: null,
      date: base.date,
      kind: 'working',
      hours: working.hours,
      expectedRevision: 0,
      reason: 'დადასტურებული საფუძველი',
    }
    expect(saveCalendarExceptionSchema.safeParse(input).success).toBe(true)
    for (const extra of [
      { actorId: 'admin' },
      { date: '1999-12-31' },
      { date: '2026-02-30' },
      { kind: 'day_off' },
      { hours: null },
      { hours: { start: '23:00', end: '02:00' } },
      { reason: '' },
    ])
      expect(
        saveCalendarExceptionSchema.safeParse({ ...input, ...extra }).success,
      ).toBe(false)
    const range = {
      employeeId: '019ab984-7000-7000-8000-000000000001',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
    }
    expect(payrollCalendarRangeSchema.safeParse(range).success).toBe(true)
    expect(
      payrollCalendarRangeSchema.safeParse({ ...range, endDate: '2027-01-02' })
        .success,
    ).toBe(false)
  })
})
