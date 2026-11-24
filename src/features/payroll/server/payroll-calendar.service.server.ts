import '@tanstack/react-start/server-only'
import { assertPermissions } from '#/lib/authorization/access'
import { currentAuthorization } from '#/lib/authorization/permissions'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  getCompanyWorkday,
  getHistoricalCompanySchedule,
  getHistoricalEmployeeSchedule,
} from '#/features/scheduling/server/scheduling.service.server'
import {
  georgianPublicHolidays,
  GEORGIAN_HOLIDAY_RULE_VERSION,
  GEORGIAN_HOLIDAY_CALENDAR_FROM,
} from '#/features/scheduling/georgian-holidays.rules'
import {
  calendarPeopleSchema,
  payrollCalendarRangeSchema,
  payrollCalendarSearchSchema,
  saveCalendarExceptionSchema,
} from '../payroll-calendar.schemas'
import {
  calendarMonthRange,
  resolvePayrollCalendarDay,
} from '../payroll-calendar.rules'
import { currentAccount } from './payroll-settings.repository.server'
import * as repository from './payroll-calendar.repository.server'
import type { Actor } from '#/lib/authorization/actor'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { EmployeeScheduleDay } from '#/features/scheduling/scheduling.types'
import type { PayrollCalendarView } from '../payroll-calendar.types'

