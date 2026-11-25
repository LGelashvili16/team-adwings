import '@tanstack/react-start/server-only'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  lte,
  ne,
  isNotNull,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '#/db'
import {
  employee,
  employeeSalaryTerm,
  payrollMonthlyEntry as entry,
  user,
} from '#/db/schema'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { MonthlySearch } from '../monthly.schemas'
import type { MySalaryDetail, SalaryStatement } from '../salary.types'

export const transactMonthly = db.transaction.bind(db)
export const pageSize = 20,
  historyPageSize = 10
const newestRevision = sql`${entry.version} desc nulls last`

export async function employeeStatements(
  tx: PayrollTransaction,
  employeeId: string,
  page: number,
  month?: string,
): Promise<MySalaryDetail['statements']> {
  // Apply finalized status after selecting the latest revision so reopening
  // a month does not expose its older finalized version to the employee.
  const current = tx
    .selectDistinctOn([entry.month], {
      month: entry.month,
      status: entry.status,
      amountBasis: sql<
        SalaryStatement['amountBasis']
      >`${entry.salary} ->> 'amountBasis'`.as('amount_basis'),
      baseMinor: entry.baseMinor,
      bonusMinor: entry.bonusMinor,
      premiumMinor: entry.premiumMinor,
      fineMinor: entry.fineMinor,
      totalMinor: entry.totalMinor,
    })
    .from(entry)
    .where(
      and(
        eq(entry.employeeId, employeeId),
        month ? eq(entry.month, `${month}-01`) : undefined,
      ),
    )
    .orderBy(desc(entry.month), newestRevision)
    .as('current_employee_statements')
  const where = eq(current.status, 'finalized')
  const [{ total }] = await tx
    .select({ total: count() })
    .from(current)
    .where(where)
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(total / historyPageSize)),
  )
  if (total === 0)
    return { records: [], total, page: currentPage, pageSize: historyPageSize }
  const records = await tx
    .select({
      month: current.month,
      amountBasis: current.amountBasis,
      baseMinor: current.baseMinor,
      bonusMinor: current.bonusMinor,
      premiumMinor: current.premiumMinor,
      fineMinor: current.fineMinor,
      totalMinor: current.totalMinor,
    })
    .from(current)
    .where(where)
    .orderBy(desc(current.month))
    .limit(historyPageSize)
    .offset((currentPage - 1) * historyPageSize)
  return {
    records: records.map((record) => ({
      ...record,
      month: record.month.slice(0, 7),
    })),
    total,
    page: currentPage,
    pageSize: historyPageSize,
  }
}
export async function lockMonth(tx: PayrollTransaction, month: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('payroll-month'), hashtext(${month}))`,
  )
}
export async function lockCommand(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${actorId}), hashtext(${requestId}))`,
  )
}
export function retries(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
) {
  return tx
    .select({ commandHash: entry.commandHash })
    .from(entry)
    .where(and(eq(entry.actorId, actorId), eq(entry.requestId, requestId)))
    .limit(1001)
}
const latest = (tx: PayrollTransaction, month: string) =>
  tx
    .selectDistinctOn([entry.employeeId])
    .from(entry)
    .where(eq(entry.month, `${month}-01`))
    .orderBy(entry.employeeId, newestRevision)
    .as('latest_monthly_entry')
