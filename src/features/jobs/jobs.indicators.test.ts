import { expect, it } from 'vitest'
import { jobIndicators, jobMarkerPriority } from './jobs.indicators'

const now = Date.parse('2026-11-24T20:30:00Z')
it.each(['dueTomorrow', 'isOverdue'] as const)(
  'prioritizes overlapping pins with %s and unread indicators',
  (indicator) => {
    const ordinary = { isNew: false, dueTomorrow: false, isOverdue: false }
    const deadline = { ...ordinary, [indicator]: true }
    const unread = { ...ordinary, isNew: true }
    const both = { ...deadline, isNew: true }
    expect(jobMarkerPriority(deadline, false)).toBeGreaterThan(
      jobMarkerPriority(ordinary, false),
    )
    expect(jobMarkerPriority(unread, false)).toBeGreaterThan(
      jobMarkerPriority(deadline, false),
    )
    expect(jobMarkerPriority(both, false)).toBeGreaterThan(
      jobMarkerPriority(unread, false),
    )
    expect(jobMarkerPriority(ordinary, true)).toBeGreaterThan(
      jobMarkerPriority(both, false),
    )
  },
)
it('marks unfinished jobs overdue once their Tbilisi calendar day ends', () => {
  const pending = { deadline: '2026-11-24', status: 'pending' as const }
  expect(
    jobIndicators(pending, Date.parse('2026-11-24T19:59:59Z')).isOverdue,
  ).toBe(false)
  expect(jobIndicators(pending, now)).toMatchObject({
    isOverdue: true,
    dueTomorrow: false,
  })
  expect(jobIndicators({ ...pending, deadline: null }, now).isOverdue).toBe(
    false,
  )
  for (const status of ['completed', 'rejected'] as const)
    expect(jobIndicators({ ...pending, status }, now).isOverdue).toBe(false)
})
it('uses the company calendar after local midnight and omits closed jobs', () => {
  expect(
    jobIndicators({ deadline: '2026-11-26', status: 'pending' }, now)
      .dueTomorrow,
  ).toBe(true)
  expect(
    jobIndicators({ deadline: '2026-11-25', status: 'pending' }, now)
      .dueTomorrow,
  ).toBe(false)
  for (const status of ['completed', 'rejected'] as const)
    expect(
      jobIndicators({ deadline: '2026-11-26', status }, now).dueTomorrow,
    ).toBe(false)
})
it('retains the new label after five minutes but stops pulsing and respects per-user read state', () => {
  const job = {
    status: 'pending' as const,
    isUnread: true,
    createdAt: new Date(now - 299_999).toISOString(),
  }
  expect(jobIndicators(job, now)).toMatchObject({ isNew: true, pulse: true })
  expect(jobIndicators(job, now + 1)).toMatchObject({
    isNew: true,
    pulse: false,
  })
  expect(jobIndicators({ ...job, isUnread: false }, now)).toMatchObject({
    isNew: false,
    pulse: false,
  })
  expect(
    jobIndicators(
      { ...job, createdAt: new Date(now + 1000).toISOString() },
      now,
    ).pulse,
  ).toBe(false)
})
