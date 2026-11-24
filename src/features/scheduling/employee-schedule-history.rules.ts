import { employeeWorkingWeekSchema } from './scheduling.schemas'
import type { EmployeeScheduleDay } from './scheduling.types'

/** Interpret retained daily reference facts without ever falling back to today's assignment. */
export function historicalScheduleDay(row: {
  date: string
  employee_version: number | null
  history_days: unknown
  company_effective_from: string | null
  timezone: string | null
  company_start: string | null
  company_end: string | null
  company_day_configured: boolean
}): EmployeeScheduleDay {
  const base = {
    date: row.date,
    employeeVersion: row.employee_version,
    companyEffectiveFrom: row.company_effective_from,
    timezone: row.timezone,
    hours: null,
  }
  if (row.employee_version === null)
    return { ...base, kind: 'unknown_history', source: null }
  const source = row.history_days === null ? 'company' : 'individual'
  if (row.company_effective_from === null)
    return { ...base, kind: 'unconfigured', source }
  if (row.history_days === null)
    return {
      ...historicalCompanyScheduleDay(row),
      employeeVersion: row.employee_version,
    }
  const week = employeeWorkingWeekSchema.safeParse(row.history_days)
  if (!week.success) return { ...base, kind: 'unconfigured', source }
  const weekday = new Date(`${row.date}T12:00:00Z`).getUTCDay() || 7
  const hours = week.data.find((day) => day.weekday === weekday)?.hours ?? null
  return { ...base, kind: hours ? 'scheduled' : 'day_off', source, hours }
}

/** Company references have no employee assignment version and never manufacture one. */
export function historicalCompanyScheduleDay(row: {
  date: string
  company_effective_from: string | null
  timezone: string | null
  company_start: string | null
  company_end: string | null
  company_day_configured: boolean
}): EmployeeScheduleDay {
  const base = {
    date: row.date,
    source: 'company' as const,
    employeeVersion: null,
    companyEffectiveFrom: row.company_effective_from,
    timezone: row.timezone,
    hours: null,
  }
  if (row.company_effective_from === null || !row.company_day_configured)
    return { ...base, kind: 'unconfigured' }
  if (row.company_start === null && row.company_end === null)
    return { ...base, kind: 'day_off' }
  if (
    !row.company_start ||
    !row.company_end ||
    row.company_end <= row.company_start
  )
    return { ...base, kind: 'unconfigured' }
  return {
    ...base,
    kind: 'scheduled',
    hours: { start: row.company_start, end: row.company_end },
  }
}
