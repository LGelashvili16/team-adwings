import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { employee } from '#/db/schema/employees/employee.schema'

/** The cutoff protects authenticated requests and roster reads before the task finalizes the departure. */
export const effectiveEmploymentStatus = sql<'active' | 'inactive' | null>`
  case when ${employee.departureEffectiveAt} <= statement_timestamp()
    then 'inactive' else ${employee.status} end
`