export function monthState(tx: PayrollTransaction, month: string) {
  const current = latest(tx, month)
  return tx
    .select({
      employeeId: current.employeeId,
      version: current.version,
      status: current.status,
    })
    .from(current)
    .orderBy(current.employeeId)
    .limit(1001)
}
export async function currentEntry(
  tx: PayrollTransaction,
  employeeId: string,
  month: string,
) {
  return (
    await tx
      .select()
      .from(entry)
      .where(
        and(eq(entry.employeeId, employeeId), eq(entry.month, `${month}-01`)),
      )
      .orderBy(newestRevision)
      .limit(1)
  ).at(0)
}
export async function salarySources(
  tx: PayrollTransaction,
  employeeId: string,
  start: string,
  end: string,
) {
  const initial = await tx
    .select()
    .from(employeeSalaryTerm)
    .where(
      and(
        eq(employeeSalaryTerm.employeeId, employeeId),
        lte(employeeSalaryTerm.effectiveFrom, start),
      ),
    )
    .orderBy(
      desc(employeeSalaryTerm.effectiveFrom),
      desc(employeeSalaryTerm.version),
    )
    .limit(1)
  const changes = await tx
    .selectDistinctOn([employeeSalaryTerm.effectiveFrom])
    .from(employeeSalaryTerm)
    .where(
      and(
        eq(employeeSalaryTerm.employeeId, employeeId),
        gt(employeeSalaryTerm.effectiveFrom, start),
        lte(employeeSalaryTerm.effectiveFrom, end),
      ),
    )
    .orderBy(
      asc(employeeSalaryTerm.effectiveFrom),
      desc(employeeSalaryTerm.version),
    )
  return [...initial, ...changes]
}
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`
export async function employees(
  tx: PayrollTransaction,
  q: string,
  page: number,
) {
  const where = q
    ? or(
        ilike(employee.fullName, pattern(q)),
        ilike(employee.username, pattern(q)),
      )
    : undefined
  return {
    records: (
      await tx
        .select({
          id: employee.userId,
          label: employee.fullName,
          description: employee.jobTitle,
        })
        .from(employee)
        .where(where)
        .orderBy(employee.fullName, employee.id)
        .limit(pageSize)
        .offset((page - 1) * pageSize)
    ).map((r) => ({ ...r, description: r.description ?? '' })),
    total: (await tx.select({ total: count() }).from(employee).where(where))[0]
      .total,
    pageSize,
  }
}
export async function directory(
  tx: PayrollTransaction,
  month: string,
  search: MonthlySearch,
  includeUnpreparedFor: string | undefined,
) {
  const current = latest(tx, month)
  const join = and(
    eq(employee.id, current.employeeId),
    ne(current.status, 'voided'),
  )
  const where = and(
    includeUnpreparedFor
      ? or(isNotNull(current.id), ne(employee.userId, includeUnpreparedFor))
      : isNotNull(current.id),
    search.view === 'bonuses'
      ? sql`(${current.bonusMinor} > 0 or ${current.premiumMinor} > 0 or ${current.fineMinor} > 0)`
      : undefined,
    search.q
      ? or(
          ilike(employee.fullName, pattern(search.q)),
          ilike(employee.username, pattern(search.q)),
        )
      : undefined,
  )
  const records = await tx
    .select({
      employeeName: employee.fullName,
      userId: employee.userId,
      version: current.version,
      status: current.status,
      salary: current.salary,
      baseMinor: current.baseMinor,
      bonusMinor: current.bonusMinor,
      premiumMinor: current.premiumMinor,
      fineMinor: current.fineMinor,
      totalMinor: current.totalMinor,
    })
    .from(employee)
    .leftJoin(current, join)
    .where(where)
    .orderBy(
      search.sort === 'name_desc'
        ? desc(employee.fullName)
        : asc(employee.fullName),
      employee.id,
    )
    .limit(pageSize)
    .offset((search.page - 1) * pageSize)
  const total = (
    await tx
      .select({ total: count() })
      .from(employee)
      .leftJoin(current, join)
      .where(where)
  )[0].total
  return { records, total }
}
export async function history(
  tx: PayrollTransaction,
  employeeId: string,
  month: string,
  page: number,
) {
  const where = and(
    eq(entry.employeeId, employeeId),
    eq(entry.month, `${month}-01`),
  )
  const records = await tx
    .select({
      entry,
      employeeName: employee.fullName,
      userId: employee.userId,
      actorName: user.name,
    })
    .from(entry)
    .innerJoin(employee, eq(employee.id, entry.employeeId))
    .innerJoin(user, eq(user.id, entry.actorId))
    .where(where)
    .orderBy(newestRevision)
    .limit(historyPageSize)
    .offset((page - 1) * historyPageSize)
  const total = (
    await tx.select({ total: count() }).from(entry).where(where)
  )[0].total
  return { records, total }
}
export async function insert(
  tx: PayrollTransaction,
  values: typeof entry.$inferInsert,
) {
  await tx.insert(entry).values(values)
}
