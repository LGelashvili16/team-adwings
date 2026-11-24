import { jobsToday } from './jobs.dates'
import type { JobStatus } from './jobs.types'

export const newJobPulseDuration = 5 * 60_000
export function jobMarkerPriority(
  indicators: { isNew: boolean; dueTomorrow: boolean },
  selected: boolean,
) {
  if (selected) return 4
  if (indicators.isNew && indicators.dueTomorrow) return 3
  if (indicators.isNew) return 2
  return indicators.dueTomorrow ? 1 : 0
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
  const tomorrow = jobsToday(new Date(now + 24 * 60 * 60_000))
  const age = job.createdAt ? now - Date.parse(job.createdAt) : Infinity
  return {
    dueTomorrow:
      job.deadline === tomorrow &&
      job.status !== 'completed' &&
      job.status !== 'rejected',
    isNew: job.isUnread === true,
    pulse: job.isUnread === true && age >= 0 && age < newJobPulseDuration,
  }
}
