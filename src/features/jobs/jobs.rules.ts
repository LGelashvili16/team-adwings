import { hasPermission } from '#/lib/authorization/permissions'
import type { Actor } from '#/lib/authorization/actor'
import type { JobStatus } from './jobs.types'

export function hasJobCoordinates<
  T extends { longitude: number | null; latitude: number | null },
>(job: T): job is T & { longitude: number; latitude: number } {
  return job.longitude !== null && job.latitude !== null
}

export class JobWorkflowError extends Error {}
export class JobConflictError extends JobWorkflowError {}
export const canManageJobs = (actor: Actor) =>
  hasPermission(actor, 'jobs.manage')

export const canManageJobDetails = (actor: Actor, job: { createdBy: string }) =>
  actor.id === job.createdBy || hasPermission(actor, 'jobs.edit.all')

export const canEditJob = (
  actor: Actor,
  job: { status: JobStatus; createdBy: string },
) =>
  canManageJobDetails(actor, job) &&
  job.status !== 'completed' &&
  job.status !== 'rejected'

/** Claim grants are separate from management. Claiming is atomic; subsequent progress respects assignment. */
export function allowedJobTransitions(
  actor: Actor,
  job: { status: JobStatus; assigneeId: string | null; createdBy: string },
): Array<JobStatus> {
  if (job.status === 'completed' || job.status === 'rejected')
    return canManageJobDetails(actor, job) ? ['pending'] : []
  const manager = canManageJobs(actor)
  const complete = hasPermission(actor, 'jobs.complete.manage')
  if (job.status === 'pending') {
    const transitions: Array<JobStatus> = []
    if (complete) transitions.push('completed')
    if (hasPermission(actor, 'jobs.claim')) transitions.push('en_route')
    if (manager) transitions.push('rejected')
    return transitions
  }
  if (!manager && job.assigneeId !== actor.id)
    return complete ? ['completed'] : []
  switch (job.status) {
    case 'en_route':
      return complete
        ? [
            'completed',
            'on_site',
            'rejected',
            ...(manager ? ['pending' as const] : []),
          ]
        : manager
          ? ['on_site', 'rejected', 'pending']
          : ['on_site', 'rejected']
    case 'on_site':
      return manager
        ? ['completed', 'rejected', 'pending']
        : ['completed', 'rejected']
  }
}
