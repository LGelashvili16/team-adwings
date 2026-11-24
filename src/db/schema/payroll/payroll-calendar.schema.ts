import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt } from '../_shared/columns'
import { employee } from '../employees/employee.schema'
import { user } from '../auth/auth.schema'
import type { CalendarException } from '#/features/payroll/payroll-calendar.types'

/** Immutable company or employee payroll calendar decisions. Greatest revision for a scope/date wins. */
export const payrollCalendarException = pgTable(
  'payroll_calendar_exception',
  {
    /** Global ordered revision, allocated under the payroll-calendar transaction lock. */
    revision: integer('revision').primaryKey(),
    /** Null targets the company; otherwise a single employee. Never a team or an account access change. */
    employeeId: uuid('employee_id').references(() => employee.id, {
      onDelete: 'restrict',
    }),
    /** Explicit company-local reference date; attendance keeps its retained work date separately. */
    date: date('date', { mode: 'string' }).notNull(),
    /** Working/rest exception or explicit restoration of the inherited calendar. */
    kind: text('kind').$type<CalendarException['kind']>().notNull(),
    /** Local HH:mm start; present only for an explicitly working date. */
    start: text('start'),
    /** Local HH:mm end on the same reference date; present only for working dates. */
    end: text('end'),
    /** Trusted server-side author; no employee identity is accepted as proof of authority. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Required decision basis, including agreement/decree references when relevant. */
    reason: text('reason').notNull(),
    /** Database-generated UTC recording timestamp. */
    createdAt: createdAt(),
  },
  (table) => [
    index('payroll_calendar_employee_date').on(
      table.employeeId,
      table.date,
      table.revision,
    ),
    index('payroll_calendar_company_date')
      .on(table.date, table.revision)
      .where(sql`${table.employeeId} is null`),
    check('payroll_calendar_revision_valid', sql`${table.revision} > 0`),
    check(
      'payroll_calendar_date_valid',
      sql`${table.date} between date '2000-01-01' and date '2100-12-31'`,
    ),
    check(
      'payroll_calendar_kind_valid',
      sql`${table.kind} in ('working','day_off','inherit')`,
    ),
    check(
      'payroll_calendar_hours_valid',
      sql`(${table.kind} = 'working' and ${table.start} is not null and ${table.end} is not null and ${table.start} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.end} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.end} > ${table.start}) or (${table.kind} <> 'working' and ${table.start} is null and ${table.end} is null)`,
    ),
    check(
      'payroll_calendar_reason_valid',
      sql`length(trim(${table.reason})) between 5 and 500`,
    ),
  ],
)
