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
} from 'drizzle-orm/pg-core'
import { createdAt, uuidv7PrimaryKey } from '../_shared/columns'
import { user } from '../auth/auth.schema'
import { employee } from '../employees/employee.schema'
import { job, jobEvent } from '../jobs/job.schema'
import { payrollBonusRule, payrollBonusRuleVersion } from './bonus-rule.schema'

/** Stable work claim survives rule edits, proposal withdrawal, job reopening and request retries. */
export const payrollAwardProposal = pgTable(
  'payroll_award_proposal',
  {
    /** Database-generated proposal identity. */
    id: uuidv7PrimaryKey(),
    /** Stable rule identity used for duplicate protection across rate changes. */
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => payrollBonusRule.id, { onDelete: 'restrict' }),
    /** Sole beneficiary in this individual-proposal workflow. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** A verified native job or an externally evidenced work/award reference. */
    sourceType: text('source_type').$type<'job' | 'external'>().notNull(),
    /** Canonical source identity, excluding date and completion-event identity deliberately. */
    sourceKey: text('source_key').notNull(),
    /** Native job where applicable. */
    jobId: uuid('job_id').references(() => job.id, { onDelete: 'restrict' }),
    /** Current audited version. */
    version: integer('version').notNull(),
    /** Proposal-only state; neither value authorizes a payment. */
    status: text('status').$type<'proposed' | 'withdrawn'>().notNull(),
    /** Database-generated creation instant. */
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payroll_award_source_claim').on(
      t.ruleId,
      t.employeeId,
      t.sourceType,
      t.sourceKey,
    ),
    index('payroll_award_directory').on(t.status, t.createdAt, t.id),
    check(
      'payroll_award_source_valid',
      sql`(${t.sourceType} = 'job' and ${t.jobId} is not null and ${t.sourceKey} = ${t.jobId}::text) or (${t.sourceType} = 'external' and ${t.jobId} is null and length(${t.sourceKey}) between 3 and 160)`,
    ),
    check(
      'payroll_award_state_valid',
      sql`${t.version} > 0 and ${t.status} in ('proposed','withdrawn')`,
    ),
  ],
)
export const payrollAwardProposalVersion = pgTable(
  'payroll_award_proposal_version',
  {
    /** Database-generated immutable audit identity. */
    id: uuidv7PrimaryKey(),
    /** Owning stable source claim. */
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => payrollAwardProposal.id, { onDelete: 'restrict' }),
    /** Consecutive proposal revision. */
    version: integer('version').notNull(),
    /** Preserved proposal or withdrawal decision. */
    status: text('status').$type<'proposed' | 'withdrawn'>().notNull(),
    /** Applicable immutable rate and qualification. */
    ruleVersionId: uuid('rule_version_id')
      .notNull()
      .references(() => payrollBonusRuleVersion.id, { onDelete: 'restrict' }),
    /** Declared earning date, company local. */
    workDate: date('work_date', { mode: 'string' }).notNull(),
    /** Exact accepted quantity in thousandths of the named unit. */
    quantityMilli: integer('quantity_milli').notNull(),
    /** Proposed amount, rounded once to tetri, without tax or pension calculation. */
    amountMinor: integer('amount_minor').notNull(),
    /** Human-readable external reference; empty for native jobs. */
    reference: text('reference').notNull(),
    /** Proposer's evidence statement, never fetched as a URL. */
    evidence: text('evidence').notNull(),
    /** Native completion identity, when verified. */
    completionEventId: uuid('completion_event_id').references(
      () => jobEvent.id,
      { onDelete: 'restrict' },
    ),
    /** Minimal evidence observed under the job/employee locks. */
    sourceSnapshot: jsonb('source_snapshot')
      .$type<{
        jobTitle?: string
        jobVersion?: number
        completedAt?: string
        completedBy?: string
        assigneeId?: string
        employmentRevision: number
        timezone: string
      }>()
      .notNull(),
    /** Trusted author of this decision. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Reason for creating, correcting, resubmitting or withdrawing. */
    reason: text('reason').notNull(),
    /** Idempotent command identity, scoped to the trusted actor. */
    requestId: uuid('request_id').notNull(),
    /** Hash of the validated normalized command; detects changed retries. */
    commandHash: text('command_hash').notNull(),
    /** Database-generated recording instant. */
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payroll_award_version').on(t.proposalId, t.version),
    uniqueIndex('payroll_award_command').on(t.actorId, t.requestId),
    check(
      'payroll_award_version_state_valid',
      sql`${t.version} > 0 and ${t.status} in ('proposed','withdrawn')`,
    ),
    check(
      'payroll_award_work_date_valid',
      sql`${t.workDate} between date '2000-01-01' and date '2100-12-31'`,
    ),
    check(
      'payroll_award_quantity_valid',
      sql`${t.quantityMilli} between 1 and 100000000 and ${t.amountMinor} between 1 and 100000000`,
    ),
    check(
      'payroll_award_evidence_valid',
      sql`length(trim(${t.evidence})) between 5 and 1000 and length(${t.reference}) <= 160 and length(trim(${t.reason})) between 5 and 500 and ${t.commandHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
)
