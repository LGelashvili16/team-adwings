import '@tanstack/react-start/server-only'
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '#/db'
import {
  attendanceSession,
  employee,
  employeeEmploymentAudit,
  employeeEmploymentPeriod,
  user,
} from '#/db/schema'
import { effectiveEmploymentStatus } from './employment-status.server'

export const transactEmployment = db.transaction.bind(db)
export type EmploymentTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]
export const pageSize = 5

export async function currentAccount(tx: EmploymentTransaction, id: string) {
  const account = (
    await tx
      .select({
        roles: user.roles,
        permissionOverrides: user.permissionOverrides,
        state: user.accessState,
      })
      .from(user)
      .where(eq(user.id, id))
      .for('share')
  ).at(0)
  const person = (
    await tx
      .select({ status: effectiveEmploymentStatus })
      .from(employee)
      .where(eq(employee.userId, id))
      .for('share')
  ).at(0)
  return { account, person }
}
export async function targetEmployee(
  tx: EmploymentTransaction,
  userId: string,
  lock = false,
) {
  const query = tx
    .select({
      id: employee.id,
      userId: employee.userId,
      revision: employee.employmentRevision,
      departureEffectiveAt: employee.departureEffectiveAt,
      departureScheduled: sql<boolean>`coalesce(${employee.departureEffectiveAt} > statement_timestamp(), false)`,
    })
    .from(employee)
    .where(eq(employee.userId, userId))
  return (await (lock ? query.for('update') : query)).at(0)
}
export async function periodById(
  tx: EmploymentTransaction,
  employeeId: string,
  periodId: string,
) {
  return (
    await tx
      .select()
      .from(employeeEmploymentPeriod)
      .where(
        and(
          eq(employeeEmploymentPeriod.id, periodId),
          eq(employeeEmploymentPeriod.employeeId, employeeId),
          isNull(employeeEmploymentPeriod.voidedAt),
        ),
      )
      .limit(1)
  ).at(0)
}
const active = (employeeId: string) =>
  and(
    eq(employeeEmploymentPeriod.employeeId, employeeId),
    isNull(employeeEmploymentPeriod.voidedAt),
  )
export async function readPeriods(
  tx: EmploymentTransaction,
  employeeId: string,
  page: number,
) {
  return tx
    .select({
      id: employeeEmploymentPeriod.id,
      startDate: employeeEmploymentPeriod.startDate,
      endDate: employeeEmploymentPeriod.endDate,
    })
    .from(employeeEmploymentPeriod)
    .where(active(employeeId))
    .orderBy(
      desc(employeeEmploymentPeriod.startDate),
      desc(employeeEmploymentPeriod.id),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)
}
export async function latestPeriod(
  tx: EmploymentTransaction,
  employeeId: string,
) {
  return (
    (
      await tx
        .select({
          id: employeeEmploymentPeriod.id,
          startDate: employeeEmploymentPeriod.startDate,
          endDate: employeeEmploymentPeriod.endDate,
        })
        .from(employeeEmploymentPeriod)
        .where(active(employeeId))
        .orderBy(desc(employeeEmploymentPeriod.startDate))
        .limit(1)
    ).at(0) ?? null
  )
}

export async function hasAttendanceBlockingDeparture(
  tx: EmploymentTransaction,
  employeeId: string,
  endDate: string,
  includeOpen: boolean,
) {
  const rows = await tx
    .select({ id: attendanceSession.id })
    .from(attendanceSession)
    .where(
      and(
        eq(attendanceSession.employeeId, employeeId),
        or(
          includeOpen ? isNull(attendanceSession.endedAt) : undefined,
          gt(attendanceSession.workDate, endDate),
        ),
      ),
    )
    .limit(1)
  return rows.length > 0
}

