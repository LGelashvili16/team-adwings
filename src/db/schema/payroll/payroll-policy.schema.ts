import { sql } from 'drizzle-orm'
import { check, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { createdAt } from '#/db/schema/_shared/columns'
import { user } from '#/db/schema/auth/auth.schema'
import type { PaymentSchedule } from '#/features/payroll/payroll-settings.schemas'

export const payrollPolicy = pgTable(
  'payroll_policy',
  {
    version: integer('version').primaryKey(),
    // Older versions retain audit metadata but have no payment schedule.
    schedule: jsonb('schedule').$type<PaymentSchedule>(),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check('payroll_policy_version_valid', sql`${table.version} > 0`),
    check(
      'payroll_policy_reason_valid',
      sql`length(trim(${table.reason})) between 5 and 500`,
    ),
    check(
      'payroll_policy_schedule_valid',
      sql`jsonb_typeof(${table.schedule}) = 'object'`,
    ),
  ],
)
