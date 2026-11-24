import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  createdAt,
  timestamps,
  uuidv7PrimaryKey,
} from '#/db/schema/_shared/columns'
import { employee } from './employee.schema'
import { user } from '#/db/schema/auth/auth.schema'
import type { EmploymentPeriodFacts } from '#/features/employees/employment.types'

/** One HR-confirmed inclusive employment period used for payroll eligibility. Rehires have separate rows. Voiding retains the row and audit; these dates do not change account access. */
export const employeeEmploymentPeriod = pgTable(
  'employee_employment_period',
  {
    /** PostgreSQL 18 UUIDv7 identifier retained when period dates are corrected. */
    id: uuidv7PrimaryKey(),
    /** Employee whose confirmed eligibility interval this row describes. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** First eligible company-local calendar date, inclusive and explicitly supplied by HR. */
    startDate: date('start_date', { mode: 'string' }).notNull(),
    /** Last eligible company-local calendar date, inclusive; null means an ongoing period. */
    endDate: date('end_date', { mode: 'string' }),
    /** UTC void instant; null while this is an authoritative period, never a deletion or account suspension. */
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    /** UTC insert/update instants; immutable before/after changes are retained separately. */
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employee_employment_period_start')
      .on(table.employeeId, table.startDate)
      .where(sql`${table.voidedAt} is null`),
    uniqueIndex('employee_employment_period_one_open')
      .on(table.employeeId)
      .where(sql`${table.endDate} is null and ${table.voidedAt} is null`),
    check(
      'employee_employment_period_dates_valid',
      sql`${table.startDate} between date '1900-01-01' and date '2100-12-31' and (${table.endDate} is null or (${table.endDate} >= ${table.startDate} and ${table.endDate} <= date '2100-12-31'))`,
    ),
  ],
)

/** Append-only history of every creation, correction and void. Written atomically with the period and employee-wide revision. */
export const employeeEmploymentAudit = pgTable(
  'employee_employment_audit',
  {
    /** PostgreSQL 18 UUIDv7 audit identity. */
    id: uuidv7PrimaryKey(),
    /** Employee scope used to paginate history without exposing other employees. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** Period whose history remains available even after it is voided. */
    periodId: uuid('period_id')
      .notNull()
      .references(() => employeeEmploymentPeriod.id, { onDelete: 'restrict' }),
    /** Authenticated editor from the current server-side identity. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Stable operation category, separate from employment or account status. */
    action: text('action').$type<'created' | 'updated' | 'voided'>().notNull(),
    /** Minimal prior dates/void state; null only when the record is created. */
    before: jsonb('before').$type<EmploymentPeriodFacts | null>(),
    /** Minimal resulting dates/void state, with no credentials or account records. */
    after: jsonb('after').$type<EmploymentPeriodFacts>().notNull(),
    /** Required human explanation for the confirmed change. */
    reason: text('reason').notNull(),
    /** Database-generated UTC decision time. */
    createdAt: createdAt(),
  },
  (table) => [
    index('employee_employment_audit_history').on(
      table.employeeId,
      table.createdAt,
      table.id,
    ),
    check(
      'employee_employment_audit_action_valid',
      sql`${table.action} in ('created', 'updated', 'voided')`,
    ),
    check(
      'employee_employment_audit_reason_valid',
      sql`length(trim(${table.reason})) between 5 and 500`,
    ),
  ],
)
