// @vitest-environment node
import { expect, it, vi } from 'vitest'
import {
  deleteAllOwnNotifications,
  deleteOwnNotification,
  listOwnNotifications,
} from './notifications.service.server'
import type { Actor } from '#/lib/authorization/actor'

const deleteForRecipient = vi.fn((_recipientId: string, _id: string) =>
  Promise.resolve({ deletedCount: 1 }),
)
const deleteAllForRecipient = vi.fn((_recipientId: string) =>
  Promise.resolve({ deletedCount: 3 }),
)

vi.mock('@tanstack/react-start/server-only', () => ({}))
vi.mock('./notifications.repository.server', () => ({
  listForRecipient: () =>
    Promise.resolve({
      unseenCount: 1,
      totalCount: 1,
      items: [
        {
          complaintId: '019aac01-0000-7000-8000-000000000001',
          createdAt: new Date('2026-11-11T00:00:00Z'),
        },
      ],
    }),
  deleteForRecipient: (recipientId: string, id: string) =>
    deleteForRecipient(recipientId, id),
  deleteAllForRecipient: (recipientId: string) =>
    deleteAllForRecipient(recipientId),
}))
it.each([false, true])(
  'uses a reachable complaint destination for partial grants: manage=%s',
  async (manage) => {
    const actor: Actor = {
      id: 'worker',
      name: 'ტესტი',
      email: null,
      emailVerified: false,
      roles: ['hr_manager'],
      permissionOverrides: {
        allow: [],
        deny: manage ? [] : ['manage.access'],
      },
    }
    const result = await listOwnNotifications(actor, { limit: 5, offset: 0 })
    expect(result.items[0].complaintReview).toBe(manage)
  },
)

it('validates actor and id before deleting own notification', async () => {
  const actor: Actor = {
    id: 'worker',
    name: 'ტესტი',
    email: null,
    emailVerified: false,
    roles: ['employee'],
  }
  const id = '019aac01-0000-7000-8000-000000000001'
  await expect(deleteOwnNotification(null, { id })).rejects.toThrow()
  await expect(
    deleteOwnNotification(actor, { id: 'not-a-uuid' }),
  ).rejects.toThrow()
  await expect(deleteOwnNotification(actor, { id })).resolves.toEqual({
    deletedCount: 1,
  })
  expect(deleteForRecipient).toHaveBeenCalledWith('worker', id)
})

it('validates actor before deleting all own notifications', async () => {
  const actor: Actor = {
    id: 'worker',
    name: 'ტესტი',
    email: null,
    emailVerified: false,
    roles: ['employee'],
  }
  await expect(deleteAllOwnNotifications(null)).rejects.toThrow()
  await expect(deleteAllOwnNotifications(actor)).resolves.toEqual({
    deletedCount: 3,
  })
  expect(deleteAllForRecipient).toHaveBeenCalledWith('worker')
})
