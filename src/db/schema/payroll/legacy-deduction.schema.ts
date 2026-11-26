import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, uuidv7PrimaryKey } from '../_shared/columns'
import { user } from '../auth/auth.schema'
import { employee } from '../employees/employee.schema'

type DeductionKind = 'fine' | 'other_deduction'
type DeductionStatus =
  'proposed' | 'withdrawn' | 'approved' | 'rejected' | 'revoked'

/** Historical claims retained for audit after the review workflow was retired. */
export const payrollDeduction = pgTable(
  'payroll_deduction',
  {
    /** Stable database-generated claim identity. */
    id: uuidv7PrimaryKey(),
    /** Employee subject, immutable after creation. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** Fine or other deduction, never tax, pension or absence earnings. */
    kind: text('kind').$type<DeductionKind>().notNull(),
    /** Canonical decision/claim identity, independent of dates, amounts and category. */
    sourceKey: text('source_key').notNull(),
    /** Current retained decision version. */
    version: integer('version').notNull(),
    /** Review state only; it does not establish a salary reduction. */
    status: text('status').$type<DeductionStatus>().notNull(),
    /** Database creation instant. */
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payroll_deduction_source').on(t.employeeId, t.sourceKey),
    check(
      'payroll_deduction_identity_valid',
      sql`${t.kind} in ('fine','other_deduction') and length(${t.sourceKey}) between 3 and 160`,
    ),
    check(
      'payroll_deduction_state_valid',
      sql`${t.version} > 0 and ${t.status} in ('proposed','withdrawn','approved','rejected','revoked')`,
    ),
  ],
)

/** Immutable proposal/decision facts committed atomically with the claim. */
export const payrollDeductionVersion = pgTable(
  'payroll_deduction_version',
  {
    /** Retained audit identity. */
    id: uuidv7PrimaryKey(),
    /** Owning claim. */
    deductionId: uuid('deduction_id')
      .notNull()
      .references(() => payrollDeduction.id, { onDelete: 'restrict' }),
    /** Consecutive decision version. */
    version: integer('version').notNull(),
    /** Preparation, withdrawal or independent review state. */
    status: text('status').$type<DeductionStatus>().notNull(),
    /** Company-local occurrence date, not an inferred absence. */
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    /** Intended payroll month as its first day; actual consumption remains separate. */
    payrollMonth: date('payroll_month', { mode: 'string' }).notNull(),
    /** Exact positive proposed deduction in tetri, never subtracted from taxable earnings here. */
    amountMinor: integer('amount_minor').notNull(),
    /** Human-readable source decision reference. */
    reference: text('reference').notNull(),
    /** Supporting evidence statement, never automatically fetched. */
    evidence: text('evidence').notNull(),
    /** Explicit legal/contractual authority and supporting document basis. */
    basis: text('basis').notNull(),
    /** Employment history revision checked when the proposal was prepared. */
    employmentRevision: integer('employment_revision').notNull(),
    /** Company timezone checked for the occurrence date. */
    timezone: text('timezone').notNull(),
    /** Independent verification of evidence, basis and amount on approval. */
    evidenceVerified: boolean('evidence_verified').notNull().default(false),
    /** Trusted preparer or decision maker. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Required explanation of this preparation or decision. */
    reason: text('reason').notNull(),
    /** Actor-scoped idempotent command identity. */
    requestId: uuid('request_id').notNull(),
    /** Fingerprint of the validated command. */
    commandHash: text('command_hash').notNull(),
    /** Database recording instant. */
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payroll_deduction_revision').on(t.deductionId, t.version),
    uniqueIndex('payroll_deduction_command').on(t.actorId, t.requestId),
    check(
      'payroll_deduction_version_valid',
      sql`${t.version} > 0 and ${t.status} in ('proposed','withdrawn','approved','rejected','revoked')`,
    ),
    check(
      'payroll_deduction_money_valid',
      sql`${t.amountMinor} between 1 and 100000000`,
    ),
    check(
      'payroll_deduction_dates_valid',
      sql`${t.occurredOn} between date '2000-01-01' and date '2100-12-31' and ${t.payrollMonth} between date '2000-01-01' and date '2100-12-01' and extract(day from ${t.payrollMonth}) = 1 and ${t.payrollMonth} >= date_trunc('month', ${t.occurredOn})::date`,
    ),
    check(
      'payroll_deduction_evidence_valid',
      sql`length(trim(${t.reference})) between 3 and 160 and length(trim(${t.evidence})) between 5 and 1000 and length(trim(${t.basis})) between 5 and 1000 and length(trim(${t.reason})) between 5 and 500 and ${t.employmentRevision} > 0 and length(${t.timezone}) between 1 and 100 and ${t.commandHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'payroll_deduction_review_valid',
      sql`${t.status} <> 'approved' or ${t.evidenceVerified}`,
    ),
  ],
)
