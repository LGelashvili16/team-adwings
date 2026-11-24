import '@tanstack/react-start/server-only'
import { desc, eq, sql } from 'drizzle-orm'
import { employee, employeeScheduleVersion } from '#/db/schema'
import type { ScheduleTransaction } from './scheduling.repository.server'
import type {
  employeeScheduleRangeSchema,
  scheduleRangeSchema,
} from '../scheduling.schemas'
import type { z } from 'zod'

export async function appendEmployeeSchedule(
  tx: ScheduleTransaction,
  data: Omit<
    typeof employeeScheduleVersion.$inferInsert,
    'version' | 'createdAt'
  >,
) {
  // The employee row exists before the first version and also serializes current-state assignment changes.
  const person = (
    await tx
      .select({ id: employee.id })
      .from(employee)
      .where(eq(employee.id, data.employeeId))
      .for('update')
  ).at(0)
  if (!person)
    throw new Error('Employee schedule history requires an existing employee')
  const latest = (
    await tx
      .select({ version: employeeScheduleVersion.version })
      .from(employeeScheduleVersion)
      .where(eq(employeeScheduleVersion.employeeId, data.employeeId))
      .orderBy(desc(employeeScheduleVersion.version))
      .limit(1)
  ).at(0)
  await tx
    .insert(employeeScheduleVersion)
    .values({ ...data, version: (latest?.version ?? 0) + 1 })
}

export type ScheduleHistoryDayRow = {
  date: string
  employee_version: number | null
  history_days: unknown
  company_effective_from: string | null
  timezone: string | null
  company_start: string | null
  company_end: string | null
  company_day_configured: boolean
}

/** One bounded SQL snapshot resolves all dates, including explicit inheritance decisions. No per-day queries or mutable current assignments are used. */
export async function readEmployeeScheduleDates(
  tx: ScheduleTransaction,
  {
    employeeId,
    startDate,
    endDate,
  }: z.infer<typeof employeeScheduleRangeSchema>,
) {
  const result = await tx.execute<ScheduleHistoryDayRow>(sql`
    select dates.day::text as date,
      assignment.version as employee_version, assignment.days as history_days,
      company.effective_from::text as company_effective_from, company.timezone,
      to_char(weekday.start_time, 'HH24:MI') as company_start,
      to_char(weekday.end_time, 'HH24:MI') as company_end,
      weekday.weekday is not null as company_day_configured
    from (select ${startDate}::date + day_number as day
      from generate_series(0, ${endDate}::date - ${startDate}::date) calendar(day_number)) dates
    left join lateral (
      select version, days from employee_schedule_version
      where employee_id = ${employeeId}::uuid and effective_from <= dates.day
      order by effective_from desc, version desc limit 1
    ) assignment on true
    left join lateral (
      select effective_from, timezone from company_schedule
      where effective_from <= dates.day order by effective_from desc limit 1
    ) company on true
    left join company_schedule_day weekday
      on weekday.effective_from = company.effective_from and weekday.weekday = extract(isodow from dates.day)::int
    order by dates.day
  `)
  return result.rows
}

export async function readCompanyScheduleDates(
  tx: ScheduleTransaction,
  { startDate, endDate }: z.infer<typeof scheduleRangeSchema>,
) {
  return (
    await tx.execute<
      Omit<ScheduleHistoryDayRow, 'employee_version' | 'history_days'>
    >(sql`
    select dates.day::text as date, company.effective_from::text as company_effective_from,
      company.timezone, to_char(weekday.start_time,'HH24:MI') as company_start,
      to_char(weekday.end_time,'HH24:MI') as company_end, weekday.weekday is not null as company_day_configured
    from (select ${startDate}::date + day_number as day
      from generate_series(0, ${endDate}::date - ${startDate}::date) calendar(day_number)) dates
    left join lateral (select effective_from,timezone from company_schedule
      where effective_from <= dates.day order by effective_from desc limit 1) company on true
    left join company_schedule_day weekday on weekday.effective_from = company.effective_from
      and weekday.weekday = extract(isodow from dates.day)::int order by dates.day
  `)
  ).rows
}
