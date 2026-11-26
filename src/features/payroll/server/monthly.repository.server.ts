import '@tanstack/react-start/server-only'
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  ilike,
  lte,
  ne,
  isNotNull,
  isNull,
  gte,
  inArray,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '#/db'
import {
  employee,
  employeeEmploymentPeriod,
  employeeSalaryTerm,
  payrollMonthlyEntry as entry,
  payrollPayment as payment,
  user,
} from '#/db/schema'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { MonthlySearch } from '../monthly.schemas'
import type { MySalaryDetail, SalaryStatement } from '../salary.types'

export const transactMonthly = db.transaction.bind(db)
export const pageSize = 20,
  historyPageSize = 10
const newestRevision = sql`${entry.version} desc nulls last`

export async function periodBoundary(
  tx: PayrollTransaction,
  date: string,
  timezone: string,
) {
  const result = await tx.execute<{ timestamp: number }>(sql`
    select (extract(epoch from (${date}::date::timestamp at time zone ${timezone})) * 1000)::float8 as timestamp
  `)
  return result.rows[0].timestamp
}

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
  const statements = tx
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
    .where(eq(current.status, 'finalized'))
    .unionAll(
      tx
        .select({
          month: payment.month,
          amountBasis: sql<SalaryStatement['amountBasis']>`'net'`.as(
            'amount_basis',
          ),
          baseMinor: sql<number>`sum(${payment.baseMinor})::int`.as(
            'base_minor',
          ),
          bonusMinor: sql<number>`sum(${payment.bonusMinor})::int`.as(
            'bonus_minor',
          ),
          premiumMinor: sql<number>`sum(${payment.premiumMinor})::int`.as(
            'premium_minor',
          ),
          fineMinor: sql<number>`sum(${payment.fineMinor})::int`.as(
            'fine_minor',
          ),
          totalMinor: sql<number>`sum(${payment.totalMinor})::int`.as(
            'total_minor',
          ),
        })
        .from(payment)
        .where(
          and(
            eq(payment.employeeId, employeeId),
            month ? eq(payment.month, `${month}-01`) : undefined,
          ),
        )
        .groupBy(payment.month),
    )
    .as('employee_statements')
  const [{ total }] = await tx.select({ total: count() }).from(statements)
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(total / historyPageSize)),
  )
  if (total === 0)
    return { records: [], total, page: currentPage, pageSize: historyPageSize }
  const records = await tx
    .select()
    .from(statements)
    .orderBy(desc(statements.month))
    .limit(historyPageSize)
    .offset((currentPage - 1) * historyPageSize)
  const payments = await tx
    .select({
      month: payment.month,
      recordedAt: payment.createdAt,
      ...paymentAmounts,
    })
    .from(payment)
    .where(
      and(
        eq(payment.employeeId, employeeId),
        inArray(
          payment.month,
          records.map((record) => record.month),
        ),
      ),
    )
    .orderBy(payment.paidOn, payment.createdAt, payment.id)
  const now = Date.now()
  return {
    records: records.map((record) => {
      const published = payments.filter((line) => line.month === record.month)
      return {
        ...record,
        month: record.month.slice(0, 7),
        ...(published.length
          ? {
              payments: published.map(
                ({ month: _month, recordedAt, ...line }) => {
                  const publishedAt = recordedAt.getTime()
                  const recentUntil = publishedAt + 24 * 60 * 60 * 1000
                  return publishedAt <= now && recentUntil > now
                    ? { ...line, recentUntil }
                    : line
                },
              ),
            }
          : {}),
      }
    }),
    total,
    page: currentPage,
    pageSize: historyPageSize,
  }
}
const paymentAmounts = {
  stage: payment.stage,
  paidOn: payment.paidOn,
  baseMinor: payment.baseMinor,
  bonusMinor: payment.bonusMinor,
  premiumMinor: payment.premiumMinor,
  fineMinor: payment.fineMinor,
  totalMinor: payment.totalMinor,
}
export function employeePayments(
  tx: PayrollTransaction,
  employeeId: string,
  month: string,
) {
  return tx
    .select(paymentAmounts)
    .from(payment)
    .where(
      and(eq(payment.employeeId, employeeId), eq(payment.month, `${month}-01`)),
    )
    .orderBy(payment.paidOn, payment.createdAt, payment.id)
}
export function monthPayments(
  tx: PayrollTransaction,
  month: string,
  employeeId?: string,
) {
  return tx
    .select({
      employeeId: payment.employeeId,
      policyVersion: payment.policyVersion,
      ...paymentAmounts,
    })
    .from(payment)
    .where(
      and(
        eq(payment.month, `${month}-01`),
        employeeId === undefined
          ? undefined
          : eq(payment.employeeId, employeeId),
      ),
    )
}
export async function monthPaymentPolicy(
  tx: PayrollTransaction,
  month: string,
) {
  const records = await tx
    .select({ version: payment.policyVersion })
    .from(payment)
    .where(eq(payment.month, `${month}-01`))
    .limit(1)
  return records.at(0)?.version
}
export function paymentRetries(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
) {
  return tx
    .select({ commandHash: payment.commandHash })
    .from(payment)
    .where(and(eq(payment.actorId, actorId), eq(payment.requestId, requestId)))
}
export function insertPayments(
  tx: PayrollTransaction,
  values: (typeof payment.$inferInsert)[],
) {
  return tx.insert(payment).values(values)
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
export function paymentCandidates(
  tx: PayrollTransaction,
  month: string,
  end: string,
  userId?: string,
) {
  const current = latest(tx, month)
  return tx
    .select({
      employeeId: employee.id,
      userId: employee.userId,
      name: employee.fullName,
      draft: getTableColumns(entry),
    })
    .from(employee)
    .leftJoin(current, eq(current.employeeId, employee.id))
    .leftJoin(entry, eq(entry.id, current.id))
    .where(
      userId === undefined
        ? or(
            isNotNull(current.id),
            exists(
              tx
                .select({ id: employeeSalaryTerm.id })
                .from(employeeSalaryTerm)
                .where(
                  and(
                    eq(employeeSalaryTerm.employeeId, employee.id),
                    lte(employeeSalaryTerm.effectiveFrom, end),
                  ),
                ),
            ),
          )
        : eq(employee.userId, userId),
    )
    .orderBy(employee.userId)
    .limit(1001)
}
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
  limit = pageSize,
) {
  const current = latest(tx, month)
  const issued = tx
    .select({
      employeeId: payment.employeeId,
      paidMinor: sql<number>`sum(${payment.totalMinor})::int`.as('paid_minor'),
      firstPaidOn: sql<
        string | null
      >`(max(${payment.paidOn}) filter (where ${payment.stage} = 'first'))::text`.as(
        'first_paid_on',
      ),
      salaryPaidOn:
        sql<string>`(max(${payment.paidOn}) filter (where ${payment.stage} = 'salary'))::text`.as(
          'salary_paid_on',
        ),
      salaryBaseMinor: sql<number>`sum(${payment.baseMinor})::int`.as(
        'salary_base_minor',
      ),
      firstPaidBase: sql<
        number | null
      >`(sum(${payment.baseMinor}) filter (where ${payment.stage} = 'first'))::int`.as(
        'first_paid_base',
      ),
      salaryPaidFine: sql<
        number | null
      >`(sum(${payment.fineMinor}) filter (where ${payment.stage} = 'salary'))::int`.as(
        'salary_paid_fine',
      ),
      adjustmentsPaidOn:
        sql<string>`(max(${payment.paidOn}) filter (where ${payment.stage} = 'adjustments'))::text`.as(
          'adjustments_paid_on',
        ),
      salaryFinePaidOn:
        sql<string>`(max(${payment.paidOn}) filter (where ${payment.stage} = 'salary' and ${payment.fineMinor} > 0))::text`.as(
          'salary_fine_paid_on',
        ),
      paidAdjustments:
        sql<boolean>`bool_or(${payment.stage} = 'adjustments' or ${payment.fineMinor} > 0)`.as(
          'paid_adjustments',
        ),
    })
    .from(payment)
    .where(eq(payment.month, `${month}-01`))
    .groupBy(payment.employeeId)
    .as('issued_payroll')
  const join = and(
    eq(employee.id, current.employeeId),
    ne(current.status, 'voided'),
  )
  const where = and(
    includeUnpreparedFor
      ? or(
          isNotNull(current.id),
          isNotNull(issued.employeeId),
          ne(employee.userId, includeUnpreparedFor),
        )
      : or(isNotNull(current.id), isNotNull(issued.employeeId)),
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
      employeeId: employee.id,
      employeeName: employee.fullName,
      userId: employee.userId,
      version: current.version,
      status: current.status,
      salary: current.salary,
      sourceToken: current.sourceToken,
      manualBase: current.manualBase,
      firstPaymentMinor: current.firstPaymentMinor,
      fineStage: current.fineStage,
      paymentDates: current.paymentDates,
      baseMinor: current.baseMinor,
      bonusMinor: current.bonusMinor,
      premiumMinor: current.premiumMinor,
      fineMinor: current.fineMinor,
      totalMinor: current.totalMinor,
      paidMinor: issued.paidMinor,
      paidAdjustments: issued.paidAdjustments,
      firstPaidOn: issued.firstPaidOn,
      salaryPaidOn: issued.salaryPaidOn,
      salaryBaseMinor: issued.salaryBaseMinor,
      firstPaidBase: issued.firstPaidBase,
      salaryPaidFine: issued.salaryPaidFine,
      adjustmentsPaidOn: issued.adjustmentsPaidOn,
      salaryFinePaidOn: issued.salaryFinePaidOn,
    })
    .from(employee)
    .leftJoin(current, join)
    .leftJoin(issued, eq(issued.employeeId, employee.id))
    .where(where)
    .orderBy(
      search.sort === 'name_desc'
        ? desc(employee.fullName)
        : asc(employee.fullName),
      employee.id,
    )
    .limit(limit)
    .offset((search.page - 1) * pageSize)
  const total = (
    await tx
      .select({ total: count() })
      .from(employee)
      .leftJoin(current, join)
      .leftJoin(issued, eq(issued.employeeId, employee.id))
      .where(where)
  )[0].total
  return { records, total }
}
export function directorySalaryTerms(
  tx: PayrollTransaction,
  employeeIds: string[],
  start: string,
  end: string,
) {
  const term = employeeSalaryTerm
  const period = employeeEmploymentPeriod
  const coveringEmployment = tx
    .select({ id: period.id })
    .from(period)
    .where(
      and(
        eq(period.employeeId, term.employeeId),
        isNull(period.voidedAt),
        lte(period.startDate, start),
        or(isNull(period.endDate), gte(period.endDate, end)),
      ),
    )
  return tx
    .selectDistinctOn([term.employeeId], {
      employeeId: term.employeeId,
      salary: {
        version: term.version,
        effectiveFrom: term.effectiveFrom,
        kind: term.kind,
        amountMinor: term.amountMinor,
        amountBasis: term.amountBasis,
        currency: term.currency,
      },
      fullEmployment: sql<boolean>`exists (${coveringEmployment})`,
    })
    .from(term)
    .where(
      and(inArray(term.employeeId, employeeIds), lte(term.effectiveFrom, end)),
    )
    .orderBy(term.employeeId, desc(term.effectiveFrom), desc(term.version))
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
