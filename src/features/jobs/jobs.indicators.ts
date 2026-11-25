import { jobsToday } from './jobs.dates'
import type { JobStatus } from './jobs.types'

export const newJobPulseDuration = 5 * 60_000
export function jobMarkerPriority(
  indicators: { isNew: boolean; dueTomorrow: boolean; isOverdue: boolean },
  selected: boolean,
) {
  if (selected) return 4
  const hasDeadlineIndicator = indicators.dueTomorrow || indicators.isOverdue
  if (indicators.isNew && hasDeadlineIndicator) return 3
  if (indicators.isNew) return 2
  return hasDeadlineIndicator ? 1 : 0
}
export function jobIndicators(
  job: {
    deadline?: string | null
    status: JobStatus
    createdAt?: string
    isUnread?: boolean
  },
  now = Date.now(),
) {
  const deadline =
    job.status === 'completed' || job.status === 'rejected'
      ? null
      : job.deadline
  const age = job.createdAt ? now - Date.parse(job.createdAt) : Infinity
  return {
    isOverdue: Boolean(deadline && deadline < jobsToday(new Date(now))),
    dueTomorrow: Boolean(
      deadline && deadline === jobsToday(new Date(now + 24 * 60 * 60_000)),
    ),
    isNew: job.isUnread === true,
    pulse: job.isUnread === true && age >= 0 && age < newJobPulseDuration,
  }
}
