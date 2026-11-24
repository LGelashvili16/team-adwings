import '@tanstack/react-start/server-only'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '#/db'
import { employee, employeeSalaryTerm as term, user } from '#/db/schema'
import type { SalaryDirectorySearch } from '../salary.schemas'
import type { PayrollTransaction } from './payroll-settings.repository.server'

export const transactSalaries = db.transaction.bind(db)
export const pageSize = 20
export const historyPageSize = 10
const termColumns = {
  version: term.version,
  effectiveFrom: term.effectiveFrom,
  kind: term.kind,
  amountBasis: term.amountBasis,
  amountMinor: term.amountMinor,
  currency: term.currency,
}
const personColumns = {
  id: employee.id,
  userId: employee.userId,
  name: employee.fullName,
  username: employee.username,
  jobTitle: employee.jobTitle,
  status: employee.status,
}
export async function person(
  tx: PayrollTransaction,
  userId: string,
  lock = false,
) {
  const query = tx
    .select(personColumns)
    .from(employee)
    .where(eq(employee.userId, userId))
  return (await (lock ? query.for('update') : query)).at(0)
}
export async function latestVersion(
  tx: PayrollTransaction,
  employeeId: string,
) {
  return (
    (
      await tx
        .select({ version: term.version })
        .from(term)
        .where(eq(term.employeeId, employeeId))
        .orderBy(desc(term.version))
        .limit(1)
    ).at(0)?.version ?? 0
  )
}
export async function applicable(
  tx: PayrollTransaction,
  employeeId: string,
  date: string,
  future = false,
) {
  return (
    (
      await tx
        .select(termColumns)
        .from(term)
        .where(
          and(
            eq(term.employeeId, employeeId),
            future
              ? gt(term.effectiveFrom, date)
              : lte(term.effectiveFrom, date),
          ),
        )
        .orderBy(
          future ? asc(term.effectiveFrom) : desc(term.effectiveFrom),
          desc(term.version),
        )
        .limit(1)
    ).at(0) ?? null
  )
}
export async function history(
  tx: PayrollTransaction,
  employeeId: string,
  page: number,
  audit: boolean,
) {
  // Self-service never selects administrative reasons or author details.
  if (!audit)
    return tx
      .select({ ...termColumns, createdAt: term.createdAt })
      .from(term)
      .where(eq(term.employeeId, employeeId))
      .orderBy(desc(term.version))
      .limit(historyPageSize)
      .offset((page - 1) * historyPageSize)
  return tx
    .select({
      ...termColumns,
      createdAt: term.createdAt,
      reason: term.reason,
      actorName: user.name,
    })
    .from(term)
    .innerJoin(user, eq(user.id, term.actorId))
    .where(eq(term.employeeId, employeeId))
    .orderBy(desc(term.version))
    .limit(historyPageSize)
    .offset((page - 1) * historyPageSize)
}
export async function totalHistory(tx: PayrollTransaction, employeeId: string) {
  return (
    await tx
      .select({ total: count() })
      .from(term)
      .where(eq(term.employeeId, employeeId))
  )[0].total
}
export async function insert(
  tx: PayrollTransaction,
  values: typeof term.$inferInsert,
) {
  await tx.insert(term).values(values)
}

export async function directory(
  tx: PayrollTransaction,
  search: SalaryDirectorySearch,
  today: string,
) {
  const current = tx
    .select(termColumns)
    .from(term)
    .where(
      and(eq(term.employeeId, employee.id), lte(term.effectiveFrom, today)),
    )
    .orderBy(desc(term.effectiveFrom), desc(term.version))
    .limit(1)
    .as('current_salary')
  const next = tx
    .select(termColumns)
    .from(term)
    .where(and(eq(term.employeeId, employee.id), gt(term.effectiveFrom, today)))
    .orderBy(asc(term.effectiveFrom), desc(term.version))
    .limit(1)
    .as('next_salary')
  const pattern = `%${search.q.replace(/[\\%_]/g, '\\$&')}%`
  const scope = and(
    search.status !== 'all' ? eq(employee.status, search.status) : undefined,
    search.q
      ? or(
          ilike(employee.fullName, pattern),
          ilike(employee.username, pattern),
          ilike(employee.jobTitle, pattern),
        )
      : undefined,
  )
  const where = and(
    scope,
    search.kind === 'all'
      ? undefined
      : search.kind === 'unconfigured'
        ? isNull(current.kind)
        : eq(current.kind, search.kind),
  )
  const query = () =>
    tx
      .select({
        ...personColumns,
        version: sql<number>`(select coalesce(max(st.version),0) from employee_salary_term st where st.employee_id = ${employee.id})`,
        current: {
          version: current.version,
          effectiveFrom: current.effectiveFrom,
          kind: current.kind,
          amountBasis: current.amountBasis,
          amountMinor: current.amountMinor,
          currency: current.currency,
        },
        next: {
          version: next.version,
          effectiveFrom: next.effectiveFrom,
          kind: next.kind,
          amountBasis: next.amountBasis,
          amountMinor: next.amountMinor,
          currency: next.currency,
        },
      })
      .from(employee)
      .leftJoinLateral(current, sql`true`)
      .leftJoinLateral(next, sql`true`)
  const records = await query()
    .where(where)
    .orderBy(
      search.sort === 'name' ? asc(employee.fullName) : desc(employee.fullName),
      asc(employee.id),
    )
    .limit(pageSize)
    .offset((search.page - 1) * pageSize)
  const total = (
    await tx
      .select({ total: count() })
      .from(employee)
      .leftJoinLateral(current, sql`true`)
      .where(where)
  )[0].total
  const counts = (
    await tx
      .select({
        monthly:
          sql<number>`count(*) filter (where ${current.kind} = 'monthly')`.mapWith(
            Number,
          ),
        hourly:
          sql<number>`count(*) filter (where ${current.kind} = 'hourly')`.mapWith(
            Number,
          ),
        unconfigured:
          sql<number>`count(*) filter (where ${current.kind} is null)`.mapWith(
            Number,
          ),
      })
      .from(employee)
      .leftJoinLateral(current, sql`true`)
      .where(scope)
  )[0]
  return {
    records: records.map(({ id: _id, ...row }) => row),
    total,
    counts,
    pageSize,
    today,
  }
}
