import { sql } from 'drizzle-orm'
import {
  boolean,
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

/** Effective-dated employee switches for rest-day clock-in permission and automatic rest-day bonuses. Each change appends an immutable version. Absence of a row defaults to rest-day clock-in ON and automatic rest-day bonus OFF. */
export const employeeRestDayPolicy = pgTable(
  'employee_rest_day_policy',
  {
    /** PostgreSQL 18 UUIDv7 record identity. */
    id: uuidv7PrimaryKey(),
    /** Employee whose rest-day policy is recorded; deletion is restricted to retain payroll history. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** Monotonic per-employee policy revision used for optimistic concurrency and same-date tie-breaking. */
    version: integer('version').notNull(),
    /** Inclusive company-local date from which these switch values take effect. */
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    /** Whether the employee may start a new self-service attendance session on a configured rest day. */
    restDayClockInAllowed: boolean('rest_day_clock_in_allowed').notNull(),
    /** Whether eligible rest-day attendance automatically generates a fixed-salary rest-day bonus. */
    autoRestDayBonusEnabled: boolean('auto_rest_day_bonus_enabled').notNull(),
    /** Trusted HR, administrator, or owner account that saved this policy revision. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Audit note explaining why this policy version was recorded. */
    reason: text('reason').notNull(),
    /** Database-generated UTC instant when this version was recorded. */
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('employee_rest_day_policy_version').on(
      table.employeeId,
      table.version,
    ),
    index('employee_rest_day_policy_effective').on(
      table.employeeId,
      table.effectiveFrom,
      table.version,
    ),
    check('employee_rest_day_policy_version_valid', sql`${table.version} > 0`),
    check(
      'employee_rest_day_policy_date_valid',
      sql`${table.effectiveFrom} between date '1900-01-01' and date '2100-12-31'`,
    ),
    check(
      'employee_rest_day_policy_reason_valid',
      sql`length(trim(${table.reason})) between 5 and 500`,
    ),
  ],
)
