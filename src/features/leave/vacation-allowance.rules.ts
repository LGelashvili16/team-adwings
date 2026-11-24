import { georgianPublicHolidays } from '#/features/scheduling/georgian-holidays.rules'

export { georgianPublicHolidays } from '#/features/scheduling/georgian-holidays.rules'

export function availableVacationDays(
  row: {
    vacationAnnualDays: number
    vacationRemainingDays: number
    vacationPeriodYear: number
  },
  year: number,
) {
  return (
    row.vacationRemainingDays +
    Math.max(0, year - row.vacationPeriodYear) * row.vacationAnnualDays
  )
}

export function chargeableVacationDays(
  days: Array<{ date: string; working: boolean }>,
) {
  const calendars = new Map<number, Set<string>>()
  return days.filter(({ date, working }) => {
    if (!working) return false
    const year = Number(date.slice(0, 4))
    let holidays = calendars.get(year)
    if (!holidays) {
      holidays = georgianPublicHolidays(year)
      calendars.set(year, holidays)
    }
    return !holidays.has(date)
  }).length
}
