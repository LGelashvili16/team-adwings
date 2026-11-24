import type { EmployeeScheduleDay } from '#/features/scheduling/scheduling.types'

export type CalendarException = {
  revision: number
  date: string
  kind: 'working' | 'day_off' | 'inherit'
  hours: { start: string; end: string } | null
}
export type CalendarLeave = {
  id: string
  kind: 'day_off' | 'vacation' | 'sick_leave'
  status: 'pending' | 'approved'
  revision: number
}
export type PayrollCalendarDay = Omit<EmployeeScheduleDay, 'source'> & {
  source:
    | EmployeeScheduleDay['source']
    | 'company_exception'
    | 'employee_exception'
    | 'holiday'
  statutoryHoliday: boolean
  legalCalendarKnown: boolean
  holidayWorkReview: boolean
  leaveReview: boolean
  companyException: CalendarException | null
  employeeException: CalendarException | null
  leaves: CalendarLeave[]
}
export type CalendarPerson = {
  userId: string
  name: string
  username: string | null
  jobTitle: string | null
}
export type CalendarHistoryEntry = CalendarException & {
  actorName: string
  reason: string
  recordedAt: string
  previousRevision: number | null
}
export type PayrollCalendarView = {
  holidayRuleVersion: string
  revision: number
  today: string
  month: string
  timezone: string
  person: CalendarPerson | null
  days: PayrollCalendarDay[]
  history: CalendarHistoryEntry[]
  historyTotal: number
  historyPageSize: number
}
