import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { employee } from '../employees/employee.schema'

/** Recurring remote weekdays and dated exceptions. Missing entries default to on-site. */
export const employeeWorkLocation = pgTable(
  'employee_work_location',
  {
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    weekday: integer('weekday'),
    date: date('date'),
    remote: boolean('remote').notNull(),
  },
  (table) => [
    unique('employee_work_location_weekday_unique').on(
      table.employeeId,
      table.weekday,
    ),
    unique('employee_work_location_date_unique').on(
      table.employeeId,
      table.date,
    ),
    check(
      'employee_work_location_day_valid',
      sql`(${table.weekday} is null and ${table.date} is not null) or (${table.weekday} is not null and ${table.weekday} between 1 and 7 and ${table.date} is null and ${table.remote})`,
    ),
  ],
)
