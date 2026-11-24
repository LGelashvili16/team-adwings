import '@tanstack/react-start/server-only'
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import {
  employee,
  gpsDevice,
  job,
  jobEmployee,
  productionTeam,
  teamMembership,
  user,
} from '#/db/schema'
import { jobAssignmentPageSize } from '../jobs.schemas'
import {
  teamMemberRoles,
  excludedTeamRoles,
} from '#/features/teams/teams.rules'
import type { z } from 'zod'
import type { jobAssignmentSearchSchema } from '../jobs.schemas'
import type { JobAssignments, JobAssignmentCandidate } from '../jobs.types'
import type { JobsTransaction } from './jobs.repository.server'

const eligibleEmployee = and(
  eq(employee.status, 'active'),
  eq(user.accessState, 'active'),
  sql`string_to_array(${user.roles}, ',') && ARRAY[${sql.join(
    teamMemberRoles.map((role) => sql`${role}`),
    sql`, `,
  )}]::text[]`,
  sql`not (string_to_array(${user.roles}, ',') && ARRAY[${sql.join(
    excludedTeamRoles.map((role) => sql`${role}`),
    sql`, `,
  )}]::text[])`,
)
const personColumns = {
  id: user.id,
  name: employee.fullName,
  jobTitle: employee.jobTitle,
}

export async function readAssignments(
  tx: JobsTransaction,
  jobId: string,
): Promise<JobAssignments> {
  const employees = await tx
    .select(personColumns)
    .from(jobEmployee)
    .innerJoin(user, eq(user.id, jobEmployee.userId))
    .innerJoin(employee, eq(employee.userId, user.id))
    .where(eq(jobEmployee.jobId, jobId))
    .orderBy(asc(employee.fullName), asc(user.id))
  const [labels] = await tx
    .select({
      team: { id: productionTeam.id, name: productionTeam.name },
      gpsDevice: { id: gpsDevice.id, name: gpsDevice.name },
    })
    .from(job)
    .leftJoin(productionTeam, eq(productionTeam.id, job.teamId))
    .leftJoin(gpsDevice, eq(gpsDevice.id, job.gpsDeviceId))
    .where(eq(job.id, jobId))
  return {
    employees,
    team: labels.team,
    gpsDevice: labels.gpsDevice,
  }
}

export async function assignmentCandidates(
  tx: JobsTransaction,
  search: z.infer<typeof jobAssignmentSearchSchema>,
): Promise<{ items: Array<JobAssignmentCandidate>; total: number }> {
  const term = `%${search.q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  const offset = (search.page - 1) * jobAssignmentPageSize
  if (search.kind === 'employees') {
    const where = and(
      eligibleEmployee,
      sql`string_to_array(${user.roles}, ',') && ARRAY[${sql.join(
        search.roles.map((role) => sql`${role}`),
        sql`, `,
      )}]::text[]`,
      or(
        ilike(employee.fullName, term),
        ilike(employee.username, term),
        ilike(employee.jobTitle, term),
      ),
    )
    const items = await tx
      .select(personColumns)
      .from(employee)
      .innerJoin(user, eq(user.id, employee.userId))
      .where(where)
      .orderBy(asc(employee.fullName), asc(user.id))
      .limit(jobAssignmentPageSize)
      .offset(offset)
    const [total] = await tx
      .select({ value: count() })
      .from(employee)
      .innerJoin(user, eq(user.id, employee.userId))
      .where(where)
    return { items, total: total.value }
  }
  if (search.kind === 'teams') {
    const where = and(
      eq(productionTeam.active, true),
      ilike(productionTeam.name, term),
    )
    const items = await tx
      .select({
        id: productionTeam.id,
        name: productionTeam.name,
        memberCount: sql<number>`(${tx
          .select({ value: count() })
          .from(teamMembership)
          .innerJoin(employee, eq(employee.userId, teamMembership.userId))
          .innerJoin(user, eq(user.id, employee.userId))
          .where(
            and(
              eq(teamMembership.teamId, productionTeam.id),
              isNull(teamMembership.endedAt),
              eligibleEmployee,
            ),
          )})`.mapWith(Number),
      })
      .from(productionTeam)
      .where(where)
      .orderBy(asc(productionTeam.name), asc(productionTeam.id))
      .limit(jobAssignmentPageSize)
      .offset(offset)
    const [total] = await tx
      .select({ value: count() })
      .from(productionTeam)
      .where(where)
    return {
      items: items.map((item) => ({ ...item, jobTitle: null })),
      total: total.value,
    }
  }
  const where = and(eq(gpsDevice.enabled, true), ilike(gpsDevice.name, term))
  const items = await tx
    .select({
      id: gpsDevice.id,
      name: gpsDevice.name,
      reportedId: gpsDevice.reportedId,
      phone: gpsDevice.phone,
    })
    .from(gpsDevice)
    .where(where)
    .orderBy(asc(gpsDevice.name), asc(gpsDevice.id))
    .limit(jobAssignmentPageSize)
    .offset(offset)
  const [total] = await tx
    .select({ value: count() })
    .from(gpsDevice)
    .where(where)
  return {
    items: items.map((item) => ({ ...item, jobTitle: null })),
    total: total.value,
  }
}

export async function assignmentTeam(
  tx: JobsTransaction,
  id: string,
  lock = false,
) {
  const query = tx
    .select({
      id: productionTeam.id,
      name: productionTeam.name,
      version: productionTeam.version,
      active: productionTeam.active,
    })
    .from(productionTeam)
    .where(eq(productionTeam.id, id))
  return (await (lock ? query.for('share') : query)).at(0)
}
export async function assignmentTeamMembers(tx: JobsTransaction, id: string) {
  return (
    tx
      .select(personColumns)
      .from(teamMembership)
      .innerJoin(employee, eq(employee.userId, teamMembership.userId))
      .innerJoin(user, eq(user.id, employee.userId))
      .where(
        and(
          eq(teamMembership.teamId, id),
          isNull(teamMembership.endedAt),
          eligibleEmployee,
        ),
      )
      .orderBy(asc(employee.fullName), asc(user.id))
      // Never truncate a roster and silently save an incomplete crew. The draft validator reports the limit.
      .limit(201)
  )
}
export async function assignmentDevice(tx: JobsTransaction, id: string) {
  return (
    await tx
      .select({
        id: gpsDevice.id,
        name: gpsDevice.name,
        enabled: gpsDevice.enabled,
      })
      .from(gpsDevice)
      .where(eq(gpsDevice.id, id))
      .for('share')
  ).at(0)
}
export async function replaceEmployees(
  tx: JobsTransaction,
  jobId: string,
  ids: Array<string>,
) {
  await tx.delete(jobEmployee).where(eq(jobEmployee.jobId, jobId))
  if (ids.length)
    await tx
      .insert(jobEmployee)
      .values(ids.map((userId) => ({ jobId, userId })))
}

/** Batched summaries avoid loading every crew or issuing one query per job. */
export async function employeeAssignmentCounts(
  tx: JobsTransaction,
  ids: Array<string>,
) {
  if (!ids.length) return new Map<string, number>()
  const rows = await tx
    .select({ jobId: jobEmployee.jobId, value: count() })
    .from(jobEmployee)
    .where(inArray(jobEmployee.jobId, ids))
    .groupBy(jobEmployee.jobId)
  return new Map(rows.map((row) => [row.jobId, row.value]))
}
