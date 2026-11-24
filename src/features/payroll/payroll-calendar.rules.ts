import type { EmployeeScheduleDay } from '#/features/scheduling/scheduling.types'
import type {
  CalendarException,
  CalendarLeave,
  PayrollCalendarDay,
} from './payroll-calendar.types'

/** Unknown schedules block conclusions; an exception never manufactures an employee's missing baseline. */
export function resolvePayrollCalendarDay(
  base: EmployeeScheduleDay,
  statutoryHoliday: boolean,
  companyException: CalendarException | null,
  employeeException: CalendarException | null,
  leaves: CalendarLeave[] = [],
  legalCalendarKnown = true,
): PayrollCalendarDay {
  const result: PayrollCalendarDay = {
    ...base,
    statutoryHoliday: legalCalendarKnown && statutoryHoliday,
    legalCalendarKnown,
    companyException,
    employeeException,
    leaves,
    holidayWorkReview: false,
    leaveReview: leaves.some((leave) => leave.status === 'pending'),
  }
  if (base.kind === 'unknown_history' || base.kind === 'unconfigured')
    return result
  if (!legalCalendarKnown)
    return {
      ...result,
      kind: 'unconfigured',
      source: null,
      hours: null,
      statutoryHoliday: false,
    }
  const specific =
    employeeException?.kind !== 'inherit' ? employeeException : null
  const company = companyException?.kind !== 'inherit' ? companyException : null
  const applied = specific ?? company
  if (applied)
    return {
      ...result,
      kind: applied.kind === 'working' ? 'scheduled' : 'day_off',
      hours: applied.hours,
      source: specific ? 'employee_exception' : 'company_exception',
      holidayWorkReview: statutoryHoliday && applied.kind === 'working',
    }
  if (statutoryHoliday)
    return { ...result, kind: 'day_off', hours: null, source: 'holiday' }
  return result
}
export function calendarMonthRange(month: string) {
  const [year, number] = month.split('-').map(Number)
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}`,
  }
}
