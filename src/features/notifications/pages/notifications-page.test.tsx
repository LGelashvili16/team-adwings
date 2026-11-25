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
  isMobile: vi.fn(),
}))

vi.mock('#/hooks/use-mobile', () => ({ useIsMobile: api.isMobile }))

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

async function openNotificationActions(
  user: ReturnType<typeof userEvent.setup>,
) {
  const trigger = await screen.findByRole('button', {
    name: 'შეტყობინების მოქმედებები: მოწყობილობის დადასტურება',
  })
  trigger.focus()
  await user.keyboard('{Enter}')
  await screen.findByRole('menu')
  return trigger
}

beforeEach(() => {
  vi.clearAllMocks()
  api.isMobile.mockReturnValue(true)
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
  api.mark.mockImplementation(async () => {
    items = items.map((item) => ({ ...item, seenAt: '2026-11-20T19:00:00Z' }))
    return { ok: true, value: { updatedCount: items.length } }
  })
  api.unseen.mockImplementation(async () => {
    items = items.map((item) => ({ ...item, seenAt: null }))
    return { ok: true, value: { updatedCount: items.length } }
  })
})

describe('notifications page actions', () => {
  it('opens notification actions by keyboard and marks the selected notification unread and read', async () => {
    const { user, client } = setup()
    const trigger = await screen.findByRole('button', {
      name: 'შეტყობინების მოქმედებები: მოწყობილობის დადასტურება',
    })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('menuitem', { name: 'წაუკითხავად მონიშვნა' }),
    ).toBeVisible()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    )
    expect(trigger).toHaveFocus()
    expect(api.unseen).not.toHaveBeenCalled()

    await openNotificationActions(user)
    await user.click(
      screen.getByRole('menuitem', { name: 'წაუკითხავად მონიშვნა' }),
    )
    await waitFor(() =>
      expect(api.unseen).toHaveBeenCalledWith({ data: { ids: [items[0].id] } }),
    )
    await waitFor(() => expect(trigger).toBeEnabled())
    await openNotificationActions(user)
    await user.click(
      await screen.findByRole('menuitem', { name: 'ნანახად მონიშვნა' }),
    )
    await waitFor(() =>
      expect(api.mark).toHaveBeenCalledWith({ data: { ids: [items[0].id] } }),
    )
    expect(api.remove).not.toHaveBeenCalled()
    client.clear()
  })

  it('shows direct desktop actions and deletes only after confirmation', async () => {
    api.isMobile.mockReturnValue(false)
    const { user, client } = setup()
    const deleteButton = await screen.findByRole('button', {
      name: 'წაშლა: მოწყობილობის დადასტურება',
    })
    expect(
      screen.queryByRole('button', { name: /შეტყობინების მოქმედებები/ }),
    ).toBeNull()
    await user.click(
      screen.getByRole('button', {
        name: 'წაუკითხავად მონიშვნა: მოწყობილობის დადასტურება',
      }),
    )
    const markReadButton = await screen.findByRole('button', {
      name: 'ნანახად მონიშვნა: მოწყობილობის დადასტურება',
    })
    await waitFor(() => expect(markReadButton).toBeEnabled())
    await user.click(markReadButton)
    await waitFor(() => expect(deleteButton).toBeEnabled())
    expect(api.unseen).toHaveBeenCalledWith({ data: { ids: [items[0].id] } })
    expect(api.mark).toHaveBeenCalledWith({ data: { ids: [items[0].id] } })

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
    await user.click(deleteButton)
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
    await openNotificationActions(user)
    await user.click(screen.getByRole('menuitem', { name: 'წაშლა' }))
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
