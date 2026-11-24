import '@tanstack/react-start/server-only'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '#/db'
import {
  payrollBonusRule as rule,
  payrollBonusRuleVersion as v,
  user,
} from '#/db/schema'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { BonusRuleSearch } from '../bonus-rules.schemas'

export const transactBonusRules = db.transaction.bind(db)
export const pageSize = 20
export const historyPageSize = 10
const fact = {
  ruleId: v.ruleId,
  version: v.version,
  effectiveFrom: v.effectiveFrom,
  name: v.name,
  kind: v.kind,
  calculation: v.calculation,
  unitLabel: v.unitLabel,
  qualification: v.qualification,
  amountMinor: v.amountMinor,
  amountBasis: v.amountBasis,
  currency: v.currency,
  enabled: v.enabled,
}
export async function lockCommand(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`payroll-bonus-command:${actorId}:${requestId}`}, 0))`,
  )
}
export async function lockRule(tx: PayrollTransaction, ruleId: string) {
  return (
    await tx
      .select({ id: rule.id })
      .from(rule)
      .where(eq(rule.id, ruleId))
      .for('update')
  ).at(0)
}
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
export async function createRule(tx: PayrollTransaction) {
  return (await tx.insert(rule).values({}).returning({ id: rule.id }))[0].id
}
export async function insertVersion(
  tx: PayrollTransaction,
  values: typeof v.$inferInsert,
) {
  await tx.insert(v).values(values)
}
export async function latest(tx: PayrollTransaction, ruleId: string) {
  return (
    await tx
      .select(fact)
      .from(v)
      .where(eq(v.ruleId, ruleId))
      .orderBy(desc(v.version))
      .limit(1)
  ).at(0)
}
async function applicableMany(
  tx: PayrollTransaction,
  ids: string[],
  date: string,
  future = false,
) {
  if (!ids.length) return []
  return tx
    .selectDistinctOn([v.ruleId], fact)
    .from(v)
    .where(
      and(
        inArray(v.ruleId, ids),
        future ? gt(v.effectiveFrom, date) : lte(v.effectiveFrom, date),
      ),
    )
    .orderBy(
      v.ruleId,
      future ? asc(v.effectiveFrom) : desc(v.effectiveFrom),
      desc(v.version),
    )
}
export async function states(
  tx: PayrollTransaction,
  ids: string[],
  date: string,
) {
  const current = await applicableMany(tx, ids, date)
  const next = await applicableMany(tx, ids, date, true)
  return {
    current: new Map(current.map((row) => [row.ruleId, row])),
    next: new Map(next.map((row) => [row.ruleId, row])),
  }
}
export async function directory(
  tx: PayrollTransaction,
  search: BonusRuleSearch,
  today: string,
) {
  const head = tx
    .selectDistinctOn([v.ruleId], fact)
    .from(v)
    .orderBy(v.ruleId, desc(v.version))
    .as('bonus_head')
  const escaped = search.q.replace(/[\\%_]/g, '\\$&')
  const where = and(
    search.q ? ilike(head.name, `%${escaped}%`) : undefined,
    search.kind === 'all' ? undefined : eq(head.kind, search.kind),
  )
  const rows = await tx
    .select()
    .from(head)
    .where(where)
    .orderBy(
      search.sort === 'name_desc' ? desc(head.name) : asc(head.name),
      asc(head.ruleId),
    )
    .limit(pageSize)
    .offset((search.page - 1) * pageSize)
  const total = (await tx.select({ total: count() }).from(head).where(where))[0]
    .total
  const { current, next } = await states(
    tx,
    rows.map((row) => row.ruleId),
    today,
  )
  return {
    total,
    pageSize,
    items: rows.map((row) => ({
      ruleId: row.ruleId,
      latest: row,
      current: current.get(row.ruleId) ?? null,
      next: next.get(row.ruleId) ?? null,
    })),
  }
}
export async function history(
  tx: PayrollTransaction,
  ruleId: string,
  page: number,
  q: string,
) {
  const escaped = q.replace(/[\\%_]/g, '\\$&')
  const where = and(
    eq(v.ruleId, ruleId),
    q
      ? or(ilike(v.reason, `%${escaped}%`), ilike(user.name, `%${escaped}%`))
      : undefined,
  )
  const rows = await tx
    .select({
      ...fact,
      reason: v.reason,
      actorName: user.name,
      createdAt: v.createdAt,
    })
    .from(v)
    .innerJoin(user, eq(user.id, v.actorId))
    .where(where)
    .orderBy(desc(v.version))
    .limit(historyPageSize)
    .offset((page - 1) * historyPageSize)
  const total = (
    await tx
      .select({ total: count() })
      .from(v)
      .innerJoin(user, eq(user.id, v.actorId))
      .where(where)
  )[0].total
  return { rows, total }
}
