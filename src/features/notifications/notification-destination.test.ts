import { expect, it } from 'vitest'
import { notificationDestination } from './notification-destination'

it('opens the exact notified job in list details regardless of the previous map view', () => {
  const jobId = '019aac01-0000-7000-8000-000000000001'
  expect(notificationDestination({ kind: 'job', jobId }, 'actor')).toEqual({
    to: '/jobs',
    search: { pin: jobId, view: 'list' },
  })
  expect(
    notificationDestination({ kind: 'job', jobId: 'invalid' }, 'actor'),
  ).toBeNull()
})
