import '@tanstack/react-start/server-only'
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { job, jobEmployee, jobEvent } from '#/db/schema'
import type { JobsTransaction } from './jobs.repository.server'

const assigned = (userId: string) =>
  or(
    eq(job.assigneeId, userId),
    sql`exists(select 1 from ${jobEmployee} where ${jobEmployee.jobId} = ${job.id} and ${jobEmployee.userId} = ${userId})`,
  )
export async function listAwardJobs(
  tx: JobsTransaction,
  input: { q: string; page: number; workDate: string; userId: string },
  timezone: string,
) {
  const completedAt = sql`(select ${jobEvent.createdAt} from ${jobEvent} where ${jobEvent.jobId} = ${job.id} and ${jobEvent.action} = 'status_changed' and ${jobEvent.status} = 'completed' order by ${jobEvent.createdAt} desc, ${jobEvent.id} desc limit 1)`
  const where = and(
    eq(job.status, 'completed'),
    assigned(input.userId),
    sql`(${completedAt} at time zone ${timezone})::date = ${input.workDate}::date`,
    input.q
      ? ilike(job.title, `%${input.q.replace(/[\\%_]/g, '\\$&')}%`)
      : undefined,
  )
  const records = await tx
    .select({ id: job.id, title: job.title, version: job.version })
    .from(job)
    .where(where)
    .orderBy(asc(job.title), asc(job.id))
    .limit(20)
    .offset((input.page - 1) * 20)
  const total = (await tx.select({ total: count() }).from(job).where(where))[0]
    .total
  return { records, total, pageSize: 20 }
}
export async function completedAwardJob(
  tx: JobsTransaction,
  jobId: string,
  userId: string,
) {
  const record = (
    await tx
      .select({
        id: job.id,
        title: job.title,
        status: job.status,
        version: job.version,
        assigneeId: job.assigneeId,
      })
      .from(job)
      .where(eq(job.id, jobId))
      .for('share')
  ).at(0)
  if (!record || record.status !== 'completed') return null
  const eligible = (
    await tx
      .select({ id: job.id })
      .from(job)
      .where(and(eq(job.id, jobId), assigned(userId)))
      .limit(1)
  ).at(0)
  if (!eligible) return null
  const completion = (
    await tx
      .select({
        id: jobEvent.id,
        actorId: jobEvent.actorId,
        createdAt: jobEvent.createdAt,
      })
      .from(jobEvent)
      .where(
        and(
          eq(jobEvent.jobId, jobId),
          eq(jobEvent.action, 'status_changed'),
          eq(jobEvent.status, 'completed'),
        ),
      )
      .orderBy(desc(jobEvent.createdAt), desc(jobEvent.id))
      .limit(1)
  ).at(0)
  return completion ? { record, completion } : null
}