export class PayrollCalendarError extends Error {}
async function authorize(
  tx: PayrollTransaction,
  actor: Actor | null,
  employeeScope = false,
) {
  if (!actor) throw new AuthorizationError()
  const { account, person } = await currentAccount(tx, actor.id)
  if (!account || account.state !== 'active' || person?.status === 'inactive')
    throw new AuthorizationError()
  const current = { ...actor, ...currentAuthorization(account) }
  assertPermissions(current, ['manage.access', 'payroll.configure'])
  if (employeeScope) assertPermissions(current, ['payroll.read.all'])
  return current
}
async function resolveDays(
  tx: PayrollTransaction,
  employeeId: string | null,
  userId: string | null,
  base: EmployeeScheduleDay[],
  startDate: string,
  endDate: string,
) {
  const decisions = await repository.decisions(
    tx,
    employeeId,
    startDate,
    endDate,
  )
  const company = new Map(
    decisions
      .filter((row) => row.employeeId === null)
      .map((row) => [row.date, repository.exceptionFact(row)]),
  )
  const individual = new Map(
    decisions
      .filter((row) => row.employeeId !== null)
      .map((row) => [row.date, repository.exceptionFact(row)]),
  )
  const leaves = userId
    ? await repository.readLeaves(tx, userId, startDate, endDate)
    : []
  if (leaves.length > 1000)
    throw new PayrollCalendarError(
      'არყოფნის მონაცემები გადასამოწმებელია. გამოთვლა შეჩერებულია.',
    )
  const holidays = new Map<number, Set<string>>()
  return base.map((day) => {
    const year = Number(day.date.slice(0, 4))
    if (!holidays.has(year)) holidays.set(year, georgianPublicHolidays(year))
    const relevantLeaves = leaves
      .filter(
        (leave) =>
          leave.startDate <= day.date &&
          (leave.endDate === null || leave.endDate >= day.date),
      )
      .map((leave) => ({
        id: leave.id,
        kind: leave.kind,
        revision: leave.revision,
        status:
          leave.status === 'pending'
            ? ('pending' as const)
            : ('approved' as const),
      }))
    return resolvePayrollCalendarDay(
      day,
      day.date >= GEORGIAN_HOLIDAY_CALENDAR_FROM &&
        holidays.get(year)!.has(day.date),
      company.get(day.date) ?? null,
      individual.get(day.date) ?? null,
      relevantLeaves,
      day.date >= GEORGIAN_HOLIDAY_CALENDAR_FROM,
    )
  })
}
/** Private financial read. The caller authorizes the employee and owns a consistent transaction. No attendance or money is inferred here. */
export async function getPayrollCalendar(
  tx: PayrollTransaction,
  input: unknown,
) {
  const data = payrollCalendarRangeSchema.parse(input)
  const person = await repository.personByEmployeeId(tx, data.employeeId)
  if (!person) throw new PayrollCalendarError('თანამშრომელი ვერ მოიძებნა.')
  const base = await getHistoricalEmployeeSchedule(tx, data)
  return {
    holidayRuleVersion: GEORGIAN_HOLIDAY_RULE_VERSION,
    revision: await repository.revision(tx),
    days: await resolveDays(
      tx,
      data.employeeId,
      person.userId,
      base,
      data.startDate,
      data.endDate,
    ),
  }
}
export async function readPayrollCalendar(
  actor: Actor | null,
  input: unknown,
): Promise<PayrollCalendarView> {
  const data = payrollCalendarSearchSchema.parse(input)
  return repository.transactCalendar(
    async (tx) => {
      await authorize(tx, actor, data.userId !== null)
      const workday = await getCompanyWorkday(new Date(), tx)
      const month = data.month ?? workday.date.slice(0, 7)
      const { startDate, endDate } = calendarMonthRange(month)
      // Revalidate the company-derived default month as well as supplied URL input.
      payrollCalendarSearchSchema.parse({ ...data, month })
      const person = data.userId
        ? await repository.person(tx, data.userId)
        : null
      if (data.userId && !person)
        throw new PayrollCalendarError('თანამშრომელი ვერ მოიძებნა.')
      const base = person
        ? await getHistoricalEmployeeSchedule(tx, {
            employeeId: person.id,
            startDate,
            endDate,
          })
        : await getHistoricalCompanySchedule(tx, { startDate, endDate })
      const days = await resolveDays(
        tx,
        person?.id ?? null,
        person?.userId ?? null,
        base,
        startDate,
        endDate,
      )
      const history = await repository.history(
        tx,
        person?.id ?? null,
        startDate,
        endDate,
        data.historyPage,
        data.historyQ,
      )
      return {
        holidayRuleVersion: GEORGIAN_HOLIDAY_RULE_VERSION,
        revision: await repository.revision(tx),
        today: workday.date,
        month,
        timezone: workday.timezone,
        person: person
          ? {
              userId: person.userId,
              name: person.name,
              username: person.username,
              jobTitle: person.jobTitle,
            }
          : null,
        days,
        history: history.records.map((row) => ({
          ...repository.exceptionFact(row),
          actorName: row.actorName,
          reason: row.reason,
          recordedAt: row.createdAt.toISOString(),
          previousRevision: row.previousRevision,
        })),
        historyTotal: history.total,
        historyPageSize: repository.historyPageSize,
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function saveCalendarException(
  actor: Actor | null,
  input: unknown,
) {
  const data = saveCalendarExceptionSchema.parse(input)
  return repository.transactCalendar(async (tx) => {
    await repository.lockCalendar(tx)
    const current = await authorize(tx, actor, data.userId !== null)
    if (data.userId === current.id)
      throw new PayrollCalendarError(
        'საკუთარი კალენდრის გამონაკლისს ვერ შეცვლით. მიმართეთ სხვა უფლებამოსილ პირს.',
      )
    const revision = await repository.revision(tx)
    if (revision !== data.expectedRevision)
      throw new PayrollCalendarError(
        'კალენდარი შეიცვალა. განაახლეთ მონაცემები და გადაამოწმეთ გამონაკლისი.',
      )
    const person = data.userId ? await repository.person(tx, data.userId) : null
    if (data.userId && !person)
      throw new PayrollCalendarError('თანამშრომელი ვერ მოიძებნა.')
    if (data.kind === 'inherit') {
      const previous = await repository.latest(
        tx,
        person?.id ?? null,
        data.date,
      )
      if (!previous || previous.kind === 'inherit')
        throw new PayrollCalendarError(
          'ამ თარიღზე აქტიური გამონაკლისი არ არის.',
        )
    }
    await repository.insert(tx, {
      revision: revision + 1,
      employeeId: person?.id ?? null,
      date: data.date,
      kind: data.kind,
      start: data.hours?.start ?? null,
      end: data.hours?.end ?? null,
      actorId: current.id,
      reason: data.reason,
    })
    return { revision: revision + 1 }
  })
}
export async function readCalendarPeople(actor: Actor | null, input: unknown) {
  const data = calendarPeopleSchema.parse(input)
  return repository.transactCalendar(async (tx) => {
    await authorize(tx, actor, true)
    return repository.people(tx, data.q, data.page)
  })
}
