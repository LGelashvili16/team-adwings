import '@tanstack/react-start/server-only'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '#/db'
import {
  employee,
  payrollCalendarException as exception,
  leaveRequest,
  user,
} from '#/db/schema'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { CalendarException } from '../payroll-calendar.types'

export const transactCalendar = db.transaction.bind(db)
export const historyPageSize = 10
export const peoplePageSize = 20
const exceptionFields = {
  revision: exception.revision,
  date: exception.date,
  kind: exception.kind,
  start: exception.start,
  end: exception.end,
}
export function exceptionFact(row: {
  revision: number
  date: string
  kind: CalendarException['kind']
  start: string | null
  end: string | null
}): CalendarException {
  return {
    revision: row.revision,
    date: row.date,
    kind: row.kind,
    hours:
      row.start !== null && row.end !== null
        ? { start: row.start, end: row.end }
        : null,
  }
}
export async function lockCalendar(tx: PayrollTransaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('team-adwings-payroll-calendar'))`,
  )
}
export async function revision(tx: PayrollTransaction) {
  return (
    (
      await tx
        .select({ revision: exception.revision })
        .from(exception)
        .orderBy(desc(exception.revision))
        .limit(1)
    ).at(0)?.revision ?? 0
  )
}
export async function person(tx: PayrollTransaction, userId: string) {
  return (
    await tx
      .select({
        id: employee.id,
        userId: employee.userId,
        name: employee.fullName,
        username: employee.username,
        jobTitle: employee.jobTitle,
      })
      .from(employee)
      .where(eq(employee.userId, userId))
      .for('share')
  ).at(0)
}
export async function personByEmployeeId(
  tx: PayrollTransaction,
  employeeId: string,
) {
  return (
    await tx
      .select({ userId: employee.userId })
      .from(employee)
      .where(eq(employee.id, employeeId))
      .limit(1)
  ).at(0)
}
const scope = (employeeId: string | null) =>
  employeeId
    ? eq(exception.employeeId, employeeId)
    : isNull(exception.employeeId)
export async function latest(
  tx: PayrollTransaction,
  employeeId: string | null,
  date: string,
) {
  return (
    await tx
      .select(exceptionFields)
      .from(exception)
      .where(and(scope(employeeId), eq(exception.date, date)))
      .orderBy(desc(exception.revision))
      .limit(1)
  ).at(0)
}
export async function decisions(
  tx: PayrollTransaction,
  employeeId: string | null,
  startDate: string,
  endDate: string,
) {
  return tx
    .selectDistinctOn([exception.employeeId, exception.date], {
      ...exceptionFields,
      employeeId: exception.employeeId,
    })
    .from(exception)
    .where(
      and(
        employeeId ? or(scope(employeeId), scope(null)) : scope(null),
        gte(exception.date, startDate),
        lte(exception.date, endDate),
      ),
    )
    .orderBy(exception.employeeId, exception.date, desc(exception.revision))
}
export async function history(
  tx: PayrollTransaction,
  employeeId: string | null,
  startDate: string,
  endDate: string,
  page: number,
  q: string,
) {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  const where = and(
    scope(employeeId),
    gte(exception.date, startDate),
    lte(exception.date, endDate),
    q
      ? or(ilike(exception.reason, pattern), ilike(user.name, pattern))
      : undefined,
  )
  const records = await tx
    .select({
      ...exceptionFields,
      actorName: user.name,
      reason: exception.reason,
      createdAt: exception.createdAt,
      previousRevision: sql<
        number | null
      >`(select max(previous.revision) from payroll_calendar_exception previous where previous.employee_id is not distinct from ${exception.employeeId} and previous.date = ${exception.date} and previous.revision < ${exception.revision})`,
    })
    .from(exception)
    .innerJoin(user, eq(user.id, exception.actorId))
    .where(where)
    .orderBy(desc(exception.revision))
    .limit(historyPageSize)
    .offset((page - 1) * historyPageSize)
  return {
    records,
    total: (
      await tx
        .select({ total: count() })
        .from(exception)
        .innerJoin(user, eq(user.id, exception.actorId))
        .where(where)
    )[0].total,
  }
}
export async function insert(
  tx: PayrollTransaction,
  values: typeof exception.$inferInsert,
) {
  await tx.insert(exception).values(values)
}
export async function readLeaves(
  tx: PayrollTransaction,
  userId: string,
  startDate: string,
  endDate: string,
) {
  return tx
    .select({
      id: leaveRequest.id,
      kind: leaveRequest.kind,
      status: leaveRequest.status,
      revision: leaveRequest.revision,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
    })
    .from(leaveRequest)
    .where(
      and(
        eq(leaveRequest.requesterId, userId),
        or(
          eq(leaveRequest.status, 'pending'),
          eq(leaveRequest.status, 'approved'),
        ),
        lte(leaveRequest.startDate, endDate),
        or(isNull(leaveRequest.endDate), gte(leaveRequest.endDate, startDate)),
      ),
    )
    .limit(1001)
}
export async function people(tx: PayrollTransaction, q: string, page: number) {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  const where = q
    ? or(
        ilike(employee.fullName, pattern),
        ilike(employee.username, pattern),
        ilike(employee.jobTitle, pattern),
      )
    : undefined
  const records = await tx
    .select({
      userId: employee.userId,
      name: employee.fullName,
      username: employee.username,
      jobTitle: employee.jobTitle,
    })
    .from(employee)
    .where(where)
    .orderBy(asc(employee.fullName), asc(employee.id))
    .limit(peoplePageSize)
    .offset((page - 1) * peoplePageSize)
  return {
    records,
    total: (await tx.select({ total: count() }).from(employee).where(where))[0]
      .total,
    pageSize: peoplePageSize,
  }
}
