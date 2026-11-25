import { parseRoles } from '#/lib/authorization/permissions'
import type { Role } from '#/lib/authorization/permissions'
import '@tanstack/react-start/server-only'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  gt,
  ilike,
  isNotNull,
  lt,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { jobsTimeZone } from '../jobs.dates'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '#/db'
import {
  employee,
  job,
  jobEvent,
  jobRead,
  jobEmployee,
  user,
} from '#/db/schema'
import {
  readAssignments,
  employeeAssignmentCounts,
} from './job-assignments.repository.server'
import { jobsMapLimit, jobsPageSize } from '../jobs.schemas'
import { hasJobCoordinates } from '../jobs.rules'
import type { JobSearch } from '../jobs.types'

export type JobsTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]
export const transactJobs = db.transaction.bind(db)
function unreadJob(actorId: string) {
  return sql<boolean>`${job.tracksReads} and not exists (select 1 from ${jobRead} where ${jobRead.userId} = ${actorId} and ${jobRead.jobId} = ${job.id})`
}
export async function hasUnreadJobs(tx: JobsTransaction, actorId: string) {
  const rows = await tx
    .select({ id: job.id })
    .from(job)
    .where(unreadJob(actorId))
    .limit(1)
  return rows.length > 0
}
export async function markJobRead(
  tx: JobsTransaction,
  actorId: string,
  jobId: string,
) {
  await tx
    .insert(jobRead)
    .values({ userId: actorId, jobId })
    .onConflictDoNothing()
}
/** Selected roles opt in to all job notifications; active-account and job-read checks remain independent. */
export async function jobNotificationCandidates(
  tx: JobsTransaction,
  roles: ReadonlyArray<Role>,
  afterId?: string,
) {
  if (!roles.length) return { recipientIds: [], afterId: undefined }
  const rows = await tx
    .select({ id: user.id, roles: user.roles })
    .from(user)
    .leftJoin(employee, eq(employee.userId, user.id))
    .where(
      and(
        eq(user.accessState, 'active'),
        sql`(${employee.id} is null or ${employee.status} = 'active')`,
        afterId ? gt(user.id, afterId) : undefined,
        sql`string_to_array(${user.roles}, ',') && array[${sql.join(
          roles.map((role) => sql`${role}`),
          sql`, `,
        )}]::text[]`,
      ),
    )
    .orderBy(asc(user.id))
    .limit(1000)
  return {
    recipientIds: rows
      .filter((row) =>
        parseRoles(row.roles).some((role) => roles.includes(role)),
      )
      .map((row) => row.id),
    afterId: rows.length === 1000 ? rows.at(-1)?.id : undefined,
  }
}
const assignee = alias(user, 'job_assignee')
const creator = alias(user, 'job_creator')
/** A small authorized notification snapshot, without loading the detail history. */
export async function jobNotificationDetails(tx: JobsTransaction, id: string) {
  return (
    await tx
      .select({
        title: job.title,
        address: job.address,
        deadline: job.deadline,
        creatorName: creator.name,
      })
      .from(job)
      .innerJoin(creator, eq(job.createdBy, creator.id))
      .where(eq(job.id, id))
  ).at(0)
}
const currentJobDay = sql`(current_timestamp at time zone ${jobsTimeZone})::date`
const hasOpenDeadline = notInArray(job.status, ['completed', 'rejected'])
const overdueDeadline = and(hasOpenDeadline, lt(job.deadline, currentJobDay))

const summaryColumns = {
  id: job.id,
  title: job.title,
  address: job.address,
  kind: job.kind,
  deadline: job.deadline,
  isOverdue: sql<boolean>`coalesce(${overdueDeadline}, false)`,
  status: job.status,
  longitude: job.longitude,
  latitude: job.latitude,
  assigneeId: job.assigneeId,
  assigneeName: assignee.name,
  version: job.version,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
}

/** Lock current identity and employment on writes so suspension cannot race the authorization check. */
export async function currentIdentity(
  tx: JobsTransaction,
  id: string,
  lock: boolean,
) {
  const identityQuery = tx
    .select({
      id: user.id,
      roles: user.roles,
      permissionOverrides: user.permissionOverrides,
      state: user.accessState,
    })
    .from(user)
    .where(eq(user.id, id))
  const identity = (
    await (lock ? identityQuery.for('share') : identityQuery)
  ).at(0)
  const personQuery = tx
    .select({ status: employee.status })
    .from(employee)
    .where(eq(employee.userId, id))
  const person = (await (lock ? personQuery.for('share') : personQuery)).at(0)
  return { identity, person }
}

