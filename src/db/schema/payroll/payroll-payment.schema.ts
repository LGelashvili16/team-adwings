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
import { createdAt, uuidv7PrimaryKey } from '#/db/schema/_shared/columns'
import { user } from '#/db/schema/auth/auth.schema'
import { employee } from '#/db/schema/employees/employee.schema'
import { payrollPolicy } from './payroll-policy.schema'
import type { PayStage } from '#/features/payroll/payroll-settings.schemas'

/** One published amount per employee, earning month and payment stage. */
export const payrollPayment = pgTable(
  'payroll_payment',
  {
    id: uuidv7PrimaryKey(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    month: date('month', { mode: 'string' }).notNull(),
    stage: text('stage').$type<PayStage>().notNull(),
    policyVersion: integer('policy_version')
      .notNull()
      .references(() => payrollPolicy.version, { onDelete: 'restrict' }),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    baseMinor: integer('base_minor').notNull(),
    bonusMinor: integer('bonus_minor').notNull(),
    premiumMinor: integer('premium_minor').notNull(),
    fineMinor: integer('fine_minor').notNull(),
    totalMinor: integer('total_minor').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    requestId: uuid('request_id').notNull(),
    commandHash: text('command_hash').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payroll_payment_employee_stage').on(
      t.employeeId,
      t.month,
      t.stage,
    ),
    index('payroll_payment_month').on(t.month),
    index('payroll_payment_request').on(t.actorId, t.requestId),
    check(
      'payroll_payment_scope',
      sql`extract(day from ${t.month}) = 1 and ${t.paidOn} >= ${t.month} and ${t.stage} in ('first','salary','adjustments')`,
    ),
    check(
      'payroll_payment_amounts',
      sql`${t.baseMinor} between 0 and 100000000 and ${t.bonusMinor} between 0 and 100000000 and ${t.premiumMinor} between 0 and 100000000 and ${t.fineMinor} between 0 and 100000000 and ${t.totalMinor} between 0 and 300000000 and ${t.totalMinor} = ${t.baseMinor} + ${t.bonusMinor} + ${t.premiumMinor} - ${t.fineMinor}`,
    ),
    check(
      'payroll_payment_stage_components',
      sql`(${t.stage} = 'adjustments' and ${t.baseMinor} = 0) or (${t.stage} = 'salary' and ${t.bonusMinor} = 0 and ${t.premiumMinor} = 0) or (${t.stage} = 'first' and ${t.bonusMinor} = 0 and ${t.premiumMinor} = 0 and ${t.fineMinor} = 0)`,
    ),
    check('payroll_payment_hash', sql`${t.commandHash} ~ '^[0-9a-f]{64}$'`),
  ],
)
