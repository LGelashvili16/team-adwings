import type { CompanySchedule } from './scheduling.schemas'

export type CompanyWorkday = {
  date: string
  timezone: string
  kind: 'scheduled' | 'day_off' | 'unconfigured'
  effectiveFrom: string | null
  start: string | null
  end: string | null
  startsAt: string | null
  endsAt: string | null
}

export type WorkingWeek = CompanySchedule['days']

/** Daily reference facts for historical calculations. Missing retained history is distinct from a known company-default assignment and a known day off. */
export type EmployeeScheduleDay = {
  date: string
  kind: CompanyWorkday['kind'] | 'unknown_history'
  source: 'company' | 'individual' | null
  employeeVersion: number | null
  companyEffectiveFrom: string | null
  timezone: string | null
  hours: { start: string; end: string } | null
}

/** The signed-in employee's effective recurring week. `none` means no company week exists yet or the stored week is unusable. */
export type OwnSchedule = {
  source: 'individual' | 'company' | 'none'
  week: WorkingWeek | null
  timezone: string
  /** Company-local calendar date, so "today" never depends on the browser's timezone. */
  today: string
}

export type ScheduleSettings = {
  current: CompanySchedule | null
  latest: CompanySchedule | null
  upcoming: Array<CompanySchedule>
  hasMoreUpcoming: boolean
  today: string
  minimumEffectiveFrom: string
  timezone: string | null
}
