import { randomUUID } from 'node:crypto'
import { deliverNotifications } from '#/features/notifications/server/notifications.service.server'
import '@tanstack/react-start/server-only'
import { assertPermission } from '#/lib/authorization/access'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { formatGeorgianDate } from '#/lib/date-format'
import {
  hasPermission,
  currentAuthorization,
} from '#/lib/authorization/permissions'
import {
  companyScheduleSchema,
  saveCompanyScheduleSchema,
  employeeWorkingWeekSchema,
  employeeScheduleRangeSchema,
  scheduleRangeSchema,
} from '../scheduling.schemas'
import {
  companyLocalDate,
  earliestScheduleDate,
  sameWorkingWeek,
} from '../scheduling.rules'
import * as repository from './scheduling.repository.server'
import * as scheduleHistory from './employee-schedule-history.repository.server'
import {
  historicalScheduleDay,
  historicalCompanyScheduleDay,
} from '../employee-schedule-history.rules'
import type { Actor } from '#/lib/authorization/actor'
import type {
  CompanyWorkday,
  OwnSchedule,
  ScheduleSettings,
} from '../scheduling.types'
import type { z } from 'zod'
import type { workLocationOverrideSchema } from '../scheduling.schemas'

export class ScheduleWorkflowError extends Error {}

/** Employee management establishes the target scope and locks the account before invoking this writer. */
export async function updateEmployeeWorkLocations(
  employeeId: string,
  actorId: string,
  changes: {
    remoteWeekdays?: Array<number>
    override?: z.infer<typeof workLocationOverrideSchema>
  },
  tx: repository.ScheduleTransaction,
) {
  await requireScheduleAdministrator(tx, actorId)
  const now = new Date()
  const { date: today } = await repository.companyWorkdayAt(now, tx)
  const { remoteWeekdays, override } = changes
  if (override) {
    if (override.date < today)
      throw new ScheduleWorkflowError('აირჩიეთ დღევანდელი ან მომავალი თარიღი.')
    if (
      override.remote !== null &&
      (await repository.employeeWorkdayAt(now, employeeId, tx, override.date))
        .kind !== 'scheduled'
    )
      throw new ScheduleWorkflowError(
        'სამუშაო ადგილის შეცვლა მხოლოდ სამუშაო დღისთვის შეგიძლიათ.',
      )
  }
  if (remoteWeekdays?.length) {
    const [individual, companyWeek] = await Promise.all([
      repository.employeeNotificationContext(tx, employeeId),
      repository.readCurrentCompanyWeek(tx),
    ])
    const week = individual?.week ?? companyWeek
    if (
      !week ||
      remoteWeekdays.some(
        (weekday) => !week.some((day) => day.weekday === weekday && day.hours),
      )
    )
      throw new ScheduleWorkflowError(
        'დისტანციური რეჟიმი მხოლოდ სამუშაო დღეებისთვის აირჩიეთ.',
      )
  }
  const recurringChanged =
    remoteWeekdays !== undefined &&
    (await repository.replaceRemoteWeekdays(tx, employeeId, remoteWeekdays))
  const dateChanged =
    override !== undefined &&
    (await repository.setWorkLocationOverride(
      tx,
      employeeId,
      override.date,
      override.remote,
    ))
  return { recurringChanged, dateChanged }
}

export function readEmployeeWorkLocations(userId: string) {
  return repository.transactSchedules(async (tx) => {
    const { date } = await repository.companyWorkdayAt(new Date(), tx)
    return repository.readWorkLocationPlan(tx, userId, date)
  })
}

/** Only the currently authorized clock actor's schedule can grant a company-network exception. */
export async function remoteClockWorkDate(
  now: Date,
  userId: string,
  tx: repository.ScheduleTransaction,
) {
  const employeeId = await repository.readClockEmployeeId(tx, userId)
  if (!employeeId) return null
  const workday = await getEmployeeWorkday(now, employeeId, tx)
  return (await isRemoteWorkday(workday, employeeId, tx)) ? workday.date : null
}