export async function departureCutoff(
  tx: EmploymentTransaction,
  endDate: string,
  timezone: string,
) {
  const [row] = await tx
    .select({
      cutoff:
        sql`(${endDate}::date + 1)::timestamp at time zone ${timezone}`.mapWith(
          employee.createdAt,
        ),
    })
    .from(sql`(select 1) as singleton`)
  return row.cutoff
}
export async function periodCount(
  tx: EmploymentTransaction,
  employeeId: string,
) {
  return (
    await tx
      .select({ total: count() })
      .from(employeeEmploymentPeriod)
      .where(active(employeeId))
  )[0].total
}
export async function readHistory(
  tx: EmploymentTransaction,
  employeeId: string,
  page: number,
) {
  return tx
    .select({
      id: employeeEmploymentAudit.id,
      action: employeeEmploymentAudit.action,
      before: employeeEmploymentAudit.before,
      after: employeeEmploymentAudit.after,
      reason: employeeEmploymentAudit.reason,
      actorName: user.name,
      createdAt: employeeEmploymentAudit.createdAt,
    })
    .from(employeeEmploymentAudit)
    .innerJoin(user, eq(user.id, employeeEmploymentAudit.actorId))
    .where(eq(employeeEmploymentAudit.employeeId, employeeId))
    .orderBy(
      desc(employeeEmploymentAudit.createdAt),
      desc(employeeEmploymentAudit.id),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)
}
export async function historyCount(
  tx: EmploymentTransaction,
  employeeId: string,
) {
  return (
    await tx
      .select({ total: count() })
      .from(employeeEmploymentAudit)
      .where(eq(employeeEmploymentAudit.employeeId, employeeId))
  )[0].total
}
export async function hasOverlap(
  tx: EmploymentTransaction,
  employeeId: string,
  startDate: string,
  endDate: string | null,
  exceptId: string | null,
) {
  return (
    (
      await tx
        .select({ id: employeeEmploymentPeriod.id })
        .from(employeeEmploymentPeriod)
        .where(
          and(
            active(employeeId),
            exceptId ? ne(employeeEmploymentPeriod.id, exceptId) : undefined,
            endDate
              ? lte(employeeEmploymentPeriod.startDate, endDate)
              : undefined,
            or(
              isNull(employeeEmploymentPeriod.endDate),
              gte(employeeEmploymentPeriod.endDate, startDate),
            ),
          ),
        )
        .limit(1)
    ).length > 0
  )
}
export async function insertPeriod(
  tx: EmploymentTransaction,
  employeeId: string,
  startDate: string,
  endDate: string | null,
) {
  return (
    await tx
      .insert(employeeEmploymentPeriod)
      .values({ employeeId, startDate, endDate })
      .returning()
  )[0]
}
export async function updatePeriod(
  tx: EmploymentTransaction,
  id: string,
  values: { startDate: string; endDate: string | null } | { voidedAt: Date },
) {
  return (
    await tx
      .update(employeeEmploymentPeriod)
      .set(values)
      .where(eq(employeeEmploymentPeriod.id, id))
      .returning()
  )[0]
}
export async function recordChange(
  tx: EmploymentTransaction,
  data: typeof employeeEmploymentAudit.$inferInsert,
) {
  await tx.insert(employeeEmploymentAudit).values(data)
  await tx
    .update(employee)
    .set({ employmentRevision: sql`${employee.employmentRevision} + 1` })
    .where(eq(employee.id, data.employeeId))
}
export async function eligibilityPeriods(
  tx: EmploymentTransaction,
  employeeId: string,
  startDate: string,
  endDate: string,
) {
  const person = (
    await tx
      .select({ revision: employee.employmentRevision })
      .from(employee)
      .where(eq(employee.id, employeeId))
      .limit(1)
  ).at(0)
  const total = await periodCount(tx, employeeId)
  const periods = await tx
    .select({
      startDate: employeeEmploymentPeriod.startDate,
      endDate: employeeEmploymentPeriod.endDate,
    })
    .from(employeeEmploymentPeriod)
    .where(
      and(
        active(employeeId),
        lte(employeeEmploymentPeriod.startDate, endDate),
        or(
          isNull(employeeEmploymentPeriod.endDate),
          gte(employeeEmploymentPeriod.endDate, startDate),
        ),
      ),
    )
    .orderBy(employeeEmploymentPeriod.startDate)
    .limit(367)
  return { revision: person?.revision ?? 0, confirmed: total > 0, periods }
}
