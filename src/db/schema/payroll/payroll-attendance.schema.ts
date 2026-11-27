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

export type PayrollAttendanceItemKind =
  | 'fixed_rest_day_bonus'
  | 'missing_scheduled_day'
  | 'hourly_earning'
  | 'gps_job_earning'
  | 'gps_conflict'

export type PayrollAttendanceDecisionAction =
  | 'approved'
  | 'overridden'
  | 'voided'
  | 'resolved'

/** Immutable HR/admin review and override history for attendance-based payroll calculation items. Latest version per (employee, month, item_key) wins; source_hash detects stale overrides if underlying attendance or salary terms change. */
export const payrollAttendanceDecision = pgTable(
  'payroll_attendance_decision',
  {
    /** PostgreSQL 18 UUIDv7 audit identity. */
    id: uuidv7PrimaryKey(),
    /** Employee whose calculated payroll item is being reviewed or overridden. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** First calendar day (YYYY-MM-01) of the earning month in company timezone. */
    month: date('month', { mode: 'string' }).notNull(),
    /** Stable deterministic key identifying the calculated item within the employee and month. */
    itemKey: text('item_key').notNull(),
    /** Classification of the calculated item: fixed rest-day bonus, missing scheduled day, hourly earning, GPS job earning, or GPS conflict. */
    itemKind: text('item_kind').$type<PayrollAttendanceItemKind>().notNull(),
    /** Monotonic per-item revision preventing concurrent overwrites. */
    version: integer('version').notNull(),
    /** Review outcome: approved as calculated, overridden with custom values, voided to exclude from payout, or resolved for warning-only items. */
    action: text('action').$type<PayrollAttendanceDecisionAction>().notNull(),
    /** SHA-256 hex digest of the source inputs at decision time; mismatches flag the decision for re-review. */
    sourceHash: text('source_hash').notNull(),
    /** Calculated payable seconds before this decision, or null when not duration-based. */
    calculatedSeconds: integer('calculated_seconds'),
    /** Reviewer-supplied payable seconds when overriding duration, or null if unchanged. */
    overrideSeconds: integer('override_seconds'),
    /** Calculated amount in integer tetri before this decision, or null for non-monetary review items. */
    calculatedAmountMinor: integer('calculated_amount_minor'),
    /** Reviewer-supplied amount in integer tetri when action is overridden, or null otherwise. */
    overrideAmountMinor: integer('override_amount_minor'),
    /** Optional Georgian display note override for bonus/earning lines; empty preserves the automatic note. */
    note: text('note').notNull().default(''),
    /** Mandatory Georgian audit reason explaining the approval, override, void, or resolution. */
    reason: text('reason').notNull(),
    /** Trusted reviewer account (HR, admin, or owner); never the target employee. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Client-supplied idempotency key preventing duplicate review commits on retry. */
    requestId: uuid('request_id').notNull(),
    /** SHA-256 fingerprint of the validated command payload to reject conflicting retries. */
    commandHash: text('command_hash').notNull(),
    /** Database-generated UTC instant when this decision was committed. */
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('payroll_attendance_decision_revision').on(
      table.employeeId,
      table.month,
      table.itemKey,
      table.version.desc(),
    ),
    uniqueIndex('payroll_attendance_decision_retry').on(
      table.actorId,
      table.requestId,
    ),
    index('payroll_attendance_decision_month').on(
      table.month,
      table.employeeId,
      table.itemKey,
      table.version.desc(),
    ),
    check(
      'payroll_attendance_decision_scope',
      sql`${table.version} > 0 and ${table.month} between date '2000-01-01' and date '2100-12-01' and extract(day from ${table.month}) = 1 and length(trim(${table.itemKey})) between 3 and 160`,
    ),
    check(
      'payroll_attendance_decision_kind_action',
      sql`${table.itemKind} in ('fixed_rest_day_bonus', 'missing_scheduled_day', 'hourly_earning', 'gps_job_earning', 'gps_conflict') and ${table.action} in ('approved', 'overridden', 'voided', 'resolved')`,
    ),
    check(
      'payroll_attendance_decision_amounts',
      sql`(${table.calculatedAmountMinor} is null or ${table.calculatedAmountMinor} between 0 and 100000000) and (${table.overrideAmountMinor} is null or ${table.overrideAmountMinor} between 0 and 100000000) and (${table.action} <> 'overridden' or ${table.overrideAmountMinor} is not null) and (${table.calculatedSeconds} is null or ${table.calculatedSeconds} between 0 and 2678400) and (${table.overrideSeconds} is null or ${table.overrideSeconds} between 0 and 2678400)`,
    ),
    check(
      'payroll_attendance_decision_audit',
      sql`length(trim(${table.reason})) between 5 and 500 and length(${table.note}) <= 500 and ${table.sourceHash} ~ '^[a-f0-9]{64}$' and ${table.commandHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
)
