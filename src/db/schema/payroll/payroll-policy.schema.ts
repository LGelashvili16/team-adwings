import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import { createdAt } from '#/db/schema/_shared/columns'
import { user } from '#/db/schema/auth/auth.schema'

/** One immutable company payroll policy version. Each save retains its author and reason; the highest version for an effective date supersedes earlier saves for that date. */
export const payrollPolicy = pgTable(
  'payroll_policy',
  {
    /** Monotonic company version allocated under a transaction lock; also the natural primary key. */
    version: integer('version').primaryKey(),
    /** First applicable company-local date; past-effective writes are forbidden by the service. */
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    /** Default agreement basis: gross earnings or net take-home amount; individual contracts will retain their own terms. */
    amountBasis: text('amount_basis').$type<'gross' | 'net'>().notNull(),
    /** Monthly fixed-pay divisor: scheduled workdays, calendar days, or a fixed thirty days. */
    dayBasis: text('day_basis')
      .$type<'scheduled_workdays' | 'calendar_days' | 'fixed_30'>()
      .notNull(),
    /** Whether built-in income-tax computation is selected; false delegates withholding to external accounting. */
    incomeTaxEnabled: boolean('income_tax_enabled').notNull(),
    /** Income-tax percentage in hundredths of a percent: 2000 means 20%. */
    incomeTaxBasisPoints: integer('income_tax_basis_points').notNull(),
    /** Whether built-in pension computation is selected; employee participation must still be verified separately. */
    pensionEnabled: boolean('pension_enabled').notNull(),
    /** Employee-funded pension percentage in hundredths of a percent: 200 means 2%. */
    employeePensionBasisPoints: integer(
      'employee_pension_basis_points',
    ).notNull(),
    /** Employer-funded additional pension expense, never withheld from employee net pay; hundredths of a percent. */
    employerPensionBasisPoints: integer(
      'employer_pension_basis_points',
    ).notNull(),
    /** Authenticated account that saved this version; retained even if access is later revoked. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Required explanation for this policy change, retained with the previous immutable versions. */
    reason: text('reason').notNull(),
    /** Database-generated UTC instant of the change. */
    createdAt: createdAt(),
  },
  (table) => [
    index('payroll_policy_effective').on(table.effectiveFrom, table.version),
    check('payroll_policy_version_valid', sql`${table.version} > 0`),
    check(
      'payroll_policy_amount_basis_valid',
      sql`${table.amountBasis} in ('gross', 'net')`,
    ),
    check(
      'payroll_policy_day_basis_valid',
      sql`${table.dayBasis} in ('scheduled_workdays', 'calendar_days', 'fixed_30')`,
    ),
    check(
      'payroll_policy_rates_valid',
      sql`${table.incomeTaxBasisPoints} between 1 and 10000 and ${table.employeePensionBasisPoints} between 1 and 10000 and ${table.employerPensionBasisPoints} between 1 and 10000`,
    ),
    check(
      'payroll_policy_reason_valid',
      sql`length(trim(${table.reason})) between 5 and 500`,
    ),
  ],
)