/** Only current schedule administrators can assign an individual week. */
async function requireScheduleAdministrator(
  tx: repository.ScheduleTransaction,
  actorId: string,
) {
  const { identity, person } = await repository.currentAccount(tx, actorId)
  if (
    !identity ||
    identity.state !== 'active' ||
    (person && person.status !== 'active')
  )
    throw new AuthorizationError()
  if (!hasPermission(currentAuthorization(identity), 'attendance.configure'))
    throw new AuthorizationError()
}

async function parseCustomWeek(
  days: unknown,
  tx: repository.ScheduleTransaction,
) {
  const parsed = employeeWorkingWeekSchema.safeParse(days)
  if (!parsed.success)
    throw new ScheduleWorkflowError('გადაამოწმეთ თანამშრომლის სამუშაო კვირა.')
  const current = await repository.companyWorkdayAt(new Date(), tx)
  if (!current.effectiveFrom)
    throw new ScheduleWorkflowError(
      'ჯერ განსაზღვრეთ კომპანიის მოქმედი სამუშაო განრიგი.',
    )
  return parsed.data
}

export async function assignInitialEmployeeWeek(
  employeeId: string,
  days: unknown,
  actorId: string | null,
  tx: repository.ScheduleTransaction,
) {
  // Provisioning authorizes the account transaction, including operator-only owner bootstrap.
  // Inherited schedules need a retained decision too, even if the company week is not configured yet.
  let week = null
  if (days !== null) {
    if (!actorId) throw new AuthorizationError()
    await requireScheduleAdministrator(tx, actorId)
    week = await parseCustomWeek(days, tx)
    await repository.insertEmployeeWeek(tx, employeeId, week, actorId)
  }
  const { date } = await repository.companyWorkdayAt(new Date(), tx)
  await scheduleHistory.appendEmployeeSchedule(tx, {
    employeeId,
    days: week,
    actorId,
    effectiveFrom: date,
    source: 'provisioned',
  })
}

/**
 * Replaces an employee's recurring week, or returns them to the company schedule when `days` is null.
 * Open attendance sessions keep the expectations they started with; later days use the new week.
 * Returns whether anything changed so callers audit real changes only.
 */
export async function replaceEmployeeWeek(
  employeeId: string,
  days: unknown,
  actorId: string,
  tx: repository.ScheduleTransaction,
) {
  await requireScheduleAdministrator(tx, actorId)
  const week = days === null ? null : await parseCustomWeek(days, tx)
  const context = await repository.employeeNotificationContext(tx, employeeId)
  const companyWeek = await repository.readCurrentCompanyWeek(tx)
  const before = context?.week ?? companyWeek
  const after = week ?? companyWeek
  const changed = await repository.replaceEmployeeWeek(
    tx,
    employeeId,
    week,
    actorId,
  )
  if (changed) {
    const { date } = await repository.companyWorkdayAt(new Date(), tx)
    await scheduleHistory.appendEmployeeSchedule(tx, {
      employeeId,
      days: week,
      actorId,
      effectiveFrom: date,
      source: 'changed',
    })
  }
  if (
    changed &&
    context &&
    before &&
    after &&
    !sameWorkingWeek(before, after)
  ) {
    await deliverNotifications(tx, {
      eventKey: `schedule:employee:${employeeId}:${randomUUID()}`,
      recipientIds: [context.userId],
      actorId,
      title: 'სამუშაო განრიგი შეიცვალა',
      body: `თქვენი სამუშაო კვირა განახლდა. მოქმედებს ${formatGeorgianDate((await repository.companyWorkdayAt(new Date(), tx)).date)} თარიღიდან.`,
      destination: { kind: 'schedule' },
    })
  }
  return changed
}

