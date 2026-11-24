import { describe, expect, it } from 'vitest'
import { historicalScheduleDay } from './employee-schedule-history.rules'
import { employeeScheduleRangeSchema } from './scheduling.schemas'

const row = {
  date: '2026-11-25',
  employee_version: 1,
  history_days: null,
  company_effective_from: '2026-01-01',
  timezone: 'Asia/Tbilisi',
  company_start: '10:00',
  company_end: '19:00',
  company_day_configured: true,
}

describe('historical employee schedule interpretation', () => {
  it('distinguishes unknown history from an explicit company-default decision', () => {
    expect(
      historicalScheduleDay({ ...row, employee_version: null }),
    ).toMatchObject({ kind: 'unknown_history', source: null, hours: null })
    expect(historicalScheduleDay(row)).toMatchObject({
      kind: 'scheduled',
      source: 'company',
      hours: { start: '10:00', end: '19:00' },
    })
  })
  it('does not mistake incomplete configuration for a day off', () => {
    expect(
      historicalScheduleDay({ ...row, company_effective_from: null }),
    ).toMatchObject({ kind: 'unconfigured' })
    expect(
      historicalScheduleDay({
        ...row,
        company_day_configured: false,
        company_start: null,
        company_end: null,
      }),
    ).toMatchObject({ kind: 'unconfigured' })
    expect(
      historicalScheduleDay({ ...row, company_start: null, company_end: null }),
    ).toMatchObject({ kind: 'day_off' })
    expect(
      historicalScheduleDay({ ...row, company_start: '20:00' }),
    ).toMatchObject({ kind: 'unconfigured' })
  })
  it('uses retained individual weekdays and rejects corrupt weeks instead of guessing', () => {
    const days = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      hours: index === 2 ? { start: '09:00', end: '17:00' } : null,
    }))
    expect(historicalScheduleDay({ ...row, history_days: days })).toMatchObject(
      { source: 'individual', kind: 'scheduled', hours: days[2].hours },
    )
    expect(
      historicalScheduleDay({ ...row, date: '2026-11-26', history_days: days }),
    ).toMatchObject({ kind: 'day_off', source: 'individual' })
    expect(historicalScheduleDay({ ...row, history_days: [] })).toMatchObject({
      kind: 'unconfigured',
      source: 'individual',
    })
  })
  it('bounds calendar reads and validates identifiers and real date-only ranges', () => {
    const input = {
      employeeId: '019ab984-7000-7000-8000-000000000001',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
    }
    expect(employeeScheduleRangeSchema.safeParse(input).success).toBe(true)
    for (const changes of [
      { employeeId: 'other' },
      { endDate: '2027-01-02' },
      { endDate: '2025-12-31' },
      { startDate: '2026-02-30' },
    ])
      expect(
        employeeScheduleRangeSchema.safeParse({ ...input, ...changes }).success,
      ).toBe(false)
  })
})
