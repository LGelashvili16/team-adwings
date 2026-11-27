import '@tanstack/react-start/server-only'
import { and, count, desc, eq, gt, lte, max } from 'drizzle-orm'
import { db } from '#/db'
import { employeeRestDayPolicy, user } from '#/db/schema'

export type RestDayPolicyTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

export const transactRestDayPolicy = db.transaction.bind(db)
export const policyHistoryPageSize = 5

export const DEFAULT_REST_DAY_POLICY = {
  restDayClockInAllowed: true,
  autoRestDayBonusEnabled: false,
} as const

/** Reads the employee's effective rest-day policy on a company-local date. Missing history safely defaults to clock-in ON and automatic bonus OFF. */
export async function readEmployeeRestDayPolicyOnDate(
  tx: RestDayPolicyTransaction,
  employeeId: string,
  date: string,
) {
  const row = (
    await tx
      .select({
        version: employeeRestDayPolicy.version,
        effectiveFrom: employeeRestDayPolicy.effectiveFrom,
        restDayClockInAllowed: employeeRestDayPolicy.restDayClockInAllowed,
        autoRestDayBonusEnabled: employeeRestDayPolicy.autoRestDayBonusEnabled,
      })
      .from(employeeRestDayPolicy)
      .where(
        and(
          eq(employeeRestDayPolicy.employeeId, employeeId),
          lte(employeeRestDayPolicy.effectiveFrom, date),
        ),
      )
      .orderBy(
        desc(employeeRestDayPolicy.effectiveFrom),
        desc(employeeRestDayPolicy.version),
      )
      .limit(1)
  ).at(0)
  return row ?? { version: 0, effectiveFrom: null, ...DEFAULT_REST_DAY_POLICY }
}

/** Reads all policy revisions effective on or before endDate so pure month rules can resolve switches for any date in the month. */
export function readEmployeeRestDayPolicyTimeline(
  tx: RestDayPolicyTransaction,
  employeeId: string,
  endDate: string,
) {
  return tx
    .select({
      version: employeeRestDayPolicy.version,
      effectiveFrom: employeeRestDayPolicy.effectiveFrom,
      restDayClockInAllowed: employeeRestDayPolicy.restDayClockInAllowed,
      autoRestDayBonusEnabled: employeeRestDayPolicy.autoRestDayBonusEnabled,
    })
    .from(employeeRestDayPolicy)
    .where(
      and(
        eq(employeeRestDayPolicy.employeeId, employeeId),
        lte(employeeRestDayPolicy.effectiveFrom, endDate),
      ),
    )
    .orderBy(
      desc(employeeRestDayPolicy.effectiveFrom),
      desc(employeeRestDayPolicy.version),
    )
}

export async function readNextRestDayPolicy(
  tx: RestDayPolicyTransaction,
  employeeId: string,
  today: string,
) {
  const row = (
    await tx
      .select({
        version: employeeRestDayPolicy.version,
        effectiveFrom: employeeRestDayPolicy.effectiveFrom,
        restDayClockInAllowed: employeeRestDayPolicy.restDayClockInAllowed,
        autoRestDayBonusEnabled: employeeRestDayPolicy.autoRestDayBonusEnabled,
      })
      .from(employeeRestDayPolicy)
      .where(
        and(
          eq(employeeRestDayPolicy.employeeId, employeeId),
          gt(employeeRestDayPolicy.effectiveFrom, today),
        ),
      )
      .orderBy(
        employeeRestDayPolicy.effectiveFrom,
        desc(employeeRestDayPolicy.version),
      )
      .limit(1)
  ).at(0)
  return row ?? null
}

export async function latestRestDayPolicyVersion(
  tx: RestDayPolicyTransaction,
  employeeId: string,
) {
  const [{ value }] = await tx
    .select({ value: max(employeeRestDayPolicy.version) })
    .from(employeeRestDayPolicy)
    .where(eq(employeeRestDayPolicy.employeeId, employeeId))
  return value ?? 0
}

export function readRestDayPolicyHistory(
  tx: RestDayPolicyTransaction,
  employeeId: string,
  page: number,
) {
  return tx
    .select({
      version: employeeRestDayPolicy.version,
      effectiveFrom: employeeRestDayPolicy.effectiveFrom,
      restDayClockInAllowed: employeeRestDayPolicy.restDayClockInAllowed,
      autoRestDayBonusEnabled: employeeRestDayPolicy.autoRestDayBonusEnabled,
      reason: employeeRestDayPolicy.reason,
      createdAt: employeeRestDayPolicy.createdAt,
      actorName: user.name,
    })
    .from(employeeRestDayPolicy)
    .innerJoin(user, eq(user.id, employeeRestDayPolicy.actorId))
    .where(eq(employeeRestDayPolicy.employeeId, employeeId))
    .orderBy(desc(employeeRestDayPolicy.version))
    .limit(policyHistoryPageSize)
    .offset((page - 1) * policyHistoryPageSize)
}

export async function countRestDayPolicyHistory(
  tx: RestDayPolicyTransaction,
  employeeId: string,
) {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(employeeRestDayPolicy)
    .where(eq(employeeRestDayPolicy.employeeId, employeeId))
  return total
}

export function insertRestDayPolicy(
  tx: RestDayPolicyTransaction,
  values: typeof employeeRestDayPolicy.$inferInsert,
) {
  return tx.insert(employeeRestDayPolicy).values(values)
}