/** Self-service read: the subject is always the authenticated actor, and only their effective week is returned. */
export function readOwnSchedule(actor: Actor): Promise<OwnSchedule> {
  return repository.transactSchedules(async (tx) => {
    const workday = await repository.companyWorkdayAt(new Date(), tx)
    const context = {
      timezone: workday.timezone,
      today: workday.date,
      workLocations: await repository.readWorkLocationPlan(
        tx,
        actor.id,
        workday.date,
      ),
    }
    const stored = await repository.readEmployeeWeekByUser(tx, actor.id)
    if (stored) {
      const own = employeeWorkingWeekSchema.safeParse(stored)
      return own.success
        ? { ...context, source: 'individual', week: own.data }
        : { ...context, source: 'none', week: null }
    }
    const company = await repository.readCurrentCompanyWeek(tx)
    return company
      ? { ...context, source: 'company', week: company }
      : { ...context, source: 'none', week: null }
  })
}

/** Read-only company week shown beside employees that inherit it; carries no administration or audit fields. */
export function readCompanyWeek() {
  return repository.transactSchedules((tx) =>
    repository.readCurrentCompanyWeek(tx),
  )
}

/** The attendance service establishes ownership and active employment before calling this interface. */
export function getEmployeeWorkday(
  now: Date,
  employeeId: string,
  tx: repository.ScheduleTransaction,
) {
  return repository.employeeWorkdayAt(now, employeeId, tx)
}

export async function isRemoteWorkday(
  workday: CompanyWorkday,
  employeeId: string,
  tx: repository.ScheduleTransaction,
) {
  return (
    workday.kind === 'scheduled' &&
    (await repository.readRemoteFlag(tx, employeeId, workday.date))
  )
}

/** Batched remote workday lookup for directory views; callers establish employee read scope first. */
export function readRemoteWorkdayEmployeeIds(
  workday: CompanyWorkday,
  employeeIds: Array<string>,
  tx: repository.ScheduleTransaction,
) {
  return repository.readRemoteWorkdayEmployeeIds(tx, workday, employeeIds)
}

/** Internal attendance interface; the caller establishes the active employee before reading expectations. */
export function getCompanyWorkday(
  now: Date,
  transaction?: repository.ScheduleTransaction,
) {
  if (transaction) return repository.companyWorkdayAt(now, transaction)
  return repository.transactSchedules((tx) =>
    repository.companyWorkdayAt(now, tx),
  )
}

async function authorize(
  tx: repository.ScheduleTransaction,
  actor: Actor | null,
) {
  if (!actor) throw new AuthorizationError()
  const { identity, person } = await repository.currentAccount(tx, actor.id)
  if (
    !identity ||
    identity.state !== 'active' ||
    (person && person.status !== 'active')
  )
    throw new AuthorizationError()
  assertPermission(
    { ...actor, ...currentAuthorization(identity) },
    'attendance.configure',
  )
  return actor
}

export async function readScheduleSettings(
  actor: Actor | null,
): Promise<ScheduleSettings> {
  return repository.transactSchedules(async (tx) => {
    await authorize(tx, actor)
    const latest = await repository.latestVersion(tx)
    const today = companyLocalDate(
      new Date(),
      latest?.timezone ?? 'Asia/Tbilisi',
    )
    const versions = await repository.readVersions(tx, today)
    const records = await repository.hydrateVersions(tx, [
      ...(versions.current ? [versions.current] : []),
      ...versions.upcoming.slice(0, 20),
      ...(latest ? [latest] : []),
    ])
    return {
      current:
        records.find(
          (record) => record.effectiveFrom === versions.current?.effectiveFrom,
        ) ?? null,
      latest:
        records.find(
          (record) => record.effectiveFrom === latest?.effectiveFrom,
        ) ?? null,
      upcoming: versions.upcoming
        .slice(0, 20)
        .map((record) =>
          records.find((value) => value.effectiveFrom === record.effectiveFrom),
        )
        .filter((record) => record !== undefined),
      hasMoreUpcoming: versions.upcoming.length > 20,
      today,
      minimumEffectiveFrom: earliestScheduleDate(
        today,
        latest?.effectiveFrom ?? null,
      ),
      timezone: latest?.timezone ?? null,
    }
  })
}

