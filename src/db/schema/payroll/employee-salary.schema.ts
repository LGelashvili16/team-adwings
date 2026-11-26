import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, uuidv7PrimaryKey } from '../_shared/columns'
import { employee } from '../employees/employee.schema'
import { user } from '../auth/auth.schema'

/** Immutable salary agreements and their audit. At a date, greatest effective date then greatest version wins. */
export const employeeSalaryTerm = pgTable(
  'employee_salary_term',
  {
    /** PostgreSQL-generated UUIDv7 record identity. */
    id: uuidv7PrimaryKey(),
    /** Employee whose salary agreement is recorded. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** Monotonic per-employee revision, including same-date corrections. */
    version: integer('version').notNull(),
    /** Inclusive company-local date on which this agreement takes effect. */
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    /** Monthly fixed amount or an hourly rate, never payable attendance itself. */
    kind: text('kind').$type<'monthly' | 'hourly'>().notNull(),
    /** Whether the contractual amount is before deductions or an agreed take-home amount. */
    amountBasis: text('amount_basis').$type<'gross' | 'net'>().notNull(),
    /** Exact agreed money in integer tetri; missing configuration is not a zero row. */
    amountMinor: integer('amount_minor').notNull(),
    /** Explicit currency; this initial payroll workflow supports Georgian lari. */
    currency: text('currency').$type<'GEL'>().notNull(),
    /** Trusted authenticated author of this immutable change. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Administrative audit note or earlier explanation, excluded from employee self-service. */
    reason: text('reason').notNull(),
    /** Database-generated UTC recording instant. */
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('employee_salary_term_version').on(
      table.employeeId,
      table.version,
    ),
    index('employee_salary_term_effective').on(
      table.employeeId,
      table.effectiveFrom,
      table.version,
    ),
    check('employee_salary_term_version_valid', sql`${table.version} > 0`),
    check(
      'employee_salary_term_date_valid',
      sql`${table.effectiveFrom} between date '1900-01-01' and date '2100-12-31'`,
    ),
    check(
      'employee_salary_term_kind_valid',
      sql`${table.kind} in ('monthly','hourly')`,
    ),
    check(
      'employee_salary_term_basis_valid',
      sql`${table.amountBasis} in ('gross','net')`,
    ),
    check(
      'employee_salary_term_amount_valid',
      sql`${table.amountMinor} between 1 and 100000000 and ${table.currency} = 'GEL'`,
    ),
    check(
      'employee_salary_term_reason_valid',
      sql`length(trim(${table.reason})) between 5 and 500`,
    ),
  ],
)