export async function listJobs(
  tx: JobsTransaction,
  actorId: string,
  search: JobSearch,
) {
  const assignedToActor = or(
    eq(job.assigneeId, actorId),
    sql`exists (select 1 from ${jobEmployee} where ${jobEmployee.jobId} = ${job.id} and ${jobEmployee.userId} = ${actorId})`,
  )
  // Escape SQL wildcard characters so ordinary input is a literal substring search.
  const term = `%${search.q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  const period =
    search.deadlineState === 'all'
      ? and(
          sql`${job.createdAt} >= (${search.from}::date::timestamp at time zone ${jobsTimeZone})`,
          sql`${job.createdAt} < ((${search.to}::date + 1)::timestamp at time zone ${jobsTimeZone})`,
        )
      : search.deadlineState === 'upcoming'
        ? and(hasOpenDeadline, gte(job.deadline, currentJobDay))
        : overdueDeadline
  const where = and(
    period,
    search.q
      ? or(
          ilike(job.title, term),
          ilike(job.address, term),
          ilike(job.notes, term),
          ilike(job.streetNameKa, term),
          ilike(job.streetNameEn, term),
          ilike(job.locationLabelKa, term),
          ilike(job.locationLabelEn, term),
        )
      : undefined,
    search.status !== 'all' ? eq(job.status, search.status) : undefined,
    search.kind !== 'all' ? eq(job.kind, search.kind) : undefined,
    search.scope === 'mine' ? assignedToActor : undefined,
    search.scope === 'related'
      ? or(eq(job.createdBy, actorId), assignedToActor)
      : undefined,
  )
  const order =
    search.sort === 'title'
      ? [asc(job.title), asc(job.id)]
      : search.sort === 'oldest'
        ? [asc(job.createdAt), asc(job.id)]
        : search.sort === 'deadline_asc'
          ? [sql`${job.deadline} asc nulls last`, asc(job.id)]
          : search.sort === 'deadline_desc'
            ? [sql`${job.deadline} desc nulls last`, asc(job.id)]
            : [desc(job.createdAt), desc(job.id)]
  const items = await tx
    .select({ ...summaryColumns, isUnread: unreadJob(actorId) })
    .from(job)
    .leftJoin(assignee, eq(job.assigneeId, assignee.id))
    .where(where)
    .orderBy(...order)
    .limit(search.view === 'map' ? jobsMapLimit : jobsPageSize)
    .offset(search.view === 'map' ? 0 : (search.page - 1) * jobsPageSize)
  const markers = await tx
    .select({
      id: job.id,
      title: job.title,
      kind: job.kind,
      status: job.status,
      deadline: job.deadline,
      createdAt: job.createdAt,
      isUnread: unreadJob(actorId),
      longitude: job.longitude,
      latitude: job.latitude,
    })
    .from(job)
    .where(and(where, isNotNull(job.longitude), isNotNull(job.latitude)))
    .orderBy(...order)
    .limit(jobsMapLimit)
  const [total] = await tx
    .select({ count: count(), mappedCount: count(job.longitude) })
    .from(job)
    .where(where)
  const assignedCounts = await employeeAssignmentCounts(
    tx,
    items.map((item) => item.id),
  )
  return {
    items: items.map((item) => ({
      ...item,
      assignedEmployeeCount: assignedCounts.get(item.id) ?? 0,
    })),
    markers: markers.filter(hasJobCoordinates),
    total: total.count,
    mapTruncated: total.mappedCount > jobsMapLimit,
    unmappedTotal: total.count - total.mappedCount,
  }
}

export async function readJob(tx: JobsTransaction, id: string) {
  const record = (
    await tx
      .select({
        ...summaryColumns,
        notes: job.notes,
        createdBy: job.createdBy,
        creatorName: creator.name,
        streetNameKa: job.streetNameKa,
        streetNameEn: job.streetNameEn,
        locationLabelKa: job.locationLabelKa,
        locationLabelEn: job.locationLabelEn,
        locationResolvedAt: job.locationResolvedAt,
      })
      .from(job)
      .innerJoin(creator, eq(job.createdBy, creator.id))
      .leftJoin(assignee, eq(job.assigneeId, assignee.id))
      .where(eq(job.id, id))
  ).at(0)
  if (!record) return null
  const history = await tx
    .select({
      id: jobEvent.id,
      action: jobEvent.action,
      status: jobEvent.status,
      note: jobEvent.note,
      assignmentChange: jobEvent.assignmentChange,
      actorName: user.name,
      createdAt: jobEvent.createdAt,
    })
    .from(jobEvent)
    .innerJoin(user, eq(jobEvent.actorId, user.id))
    .where(eq(jobEvent.jobId, id))
    .orderBy(desc(jobEvent.createdAt), desc(jobEvent.id))
    .limit(26)
  return {
    ...record,
    assignments: await readAssignments(tx, id),
    history: history.slice(0, 25),
    hasMoreHistory: history.length > 25,
  }
}
export async function lockJob(tx: JobsTransaction, id: string) {
  return (await tx.select().from(job).where(eq(job.id, id)).for('update')).at(0)
}
export async function insertJob(
  tx: JobsTransaction,
  values: typeof job.$inferInsert,
) {
  const inserted = (
    await tx
      .insert(job)
      .values(values)
      .onConflictDoNothing({ target: [job.createdBy, job.requestId] })
      .returning({ id: job.id })
  ).at(0)
  if (inserted) return { ...inserted, inserted: true }
  const existing = (
    await tx
      .select({ id: job.id })
      .from(job)
      .where(
        and(
          eq(job.createdBy, values.createdBy),
          eq(job.requestId, values.requestId),
        ),
      )
      .limit(1)
  ).at(0)
  if (!existing) throw new Error('Job creation conflict')
  return { ...existing, inserted: false }
}
export async function updateJob(
  tx: JobsTransaction,
  id: string,
  values: Partial<
    Pick<
      typeof job.$inferInsert,
      | 'title'
      | 'notes'
      | 'address'
      | 'kind'
      | 'deadline'
      | 'longitude'
      | 'latitude'
      | 'status'
      | 'assigneeId'
      | 'teamId'
      | 'gpsDeviceId'
      | 'version'
      | 'streetNameKa'
      | 'streetNameEn'
      | 'locationLabelKa'
      | 'locationLabelEn'
      | 'locationResolvedAt'
    >
  >,
) {
  await tx.update(job).set(values).where(eq(job.id, id))
}
export async function appendJobEvent(
  tx: JobsTransaction,
  values: typeof jobEvent.$inferInsert,
) {
  await tx.insert(jobEvent).values(values)
}
