import '@tanstack/react-start/server-only'
import { and, count, desc, eq, ilike, ne, or } from 'drizzle-orm'
import {
  payrollAwardPool as p,
  payrollAwardPoolVersion as v,
  payrollAwardProposal as member,
  payrollAwardProposalVersion as decision,
  payrollBonusRuleVersion as rate,
  employee,
  user,
} from '#/db/schema'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { AwardStatus } from '../award-proposals.types'

export async function command(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
) {
  return (
    await tx
      .select()
      .from(v)
      .where(and(eq(v.actorId, actorId), eq(v.requestId, requestId)))
      .limit(1)
  ).at(0)
}
export async function peek(tx: PayrollTransaction, id: string) {
  return (await tx.select().from(p).where(eq(p.id, id)).limit(1)).at(0)
}
export async function lock(tx: PayrollTransaction, id: string) {
  return (await tx.select().from(p).where(eq(p.id, id)).for('update')).at(0)
}
export async function bySource(
  tx: PayrollTransaction,
  ruleId: string,
  type: 'job' | 'external',
  key: string,
) {
  return (
    await tx
      .select()
      .from(p)
      .where(
        and(eq(p.ruleId, ruleId), eq(p.sourceType, type), eq(p.sourceKey, key)),
      )
      .limit(1)
  ).at(0)
}
export async function create(
  tx: PayrollTransaction,
  values: typeof p.$inferInsert,
) {
  return (await tx.insert(p).values(values).returning())[0]
}
export async function append(
  tx: PayrollTransaction,
  values: typeof v.$inferInsert,
) {
  return (await tx.insert(v).values(values).returning())[0]
}
export async function setCurrent(
  tx: PayrollTransaction,
  id: string,
  version: number,
  status: AwardStatus,
) {
  await tx.update(p).set({ version, status }).where(eq(p.id, id))
}
export async function current(
  tx: PayrollTransaction,
  id: string,
  version: number,
) {
  return (
    await tx
      .select()
      .from(v)
      .where(and(eq(v.poolId, id), eq(v.version, version)))
      .limit(1)
  ).at(0)
}
export async function rateVersion(tx: PayrollTransaction, id: string) {
  return (await tx.select().from(rate).where(eq(rate.id, id)).limit(1)).at(0)
}
export async function activeMembers(tx: PayrollTransaction, poolId: string) {
  return tx
    .select()
    .from(member)
    .where(and(eq(member.poolId, poolId), ne(member.status, 'withdrawn')))
    .orderBy(member.employeeId)
    .for('update')
}
export async function versionMembers(
  tx: PayrollTransaction,
  versionId: string,
) {
  return tx
    .select({ id: member.id })
    .from(member)
    .innerJoin(
      decision,
      and(
        eq(decision.proposalId, member.id),
        eq(decision.version, member.version),
      ),
    )
    .where(eq(decision.poolVersionId, versionId))
    .orderBy(member.employeeId)
    .limit(21)
}
export async function mayReview(
  tx: PayrollTransaction,
  poolId: string,
  actorId: string,
) {
  const prepared = (
    await tx
      .select({ id: v.id })
      .from(v)
      .where(
        and(
          eq(v.poolId, poolId),
          eq(v.actorId, actorId),
          eq(v.status, 'proposed'),
        ),
      )
      .limit(1)
  ).at(0)
  return !prepared && !(await wasBeneficiary(tx, poolId, actorId))
}
export async function wasBeneficiary(
  tx: PayrollTransaction,
  poolId: string,
  actorId: string,
) {
  const benefited = (
    await tx
      .select({ id: member.id })
      .from(member)
      .innerJoin(employee, eq(employee.id, member.employeeId))
      .where(and(eq(member.poolId, poolId), eq(employee.userId, actorId)))
      .limit(1)
  ).at(0)
  return !!benefited
}
export async function history(
  tx: PayrollTransaction,
  poolId: string,
  page: number,
  q: string,
) {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`,
    where = and(
      eq(v.poolId, poolId),
      q ? or(ilike(v.reason, pattern), ilike(user.name, pattern)) : undefined,
    )
  const records = await tx
    .select({ record: v, actorName: user.name, rule: rate })
    .from(v)
    .innerJoin(user, eq(user.id, v.actorId))
    .innerJoin(rate, eq(rate.id, v.ruleVersionId))
    .where(where)
    .orderBy(desc(v.version))
    .limit(10)
    .offset((page - 1) * 10)
  const total = (
    await tx
      .select({ total: count() })
      .from(v)
      .innerJoin(user, eq(user.id, v.actorId))
      .where(where)
  )[0].total
  return { records, total, pageSize: 10 }
}
