import '@tanstack/react-start/server-only'
import { and, asc, count, desc, eq, ilike, lte, ne, or, sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  employee,
  payrollAwardProposal as p,
  payrollAwardProposalVersion as a,
  payrollBonusRule as rule,
  payrollBonusRuleVersion as r,
  user,
} from '#/db/schema'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { AwardSearch } from '../award-proposals.schemas'

export const transactAwards = db.transaction.bind(db)
export const pageSize = 20,
  historyPageSize = 10
export async function commandLock(tx: PayrollTransaction, key: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`payroll-award:${key}`},0))`,
  )
}
export async function command(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
) {
  return (
    await tx
      .select()
      .from(a)
      .where(and(eq(a.actorId, actorId), eq(a.requestId, requestId)))
      .limit(1)
  ).at(0)
}
export async function person(tx: PayrollTransaction, userId: string) {
  return (
    await tx
      .select({
        id: employee.id,
        userId: employee.userId,
        name: employee.fullName,
      })
      .from(employee)
      .where(eq(employee.userId, userId))
      .for('share')
  ).at(0)
}
export async function lockRule(tx: PayrollTransaction, ruleId: string) {
  return (
    await tx
      .select({ id: rule.id })
      .from(rule)
      .where(eq(rule.id, ruleId))
      .for('share')
  ).at(0)
}
export async function applicableRule(
  tx: PayrollTransaction,
  ruleId: string,
  date: string,
) {
  return (
    await tx
      .select()
      .from(r)
      .where(and(eq(r.ruleId, ruleId), lte(r.effectiveFrom, date)))
      .orderBy(desc(r.effectiveFrom), desc(r.version))
      .limit(1)
  ).at(0)
}
export async function lockProposal(tx: PayrollTransaction, proposalId: string) {
  return (
    await tx.select().from(p).where(eq(p.id, proposalId)).for('update')
  ).at(0)
}
export async function claim(
  tx: PayrollTransaction,
  ruleId: string,
  employeeId: string,
  sourceType: 'job' | 'external',
  sourceKey: string,
) {
  return (
    await tx
      .select({ id: p.id })
      .from(p)
      .where(
        and(
          eq(p.ruleId, ruleId),
          eq(p.employeeId, employeeId),
          eq(p.sourceType, sourceType),
          eq(p.sourceKey, sourceKey),
        ),
      )
      .limit(1)
  ).at(0)
}
export async function createProposal(
  tx: PayrollTransaction,
  values: typeof p.$inferInsert,
) {
  return (await tx.insert(p).values(values).returning())[0]
}
export async function setCurrent(
  tx: PayrollTransaction,
  id: string,
  version: number,
  status: 'proposed' | 'withdrawn',
) {
  await tx.update(p).set({ version, status }).where(eq(p.id, id))
}
export async function appendVersion(
  tx: PayrollTransaction,
  values: typeof a.$inferInsert,
) {
  await tx.insert(a).values(values)
}
export async function rawCurrent(
  tx: PayrollTransaction,
  id: string,
  version: number,
) {
  return (
    await tx
      .select()
      .from(a)
      .where(and(eq(a.proposalId, id), eq(a.version, version)))
      .limit(1)
  ).at(0)
}
const projection = {
  proposal: p,
  decision: a,
  rate: r,
  employeeName: employee.fullName,
  userId: employee.userId,
  actorName: user.name,
}
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`
export async function directory(tx: PayrollTransaction, search: AwardSearch) {
  const where = and(
    search.status === 'all' ? undefined : eq(p.status, search.status),
    search.q
      ? or(
          ilike(employee.fullName, pattern(search.q)),
          ilike(r.name, pattern(search.q)),
          ilike(a.reference, pattern(search.q)),
        )
      : undefined,
  )
  const base = () =>
    tx
      .select(projection)
      .from(p)
      .innerJoin(a, and(eq(a.proposalId, p.id), eq(a.version, p.version)))
      .innerJoin(r, eq(r.id, a.ruleVersionId))
      .innerJoin(employee, eq(employee.id, p.employeeId))
      .innerJoin(user, eq(user.id, a.actorId))
  const records = await base()
    .where(where)
    .orderBy(
      search.sort === 'oldest' ? asc(p.createdAt) : desc(p.createdAt),
      search.sort === 'oldest' ? asc(p.id) : desc(p.id),
    )
    .limit(pageSize)
    .offset((search.page - 1) * pageSize)
  const total = (
    await tx
      .select({ total: count() })
      .from(p)
      .innerJoin(a, and(eq(a.proposalId, p.id), eq(a.version, p.version)))
      .innerJoin(r, eq(r.id, a.ruleVersionId))
      .innerJoin(employee, eq(employee.id, p.employeeId))
      .where(where)
  )[0].total
  return { records, total, pageSize }
}
export async function readCurrent(tx: PayrollTransaction, id: string) {
  return (
    await tx
      .select(projection)
      .from(p)
      .innerJoin(a, and(eq(a.proposalId, p.id), eq(a.version, p.version)))
      .innerJoin(r, eq(r.id, a.ruleVersionId))
      .innerJoin(employee, eq(employee.id, p.employeeId))
      .innerJoin(user, eq(user.id, a.actorId))
      .where(eq(p.id, id))
      .limit(1)
  ).at(0)
}
export async function history(
  tx: PayrollTransaction,
  id: string,
  page: number,
  q: string,
) {
  const where = and(
    eq(p.id, id),
    q
      ? or(ilike(a.reason, pattern(q)), ilike(user.name, pattern(q)))
      : undefined,
  )
  const records = await tx
    .select(projection)
    .from(p)
    .innerJoin(a, eq(a.proposalId, p.id))
    .innerJoin(r, eq(r.id, a.ruleVersionId))
    .innerJoin(employee, eq(employee.id, p.employeeId))
    .innerJoin(user, eq(user.id, a.actorId))
    .where(where)
    .orderBy(desc(a.version))
    .limit(historyPageSize)
    .offset((page - 1) * historyPageSize)
  const total = (
    await tx
      .select({ total: count() })
      .from(a)
      .innerJoin(p, eq(a.proposalId, p.id))
      .innerJoin(user, eq(user.id, a.actorId))
      .where(where)
  )[0].total
  return { records, total, pageSize: historyPageSize }
}
export async function employeeChoices(
  tx: PayrollTransaction,
  actorId: string,
  q: string,
  page: number,
) {
  const where = and(
    ne(employee.userId, actorId),
    q
      ? or(
          ilike(employee.fullName, pattern(q)),
          ilike(employee.username, pattern(q)),
        )
      : undefined,
  )
  const records = await tx
    .select({
      id: employee.userId,
      label: employee.fullName,
      description: employee.username,
    })
    .from(employee)
    .where(where)
    .orderBy(asc(employee.fullName), asc(employee.id))
    .limit(20)
    .offset((page - 1) * 20)
  return {
    records,
    total: (await tx.select({ total: count() }).from(employee).where(where))[0]
      .total,
    pageSize: 20,
  }
}
export async function ruleChoices(
  tx: PayrollTransaction,
  date: string,
  q: string,
  page: number,
  ruleId: string | null,
) {
  const head = tx
    .selectDistinctOn([r.ruleId])
    .from(r)
    .where(lte(r.effectiveFrom, date))
    .orderBy(r.ruleId, desc(r.effectiveFrom), desc(r.version))
    .as('award_rate')
  const where = and(
    ruleId ? eq(head.ruleId, ruleId) : undefined,
    eq(head.enabled, true),
    q ? ilike(head.name, pattern(q)) : undefined,
  )
  const records = await tx
    .select()
    .from(head)
    .where(where)
    .orderBy(asc(head.name), asc(head.ruleId))
    .limit(20)
    .offset((page - 1) * 20)
  return {
    records,
    total: (await tx.select({ total: count() }).from(head).where(where))[0]
      .total,
    pageSize: 20,
  }
}
