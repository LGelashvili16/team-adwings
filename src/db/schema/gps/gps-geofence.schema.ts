import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, timestamps, uuidv7PrimaryKey } from '../_shared/columns'
import { employee } from '../employees/employee.schema'
import { user } from '../auth/auth.schema'
import { job } from '../jobs/job.schema'
import { gpsDevice, gpsPosition } from './gps.schema'
import { attendanceSession } from '../attendance/attendance.schema'

export type GpsPresenceState =
  | 'outside'
  | 'pending_entry'
  | 'inside'
  | 'pending_exit'

export type GpsVisitMode = 'observation' | 'automatic'
export type GpsVisitStatus = 'open' | 'completed' | 'uncertain'

export type GpsVisitCrewOutcome =
  | 'observed'
  | 'clocked_in'
  | 'completed'
  | 'conflict_open_session'
  | 'conflict_overlap'
  | 'ineligible'

/** Confirmed tracker visits inside a mapped job's circular geofence. Immutable evidence retains the triggering entry/exit fixes, zone revision, and elapsed on-site seconds (including across tracker sleep mode). */
export const gpsJobVisit = pgTable(
  'gps_job_visit',
  {
    /** PostgreSQL 18 UUIDv7 visit identity used for retry-safe attendance and payroll linkage. */
    id: uuidv7PrimaryKey(),
    /** Mapped job whose circular zone the tracker entered. */
    jobId: uuid('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    /** Tracker device providing shared presence evidence for this job's crew. */
    deviceId: uuid('device_id')
      .notNull()
      .references(() => gpsDevice.id, { onDelete: 'restrict' }),
    /** Company-local calendar date when the confirmed visit started. */
    workDate: date('work_date', { mode: 'string' }).notNull(),
    /** Named company timezone retained for deterministic payroll boundary evaluation. */
    timezone: text('timezone').notNull(),
    /** Company geofence setting version effective when entry was confirmed. */
    geofenceVersion: integer('geofence_version').notNull(),
    /** Effective geofence diameter in meters captured at entry. */
    geofenceDiameter: integer('geofence_diameter').notNull(),
    /** First qualifying inside GPS fix that initiated this confirmed visit. */
    entryFixId: uuid('entry_fix_id')
      .notNull()
      .references(() => gpsPosition.id, { onDelete: 'restrict' }),
    /** First qualifying outside GPS fix that ended this visit; null while still on site. */
    exitFixId: uuid('exit_fix_id').references(() => gpsPosition.id, {
      onDelete: 'restrict',
    }),
    /** UTC instant of the first qualifying inside fix. */
    confirmedEntryAt: timestamp('confirmed_entry_at', {
      withTimezone: true,
    }).notNull(),
    /** UTC instant of the first qualifying outside fix; null while the visit is still open. */
    confirmedExitAt: timestamp('confirmed_exit_at', { withTimezone: true }),
    /** Exact elapsed seconds spent on site between confirmed entry and confirmed exit; zero while open. */
    onSiteSeconds: integer('on_site_seconds').notNull().default(0),
    /** Whether this visit ran in observation-only mode or automatic crew attendance mode. */
    mode: text('mode').$type<GpsVisitMode>().notNull(),
    /** Lifecycle state: open while on site, completed after confirmed exit, or uncertain when overlapping jobs/anomalies require review. */
    status: text('status').$type<GpsVisitStatus>().notNull(),
    /** Optional Georgian diagnostic or conflict summary when review is needed. */
    note: text('note').notNull().default(''),
    /** UTC server processing instant when the latest visit transition was committed. */
    processedAt: timestamp('processed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Database-generated UTC creation instant. */
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('gps_job_visit_entry_once').on(
      table.deviceId,
      table.jobId,
      table.entryFixId,
    ),
    index('gps_job_visit_job_recent').on(
      table.jobId,
      table.confirmedEntryAt.desc(),
    ),
    index('gps_job_visit_date').on(table.workDate, table.deviceId),
    check(
      'gps_job_visit_state_valid',
      sql`${table.mode} in ('observation', 'automatic') and ${table.status} in ('open', 'completed', 'uncertain') and ${table.onSiteSeconds} >= 0 and ${table.geofenceDiameter} > 0 and ${table.geofenceVersion} >= 0`,
    ),
    check(
      'gps_job_visit_interval_valid',
      sql`${table.confirmedExitAt} is null or ${table.confirmedExitAt} >= ${table.confirmedEntryAt}`,
    ),
  ],
)

/** Per-device and per-job geofence dwell state machine. Tracks outside, pending entry/exit, and confirmed inside states without losing state during tracker sleep mode. */
export const gpsJobPresence = pgTable(
  'gps_job_presence',
  {
    /** Tracker being evaluated. */
    deviceId: uuid('device_id')
      .notNull()
      .references(() => gpsDevice.id, { onDelete: 'restrict' }),
    /** Mapped job whose circular zone is evaluated for this tracker. */
    jobId: uuid('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    /** Current dwell-filtered geofence state for this (device, job) pair. */
    state: text('state').$type<GpsPresenceState>().notNull(),
    /** Open visit associated with inside/pending_exit states; null when outside or pending_entry. */
    activeVisitId: uuid('active_visit_id').references(() => gpsJobVisit.id, {
      onDelete: 'restrict',
    }),
    /** Geofence setting version evaluated on the last fix. */
    geofenceVersion: integer('geofence_version').notNull().default(0),
    /** Geofence diameter in meters evaluated on the last fix. */
    geofenceDiameter: integer('geofence_diameter').notNull().default(200),
    /** UTC timestamp of the first fix in a pending_entry or pending_exit transition; null when settled. */
    candidateSince: timestamp('candidate_since', { withTimezone: true }),
    /** GPS fix that started the pending_entry or pending_exit transition. */
    candidateFixId: uuid('candidate_fix_id').references(() => gpsPosition.id, {
      onDelete: 'restrict',
    }),
    /** Latest evaluated valid GPS fix timestamp to prevent older/replayed packets from reversing state. */
    lastFixAt: timestamp('last_fix_at', { withTimezone: true }),
    /** Latest evaluated valid GPS fix ID. */
    lastFixId: uuid('last_fix_id').references(() => gpsPosition.id, {
      onDelete: 'restrict',
    }),
    /** Latest valid fix timestamp confirmed inside the zone. */
    lastInsideFixAt: timestamp('last_inside_fix_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.jobId] }),
    index('gps_job_presence_job').on(table.jobId, table.state),
    check(
      'gps_job_presence_state_valid',
      sql`${table.state} in ('outside', 'pending_entry', 'inside', 'pending_exit') and ${table.geofenceDiameter} > 0 and ${table.geofenceVersion} >= 0`,
    ),
  ],
)

/** Per-employee attendance and on-site duration outcome captured for each GPS job visit. Preserves on-site duration even when a manual attendance conflict prevents automatic clock-in. */
export const gpsJobVisitCrew = pgTable(
  'gps_job_visit_crew',
  {
    /** PostgreSQL 18 UUIDv7 crew outcome identity. */
    id: uuidv7PrimaryKey(),
    /** Parent GPS job visit. */
    visitId: uuid('visit_id')
      .notNull()
      .references(() => gpsJobVisit.id, { onDelete: 'restrict' }),
    /** Assigned employee snapshotted when the visit was confirmed. */
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'restrict' }),
    /** Account identifier of the assigned employee. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Attendance session automatically created by this GPS visit; null in observation mode or on conflict. */
    attendanceSessionId: uuid('attendance_session_id').references(
      () => attendanceSession.id,
      { onDelete: 'restrict' },
    ),
    /** Outcome for this crew member: observed, clocked_in, completed, conflict_open_session, conflict_overlap, or ineligible. */
    outcome: text('outcome').$type<GpsVisitCrewOutcome>().notNull(),
    /** Detected seconds spent on site for this job, retained even when a manual punch conflict occurred. */
    onSiteSeconds: integer('on_site_seconds').notNull().default(0),
    /** Georgian explanation when automatic clock-in could not proceed due to a conflict or eligibility issue. */
    conflictReason: text('conflict_reason').notNull().default(''),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('gps_job_visit_crew_once').on(table.visitId, table.employeeId),
    index('gps_job_visit_crew_employee').on(table.employeeId, table.visitId),
    check(
      'gps_job_visit_crew_outcome_valid',
      sql`${table.outcome} in ('observed', 'clocked_in', 'completed', 'conflict_open_session', 'conflict_overlap', 'ineligible') and ${table.onSiteSeconds} >= 0 and length(${table.conflictReason}) <= 500`,
    ),
  ],
)
