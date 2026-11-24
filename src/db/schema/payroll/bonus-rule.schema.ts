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
import { user } from '../auth/auth.schema'

/** Stable identity of a company award rule; rates and qualification are immutable dated versions. */
export const payrollBonusRule = pgTable('payroll_bonus_rule', {
  /** Database-generated rule identity, independent of its changing name. */
  id: uuidv7PrimaryKey(),
  /** Database-generated recording instant. */
  createdAt: createdAt(),
})

export const payrollBonusRuleVersion = pgTable(
  'payroll_bonus_rule_version',
  {
    /** Database-generated audit identity. */
    id: uuidv7PrimaryKey(),
    /** Stable owning rule. */
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => payrollBonusRule.id, { onDelete: 'restrict' }),
    /** Monotonic revision including future and same-date decisions. */
    version: integer('version').notNull(),
    /** Inclusive company-local applicability date. */
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    /** Human-readable rule name at this version. */
    name: text('name').notNull(),
    /** A performance bonus or an occasional fixed premium. */
    kind: text('kind').$type<'bonus' | 'premium'>().notNull(),
    /** Quantity classification, with no automatic work acceptance. */
    calculation: text('calculation')
      .$type<'fixed' | 'job' | 'task' | 'additional_work'>()
      .notNull(),
    /** Explicit extra-work unit, empty for the other calculation types. */
    unitLabel: text('unit_label').notNull(),
    /** Qualification/evidence required before any future award. */
    qualification: text('qualification').notNull(),
    /** Exact rate or fixed award in tetri. */
    amountMinor: integer('amount_minor').notNull(),
    /** Contractual gross or agreed net basis, not a computed take-home amount. */
    amountBasis: text('amount_basis').$type<'gross' | 'net'>().notNull(),
    /** Initial payroll currency. */
    currency: text('currency').$type<'GEL'>().notNull(),
    /** Dated activation/deactivation, without deleting earlier decisions. */
    enabled: boolean('enabled').notNull(),
    /** Trusted actor responsible for this version. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Client-generated command identity for safe retries. */
    requestId: uuid('request_id').notNull(),
    /** Required explanation, retained as part of the atomic audit. */
    reason: text('reason').notNull(),
    /** Database-generated recording instant. */
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payroll_bonus_rule_revision').on(t.ruleId, t.version),
    uniqueIndex('payroll_bonus_rule_request').on(t.actorId, t.requestId),
    index('payroll_bonus_rule_effective').on(
      t.ruleId,
      t.effectiveFrom,
      t.version,
    ),
    check('payroll_bonus_rule_revision_valid', sql`${t.version} > 0`),
    check(
      'payroll_bonus_rule_date_valid',
      sql`${t.effectiveFrom} between date '2000-01-01' and date '2100-12-31'`,
    ),
    check(
      'payroll_bonus_rule_name_valid',
      sql`length(trim(${t.name})) between 3 and 120`,
    ),
    check(
      'payroll_bonus_rule_kind_valid',
      sql`${t.kind} in ('bonus','premium') and ${t.calculation} in ('fixed','job','task','additional_work') and (${t.kind} <> 'premium' or ${t.calculation} = 'fixed')`,
    ),
    check(
      'payroll_bonus_rule_unit_valid',
      sql`(${t.calculation} = 'additional_work' and length(trim(${t.unitLabel})) between 2 and 60) or (${t.calculation} <> 'additional_work' and ${t.unitLabel} = '')`,
    ),
    check(
      'payroll_bonus_rule_qualification_valid',
      sql`length(trim(${t.qualification})) between 5 and 1000`,
    ),
    check(
      'payroll_bonus_rule_money_valid',
      sql`${t.amountMinor} between 1 and 100000000 and ${t.amountBasis} in ('gross','net') and ${t.currency} = 'GEL'`,
    ),
    check(
      'payroll_bonus_rule_reason_valid',
      sql`length(trim(${t.reason})) between 5 and 500`,
    ),
  ],
)