export async function saveScheduleVersion(actor: Actor | null, input: unknown) {
  return repository.transactSchedules(async (tx) => {
    const administrator = await authorize(tx, actor)
    const parsed = saveCompanyScheduleSchema.safeParse(input)
    if (!parsed.success)
      throw new ScheduleWorkflowError(
        'გადაამოწმეთ განრიგის ველები და სცადეთ ხელახლა.',
      )
    await repository.lockScheduleTimeline(tx)
    const latest = await repository.latestVersion(tx)
    const timezone = new Intl.DateTimeFormat('ka-GE', {
      timeZone: parsed.data.timezone,
    }).resolvedOptions().timeZone
    // A company timezone change needs its own transition policy to avoid moving historical date boundaries.
    if (latest && latest.timezone !== timezone)
      throw new ScheduleWorkflowError(
        'კომპანიის დროის სარტყლის შეცვლა ამ ეტაპზე მიუწვდომელია.',
      )
    const today = companyLocalDate(new Date(), timezone)
    const minimum = earliestScheduleDate(today, latest?.effectiveFrom ?? null)
    if (parsed.data.effectiveFrom < minimum)
      throw new ScheduleWorkflowError(
        `ახალი განრიგის პირველი შესაძლო თარიღია ${minimum}. განაახლეთ გვერდის მონაცემები.`,
      )
    const schedule = companyScheduleSchema.parse({ ...parsed.data, timezone })
    const previous = (
      await repository.hydrateVersions(tx, latest ? [latest] : [])
    ).at(0)
    await repository.insertVersion(
      tx,
      schedule,
      administrator.id,
      // Schedule creation has a fixed audit action; administrators do not enter a free-text reason.
      'კომპანიის სამუშაო განრიგის შენახვა.',
    )
    if (!previous || !sameWorkingWeek(previous.days, schedule.days)) {
      for await (const recipientIds of repository.inheritingEmployeePages(tx))
        await deliverNotifications(tx, {
          eventKey: `schedule:company:${schedule.effectiveFrom}`,
          recipientIds,
          actorId: administrator.id,
          title: 'კომპანიის სამუშაო განრიგი შეიცვალა',
          body: `ახალი სამუშაო განრიგი მოქმედებს ${formatGeorgianDate(schedule.effectiveFrom)} თარიღიდან.`,
          destination: { kind: 'schedule' },
        })
    }
    return { effectiveFrom: schedule.effectiveFrom }
  })
}

/** Internal vacation workflow interface. The caller checks current permissions and locks the target employee. */
export function getVacationWorkingDates(
  tx: repository.ScheduleTransaction,
  userId: string,
  startDate: string,
  endDate: string,
) {
  return repository.vacationWorkingDates(tx, userId, startDate, endDate)
}

/** Private calculation interface. The caller owns the transaction and checks current actor permissions and target-employee scope, as with attendance/leave schedule reads. Unknown history must block financial conclusions. */
export async function getHistoricalEmployeeSchedule(
  tx: repository.ScheduleTransaction,
  input: unknown,
) {
  const range = employeeScheduleRangeSchema.parse(input)
  return (await scheduleHistory.readEmployeeScheduleDates(tx, range)).map(
    historicalScheduleDay,
  )
}

/** Authorized reporting workflows own the read transaction and consume only retained company versions. */
export async function getHistoricalCompanySchedule(
  tx: repository.ScheduleTransaction,
  input: unknown,
) {
  const range = scheduleRangeSchema.parse(input)
  return (await scheduleHistory.readCompanyScheduleDates(tx, range)).map(
    historicalCompanyScheduleDay,
  )
}
