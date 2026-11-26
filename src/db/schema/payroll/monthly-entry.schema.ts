import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core'
import { createdAt, uuidv7PrimaryKey } from '../_shared/columns'
import { employee } from '../employees/employee.schema'
import { user } from '../auth/auth.schema'
import type {
  MonthlyAdjustment,
  MonthlyPaymentDates,
} from '#/features/payroll/monthly.schemas'
import type { SalaryTerm } from '#/features/payroll/salary.types'
import type { FineStage } from '#/features/payroll/payroll-settings.schemas'

/** One immutable revision of an employee's monthly payroll. Latest revision wins; month decisions append every affected row atomically. No payment or tax posting is represented. */
export const payrollMonthlyEntry = pgTable(
  'payroll_monthly_entry',
  {
    /** Database-generated UUIDv7 revision identity. */
    id: uuidv7PrimaryKey(),
    /** Employee whose statement retains the contractual basis. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** First calendar date of the selected company-local month. */
    month: date('month', { mode: 'string' }).notNull(),
    /** Increasing revision within this employee and month. */
    version: integer('version').notNull(),
    /** Draft, locked final statement or removed draft; reopening/restoring appends a revision. */
    status: text('status').$type<'draft' | 'finalized' | 'voided'>().notNull(),
    /** A missing snapshot means only adjustments have been entered. */
    salary: jsonb('salary').$type<SalaryTerm>(),
    /** Fingerprint of confirmed employment and applicable salary history. */
    sourceToken: text('source_token'),
    /** Accountant-confirmed whole seconds for hourly pay; zero for fixed salaries. */
    workedSeconds: integer('worked_seconds').notNull(),
    /** Whether the base is explicitly confirmed instead of using a full monthly amount or one hourly rate. */
    manualBase: boolean('manual_base').notNull(),
    /** Explanation for a manually confirmed or partial-month base, empty for automatic bases. */
    baseReason: text('base_reason').notNull(),
    /** Exact base earnings in tetri, separate from fines and statutory withholdings. */
    baseMinor: integer('base_minor').notNull(),
    firstPaymentMinor: integer('first_payment_minor'),
    fineStage: text('fine_stage').$type<FineStage>(),
    paymentDates: jsonb('payment_dates').$type<MonthlyPaymentDates>(),
    /** Up to twenty simple amount/reason lines, validated at the server boundary. */
    adjustments: jsonb('adjustments').$type<MonthlyAdjustment[]>().notNull(),
    /** Exact bonus subtotal in tetri. */
    bonusMinor: integer('bonus_minor').notNull(),
    /** Exact premium subtotal in tetri. */
    premiumMinor: integer('premium_minor').notNull(),
    /** Exact fine subtotal in tetri, never a reduction of the stored base. */
    fineMinor: integer('fine_minor').notNull(),
    /** Contractual base plus bonuses and premiums minus fines, with no inferred tax result. */
    totalMinor: integer('total_minor').notNull(),
    /** Trusted author of this immutable save or month decision. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Required reason for a save, finalization or reopening. */
    reason: text('reason').notNull(),
    /** Actor-scoped retry identity; a month decision shares it across affected employees. */
    requestId: uuid('request_id').notNull(),
    /** Validated command fingerprint, preventing changed retries from being accepted. */
    commandHash: text('command_hash').notNull(),
    /** Database-generated UTC audit instant. */
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payroll_monthly_entry_revision').on(
      t.month,
      t.employeeId,
      t.version.desc(),
    ),
    uniqueIndex('payroll_monthly_entry_retry').on(
      t.actorId,
      t.requestId,
      t.employeeId,
    ),
    index('payroll_monthly_entry_employee_history').on(
      t.employeeId,
      t.month.desc().nullsFirst(),
      t.version.desc().nullsLast(),
    ),
    check(
      'payroll_monthly_entry_scope',
      sql`${t.version} > 0 and ${t.month} between date '2000-01-01' and date '2100-12-01' and extract(day from ${t.month}) = 1 and ${t.status} in ('draft','finalized','voided')`,
    ),
    check(
      'payroll_monthly_entry_amounts',
      sql`${t.baseMinor} between 0 and 100000000 and ${t.bonusMinor} between 0 and 100000000 and ${t.premiumMinor} between 0 and 100000000 and ${t.fineMinor} between 0 and 100000000 and ${t.totalMinor} between -100000000 and 100000000 and (${t.salary} is null or ${t.totalMinor} >= 0) and ${t.totalMinor} = ${t.baseMinor} + ${t.bonusMinor} + ${t.premiumMinor} - ${t.fineMinor}`,
    ),
    check(
      'payroll_monthly_entry_time',
      sql`${t.workedSeconds} between 0 and 2678400`,
    ),
    check(
      'payroll_monthly_entry_payment_options',
      sql`(${t.firstPaymentMinor} is null or ${t.firstPaymentMinor} between 0 and ${t.baseMinor}) and (${t.fineStage} is null or ${t.fineStage} in ('salary','adjustments'))`,
    ),
    check(
      'payroll_monthly_entry_salary_snapshot',
      sql`(${t.salary} is not null and ${t.sourceToken} is not null) or (${t.salary} is null and ${t.sourceToken} is null and ${t.status} <> 'finalized' and ${t.baseMinor} = 0 and ${t.workedSeconds} = 0 and not ${t.manualBase} and ${t.baseReason} = '')`,
    ),
    check(
      'payroll_monthly_entry_evidence',
      sql`length(trim(${t.reason})) between 5 and 500 and length(${t.baseReason}) <= 500 and (not ${t.manualBase} or length(trim(${t.baseReason})) >= 5) and jsonb_typeof(${t.adjustments}) = 'array' and jsonb_array_length(${t.adjustments}) <= 20 and (${t.sourceToken} is null or ${t.sourceToken} ~ '^[a-f0-9]{64}$') and ${t.commandHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
)
