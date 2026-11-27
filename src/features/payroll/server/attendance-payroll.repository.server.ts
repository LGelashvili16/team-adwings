import '@tanstack/react-start/server-only'
import { and, asc, desc, eq, gte, ilike, isNull, lte, max, or, sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  attendanceSession,
  employee,
  leaveRequest,
  payrollAttendanceDecision,
  user,
} from '#/db/schema'
import type { PayrollTransaction } from './payroll-settings.repository.server'

export const transactAttendancePayroll = db.transaction.bind(db)
export const reviewPageSize = 20

/** Reads all attendance sessions overlapping a padded date window around the earning month (covers overnight sessions crossing month boundaries). */
export function readMonthAttendanceSessions(
  tx: PayrollTransaction,
  employeeId: string,
  prevDay: string,
  nextDay: string,
) {
  return tx
    .select({
      id: attendanceSession.id,
      workDate: attendanceSession.workDate,
      timezone: attendanceSession.timezone,
      startedAt: attendanceSession.startedAt,
      endedAt: attendanceSession.endedAt,
      autoClosedAt: attendanceSession.autoClosedAt,
      reviewState: attendanceSession.reviewState,
      gpsVisitId: attendanceSession.gpsVisitId,
    })
    .from(attendanceSession)
    .where(
      and(
        eq(attendanceSession.employeeId, employeeId),
        gte(attendanceSession.workDate, prevDay),
        lte(attendanceSession.workDate, nextDay),
      ),
    )
    .orderBy(asc(attendanceSession.startedAt), asc(attendanceSession.id))
}

export function readApprovedLeavesInMonth(
  tx: PayrollTransaction,
  userId: string,
  startDate: string,
  endDate: string,
) {
  return tx
    .select({
      kind: leaveRequest.kind,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
    })
    .from(leaveRequest)
    .where(
      and(
        eq(leaveRequest.requesterId, userId),
        eq(leaveRequest.status, 'approved'),
        lte(leaveRequest.startDate, endDate),
        or(isNull(leaveRequest.endDate), gte(leaveRequest.endDate, startDate)),
      ),
    )
}

export function readEmployeeMonthDecisions(
  tx: PayrollTransaction,
  employeeId: string,
  month: string,
) {
  return tx
    .select({
      itemKey: payrollAttendanceDecision.itemKey,
      version: payrollAttendanceDecision.version,
      action: payrollAttendanceDecision.action,
      sourceHash: payrollAttendanceDecision.sourceHash,
      calculatedSeconds: payrollAttendanceDecision.calculatedSeconds,
      overrideSeconds: payrollAttendanceDecision.overrideSeconds,
      calculatedAmountMinor: payrollAttendanceDecision.calculatedAmountMinor,
      overrideAmountMinor: payrollAttendanceDecision.overrideAmountMinor,
      note: payrollAttendanceDecision.note,
      reason: payrollAttendanceDecision.reason,
      createdAt: payrollAttendanceDecision.createdAt,
      actorName: user.name,
    })
    .from(payrollAttendanceDecision)
    .innerJoin(user, eq(user.id, payrollAttendanceDecision.actorId))
    .where(
      and(
        eq(payrollAttendanceDecision.employeeId, employeeId),
        eq(payrollAttendanceDecision.month, `${month}-01`),
      ),
    )
    .orderBy(
      asc(payrollAttendanceDecision.itemKey),
      desc(payrollAttendanceDecision.version),
    )
}

export async function latestDecisionVersion(
  tx: PayrollTransaction,
  employeeId: string,
  month: string,
  itemKey: string,
) {
  const [{ value }] = await tx
    .select({ value: max(payrollAttendanceDecision.version) })
    .from(payrollAttendanceDecision)
    .where(
      and(
        eq(payrollAttendanceDecision.employeeId, employeeId),
        eq(payrollAttendanceDecision.month, `${month}-01`),
        eq(payrollAttendanceDecision.itemKey, itemKey),
      ),
    )
  return value ?? 0
}

export function decisionRetry(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
) {
  return tx
    .select({
      commandHash: payrollAttendanceDecision.commandHash,
      version: payrollAttendanceDecision.version,
    })
    .from(payrollAttendanceDecision)
    .where(
      and(
        eq(payrollAttendanceDecision.actorId, actorId),
        eq(payrollAttendanceDecision.requestId, requestId),
      ),
    )
    .limit(1)
}

export function insertAttendancePayrollDecision(
  tx: PayrollTransaction,
  values: typeof payrollAttendanceDecision.$inferInsert,
) {
  return tx.insert(payrollAttendanceDecision).values(values)
}

export function listReviewEmployees(
  tx: PayrollTransaction,
  q: string,
  limit = 1000,
) {
  const term = q.trim()
  const pattern = term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : null
  return tx
    .select({
      employeeId: employee.id,
      userId: employee.userId,
      fullName: employee.fullName,
    })
    .from(employee)
    .where(
      pattern
        ? or(ilike(employee.fullName, pattern), ilike(employee.username, pattern))
        : undefined,
    )
    .orderBy(asc(employee.fullName), asc(employee.id))
    .limit(limit)
}

export async function lockDecisionCommand(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('payroll-attendance-decision'), hashtext(${`${actorId}:${requestId}`}))`,
  )
}
