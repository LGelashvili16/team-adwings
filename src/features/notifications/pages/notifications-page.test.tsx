import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorHTMLAttributes } from 'react'
import { ModalProvider } from '#/providers/modal-provider'
import type { NotificationItem } from '../notifications.types'
import { NotificationsPage } from './notifications-page'

const api = vi.hoisted(() => ({
  read: vi.fn(),
  mark: vi.fn(),
  unseen: vi.fn(),
  all: vi.fn(),
  remove: vi.fn(),
  removeAll: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../notifications.functions', () => ({
  getOwnNotifications: api.read,
  markOwnNotifications: api.mark,
  markOwnNotificationsAsUnseen: api.unseen,
  markAllOwnNotifications: api.all,
  removeOwnNotification: api.remove,
  removeAllOwnNotifications: api.removeAll,
}))

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: (id: string) =>
    id === '/_authenticated'
      ? { useRouteContext: () => ({ actor: { id: 'account-a' } }) }
      : { useSearch: () => ({ page: 1, filter: 'all' as const }) },
  useNavigate: () => api.navigate,
  Link: ({
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props} />
  ),
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: toastMock }))

let items: Array<NotificationItem>

function setup() {
  const user = userEvent.setup()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ModalProvider>
        <NotificationsPage />
      </ModalProvider>
    </QueryClientProvider>,
  )
  return { user, client }
}

beforeEach(() => {
  vi.clearAllMocks()
  items = [
    {
      id: '019aac01-0000-7000-8000-000000000001',
      title: 'მოწყობილობის დადასტურება',
      body: 'თანამშრომლის დასწრების მოწყობილობა დადასტურებულია.',
      createdAt: '2026-11-20T18:24:00Z',
      seenAt: '2026-11-20T18:30:00Z',
    },
  ]
  api.read.mockImplementation(async () => ({
    ok: true,
    value: {
      items: [...items],
      unseenCount: items.filter((item) => !item.seenAt).length,
      totalCount: items.length,
      hasMore: false,
    },
  }))
  api.remove.mockImplementation(async ({ data }: { data: { id: string } }) => {
    items = items.filter((item) => item.id !== data.id)
    return { ok: true, value: { deletedCount: 1 } }
  })
  api.removeAll.mockImplementation(async () => {
    const count = items.length
    items = []
    return { ok: true, value: { deletedCount: count } }
  })
})

describe('notifications page deletion', () => {
  it('opens the global confirmation modal and deletes only after confirmation', async () => {
    const { user, client } = setup()
    const deleteButton = await screen.findByRole('button', {
      name: 'წაშლა: მოწყობილობის დადასტურება',
    })

    await user.click(deleteButton)
    const dialog = await screen.findByRole('dialog', {
      name: 'შეტყობინების წაშლა',
    })
    expect(dialog).toHaveAccessibleDescription(
      'შეტყობინება წაიშლება მხოლოდ თქვენი სიიდან და აღარ აღდგება.',
    )
    expect(within(dialog).getByText('მოწყობილობის დადასტურება')).toBeVisible()

    // Canceling closes the modal without deleting.
    await user.click(within(dialog).getByRole('button', { name: 'გაუქმება' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(api.remove).not.toHaveBeenCalled()

    // Confirming deletes the notification and closes the modal.
    await user.click(
      screen.getByRole('button', {
        name: 'წაშლა: მოწყობილობის დადასტურება',
      }),
    )
    const confirmDialog = await screen.findByRole('dialog', {
      name: 'შეტყობინების წაშლა',
    })
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'წაშლა' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(api.remove).toHaveBeenCalledWith({
      data: { id: '019aac01-0000-7000-8000-000000000001' },
    })
    expect(toastMock.success).toHaveBeenCalledWith('შეტყობინება წაიშალა.')
    expect(await screen.findByText('შეტყობინებები ჯერ არ გაქვთ')).toBeVisible()
    client.clear()
  })

  it('keeps the modal open and displays an error alert when deletion fails', async () => {
    api.remove.mockResolvedValueOnce({
      ok: false,
      message: 'შეტყობინება ვერ წაიშალა. სცადეთ ხელახლა.',
    })
    const { user, client } = setup()
    await user.click(
      await screen.findByRole('button', {
        name: 'წაშლა: მოწყობილობის დადასტურება',
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'შეტყობინების წაშლა',
    })
    await user.click(within(dialog).getByRole('button', { name: 'წაშლა' }))

    expect(
      await within(dialog).findByText(
        'შეტყობინება ვერ წაიშალა. სცადეთ ხელახლა.',
      ),
    ).toBeVisible()
    expect(toastMock.error).toHaveBeenCalledWith(
      'შეტყობინება ვერ წაიშალა. სცადეთ ხელახლა.',
    )
    expect(screen.getByRole('dialog')).toBeVisible()
    client.clear()
  })

  it('deletes all notifications only after confirming in the global modal', async () => {
    items = [
      ...items,
      {
        id: '019aac01-0000-7000-8000-000000000002',
        title: 'საჩივრის განახლება',
        body: 'საჩივართან დაკავშირებული ახალი ინფორმაცია ხელმისაწვდომია.',
        createdAt: '2026-11-20T17:00:00Z',
        seenAt: null,
      },
    ]
    const { user, client } = setup()
    const deleteAllButton = await screen.findByRole('button', {
      name: 'ყველას წაშლა',
    })
    await waitFor(() => expect(deleteAllButton).toBeEnabled())

    await user.click(deleteAllButton)
    const dialog = await screen.findByRole('dialog', {
      name: 'ყველა შეტყობინების წაშლა',
    })
    expect(dialog).toHaveAccessibleDescription(
      'ყველა შეტყობინება წაიშლება მხოლოდ თქვენი სიიდან და აღარ აღდგება.',
    )

    await user.click(within(dialog).getByRole('button', { name: 'გაუქმება' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(api.removeAll).not.toHaveBeenCalled()

    await user.click(deleteAllButton)
    const confirmDialog = await screen.findByRole('dialog', {
      name: 'ყველა შეტყობინების წაშლა',
    })
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'ყველას წაშლა' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(api.removeAll).toHaveBeenCalledWith({ data: {} })
    expect(toastMock.success).toHaveBeenCalledWith('ყველა შეტყობინება წაიშალა.')
    expect(await screen.findByText('შეტყობინებები ჯერ არ გაქვთ')).toBeVisible()
    expect(deleteAllButton).toBeDisabled()
    client.clear()
  })
})
