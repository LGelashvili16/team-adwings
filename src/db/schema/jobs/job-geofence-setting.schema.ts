import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  integer,
  pgTable,
  smallint,
  text,
} from 'drizzle-orm/pg-core'
import { user } from '../auth/auth.schema'
import { createdAt } from '../_shared/columns'
import type { JobGeofenceDiameter } from '#/features/jobs/jobs.types'

/** Company-wide job geofence settings. Each change appends an audited revision. */
export const jobGeofenceSetting = pgTable(
  'job_geofence_setting',
  {
    /** Increasing revision used to find the current setting. Version zero is the implicit default. */
    version: integer('version').primaryKey(),
    /** Diameter in whole meters used by all mapped jobs. The smallint range caps it at 32767. */
    diameter: smallint('diameter').$type<JobGeofenceDiameter>().notNull(),
    /** Whether confirmed GPS geofence visits automatically clock assigned crew members in and out; defaults to false (observation-only mode). */
    autoAttendanceEnabled: boolean('auto_attendance_enabled')
      .notNull()
      .default(false),
    /** Account that saved the revision. Protected from deletion to preserve attribution. */
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Database-generated UTC instant when the revision was saved. */
    createdAt: createdAt(),
  },
  (table) => [
    check(
      'job_geofence_setting_valid',
      sql`${table.version} > 0 and ${table.diameter} > 0`,
    ),
  ],
)
