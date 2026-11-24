import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt } from '#/db/schema/_shared/columns'
import { employee } from '#/db/schema/employees/employee.schema'
import { user } from '#/db/schema/auth/auth.schema'
import type { WorkingWeek } from '#/features/scheduling/scheduling.types'

/** One immutable employee schedule decision. Null days explicitly inherit the dated company schedule; missing earlier versions mean unknown history. The existing assignment table remains the current-state projection. */
export const employeeScheduleVersion = pgTable(
  'employee_schedule_version',
  {
    /** Employee whose recurring expectations changed; retained with their attendance and payroll history. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** Monotonic version within this employee's timeline, allocated while holding their employee row lock. */
    version: integer('version').notNull(),
    /** First applicable company-local date. Multiple saves on one date retain every version; the greatest version supplies that day's reference. */
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    /** Seven validated ISO weekday entries for an individual schedule; SQL null explicitly returns to company defaults. */
    days: jsonb('days').$type<WorkingWeek | null>(),
    /** Trusted editor, null only for migration baselines or the operator-only first-account provisioning flow. */
    actorId: text('actor_id').references(() => user.id, {
      onDelete: 'restrict',
    }),
    /** Provenance distinguishes an observed migration baseline from account provisioning or an actual schedule change. */
    source: text('source')
      .$type<'migration' | 'provisioned' | 'changed'>()
      .notNull(),
    /** Database-generated UTC decision/observation instant; never backdated to account creation. */
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.employeeId, table.version] }),
    index('employee_schedule_version_effective').on(
      table.employeeId,
      table.effectiveFrom,
      table.version,
    ),
    check('employee_schedule_version_positive', sql`${table.version} > 0`),
    check(
      'employee_schedule_version_week_valid',
      sql`${table.days} is null or (jsonb_typeof(${table.days}) = 'array' and jsonb_array_length(${table.days}) = 7)`,
    ),
    check(
      'employee_schedule_version_source_valid',
      sql`(${table.source} = 'migration' and ${table.actorId} is null) or ${table.source} = 'provisioned' or (${table.source} = 'changed' and ${table.actorId} is not null)`,
    ),
  ],
)
