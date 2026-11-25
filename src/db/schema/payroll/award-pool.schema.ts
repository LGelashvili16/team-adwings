import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, uuidv7PrimaryKey } from '../_shared/columns'
import { user } from '../auth/auth.schema'
import { job } from '../jobs/job.schema'
import { payrollBonusRule, payrollBonusRuleVersion } from './bonus-rule.schema'
import type { AwardStatus } from '#/features/payroll/award-proposals.types'

/** One allocation mode per logical source, shared by every beneficiary and retained after withdrawal. */
export const payrollAwardSource = pgTable(
  'payroll_award_source',
  {
    /** Stable bonus/premium rule. */
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => payrollBonusRule.id, { onDelete: 'restrict' }),
    /** Native job or canonical external work reference. */
    sourceType: text('source_type').$type<'job' | 'external'>().notNull(),
    /** Canonical source identity independent of dates, revisions and beneficiaries. */
    sourceKey: text('source_key').notNull(),
    /** Individual full-rate awards or one shared pool, never both. */
    mode: text('mode').$type<'individual' | 'pool'>().notNull(),
    /** Database recording instant. */
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ruleId, t.sourceType, t.sourceKey] }),
    check(
      'payroll_award_source_mode_valid',
      sql`${t.mode} in ('individual','pool') and ${t.sourceType} in ('job','external') and length(${t.sourceKey}) between 3 and 160`,
    ),
  ],
)
export const payrollAwardPool = pgTable(
  'payroll_award_pool',
  {
    /** Stable pool identity. */
    id: uuidv7PrimaryKey(),
    /** Stable rule and source, immutable after creation. */
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => payrollBonusRule.id, { onDelete: 'restrict' }),
    /** Native job or external supporting record. */
    sourceType: text('source_type').$type<'job' | 'external'>().notNull(),
    /** Canonical shared work identity. */
    sourceKey: text('source_key').notNull(),
    /** Native job, where applicable. */
    jobId: uuid('job_id').references(() => job.id, { onDelete: 'restrict' }),
    /** Current immutable pool decision. */
    version: integer('version').notNull(),
    /** Preparation/review state, independent of payment or statement consumption. */
    status: text('status').$type<AwardStatus>().notNull(),
    /** Database creation instant. */
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payroll_award_pool_source').on(
      t.ruleId,
      t.sourceType,
      t.sourceKey,
    ),
    check(
      'payroll_award_pool_source_valid',
      sql`(${t.sourceType} = 'job' and ${t.jobId} is not null and ${t.sourceKey} = ${t.jobId}::text) or (${t.sourceType} = 'external' and ${t.jobId} is null and length(${t.sourceKey}) between 3 and 160)`,
    ),
    check(
      'payroll_award_pool_state_valid',
      sql`${t.version} > 0 and ${t.status} in ('proposed','withdrawn','approved','rejected','revoked')`,
    ),
  ],
)
export const payrollAwardPoolVersion = pgTable(
  'payroll_award_pool_version',
  {
    /** Immutable group decision identity. */
    id: uuidv7PrimaryKey(),
    /** Owning pool. */
    poolId: uuid('pool_id')
      .notNull()
      .references(() => payrollAwardPool.id, { onDelete: 'restrict' }),
    /** Consecutive pool revision. */
    version: integer('version').notNull(),
    /** Proposal, withdrawal or independent review decision. */
    status: text('status').$type<AwardStatus>().notNull(),
    /** Independent reviewer attestation, required for approval. */
    evidenceVerified: boolean('evidence_verified').notNull().default(false),
    /** Immutable applicable tariff. */
    ruleVersionId: uuid('rule_version_id')
      .notNull()
      .references(() => payrollBonusRuleVersion.id, { onDelete: 'restrict' }),
    /** Company-local earning date. */
    workDate: date('work_date', { mode: 'string' }).notNull(),
    /** Shared work quantity in thousandths, not repeated work per beneficiary. */
    quantityMilli: integer('quantity_milli').notNull(),
    /** One rounded total in tetri, allocated exactly among members. */
    totalMinor: integer('total_minor').notNull(),
    /** External record label, empty for native jobs. */
    reference: text('reference').notNull(),
    /** Shared evidence statement. */
    evidence: text('evidence').notNull(),
    /** Exact beneficiary shares and names observed during preparation. */
    allocations: jsonb('allocations')
      .$type<Array<{ userId: string; name: string; amountMinor: number }>>()
      .notNull(),
    /** Trusted preparer or reviewer. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Required decision explanation. */
    reason: text('reason').notNull(),
    /** Idempotent actor-scoped command. */
    requestId: uuid('request_id').notNull(),
    /** Validated command fingerprint. */
    commandHash: text('command_hash').notNull(),
    /** Database-generated decision instant. */
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payroll_award_pool_revision').on(t.poolId, t.version),
    uniqueIndex('payroll_award_pool_command').on(t.actorId, t.requestId),
    check(
      'payroll_award_pool_review_valid',
      sql`${t.status} <> 'approved' or ${t.evidenceVerified}`,
    ),
    check(
      'payroll_award_pool_version_valid',
      sql`${t.version} > 0 and ${t.status} in ('proposed','withdrawn','approved','rejected','revoked')`,
    ),
    check(
      'payroll_award_pool_money_valid',
      sql`${t.quantityMilli} between 1 and 100000000 and ${t.totalMinor} between 1 and 100000000`,
    ),
    check(
      'payroll_award_pool_date_valid',
      sql`${t.workDate} between date '2000-01-01' and date '2100-12-31'`,
    ),
    check(
      'payroll_award_pool_evidence_valid',
      sql`length(${t.reference}) <= 160 and length(trim(${t.evidence})) between 5 and 1000 and length(trim(${t.reason})) between 5 and 500 and ${t.commandHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'payroll_award_pool_allocations_valid',
      sql`jsonb_typeof(${t.allocations}) = 'array' and jsonb_array_length(${t.allocations}) between 2 and 20`,
    ),
  ],
)
