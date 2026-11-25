import '@tanstack/react-start/server-only'
import { assertPermissions } from '#/lib/authorization/access'
import { hasAnyPermission } from '#/lib/authorization/permissions'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import {
  jobAwardEvidenceSchema,
  jobAwardSearchSchema,
} from '../job-award-evidence.schemas'
import { requireJobActor } from './jobs.policy.server'
import * as repository from './job-award-evidence.repository.server'
import type { JobsTransaction } from './jobs.repository.server'
import type { Actor } from '#/lib/authorization/actor'

/** Payroll callers supply their transaction; this narrow contract independently authorizes work evidence. */
async function authorize(
  tx: JobsTransaction,
  actor: Actor | null,
  preparationOnly = false,
) {
  const current = await requireJobActor(tx, actor, true)
  assertPermissions(current, [
    'manage.access',
    'payroll.read.all',
    ...(preparationOnly ? ['payroll.awards.propose' as const] : []),
  ])
  if (
    !hasAnyPermission(current, [
      'payroll.awards.propose',
      'payroll.awards.review',
    ])
  )
    throw new AuthorizationError()
}
export async function listCompletedJobsForAward(
  tx: JobsTransaction,
  actor: Actor | null,
  input: unknown,
) {
  const data = jobAwardSearchSchema.parse(input)
  await authorize(tx, actor, true)
  const { timezone } = await getCompanyWorkday(new Date(), tx)
  return repository.listAwardJobs(tx, data, timezone)
}
export async function getCompletedJobAwardEvidence(
  tx: JobsTransaction,
  actor: Actor | null,
  input: unknown,
) {
  const data = jobAwardEvidenceSchema.parse(input)
  await authorize(tx, actor)
  const found = await repository.completedAwardJob(tx, data.jobId, data.userId)
  if (!found) return null
  const { date, timezone } = await getCompanyWorkday(
    found.completion.createdAt,
    tx,
  )
  return {
    jobId: found.record.id,
    jobTitle: found.record.title,
    jobVersion: found.record.version,
    completionEventId: found.completion.id,
    completedAt: found.completion.createdAt.toISOString(),
    completedBy: found.completion.actorId,
    assigneeId: found.record.assigneeId!,
    workDate: date,
    timezone,
  }
}
