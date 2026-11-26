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

it('opens the notified earning month in the recipient’s payroll', () => {
  expect(
    notificationDestination({ kind: 'payroll', month: '2026-11' }, 'employee'),
  ).toEqual({ to: '/payroll', search: { month: '2026-11' } })
  expect(
    notificationDestination({ kind: 'payroll', month: '2026-13' }, 'employee'),
  ).toBeNull()
  expect(
    notificationDestination(
      { kind: 'payroll', month: '2026-11', userId: 'someone-else' },
      'employee',
    ),
  ).toBeNull()
})
