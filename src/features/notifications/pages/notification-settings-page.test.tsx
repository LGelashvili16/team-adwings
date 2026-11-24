import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { NotificationSettingsPage } from './notification-settings-page'
import {
  getNotificationSettings,
  updateNotificationSettings,
} from '../notification-settings.functions'
import { toast } from 'sonner'
import { defaultJobNotificationRoles } from '../notification-settings.schemas'

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useRouteContext: () => ({ actor: { id: 'admin' } }) }),
}))
vi.mock('../notification-settings.functions', () => ({
  getNotificationSettings: vi.fn(),
  updateNotificationSettings: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
afterEach(() => vi.clearAllMocks())

function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NotificationSettingsPage />
    </QueryClientProvider>,
  )
}

it('loads the selected roles and saves only after explicit confirmation', async () => {
  vi.mocked(getNotificationSettings).mockResolvedValue({
    jobNotificationRoles: defaultJobNotificationRoles,
  })
  vi.mocked(updateNotificationSettings).mockResolvedValue({
    jobNotificationRoles: defaultJobNotificationRoles.filter(
      (role) => role !== 'supervisor',
    ),
  })
  mount()
  const control = await screen.findByRole('checkbox', {
    name: 'წარმოების უფროსი',
  })
  expect(control).toBeChecked()
  expect(screen.getAllByRole('checkbox')).toHaveLength(7)
  expect(
    screen.getByRole('checkbox', { name: 'თანამშრომელი' }),
  ).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'შენახვა' })).toBeDisabled()
  const user = userEvent.setup()
  await user.click(control)
  expect(updateNotificationSettings).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledOnce())
  expect(updateNotificationSettings).toHaveBeenCalledWith({
    data: {
      jobNotificationRoles: defaultJobNotificationRoles.filter(
        (role) => role !== 'supervisor',
      ),
    },
  })
  expect(screen.getByRole('button', { name: 'შენახვა' })).toBeDisabled()
})

it('lets administrators select a read-only role without enabling job permissions', async () => {
  vi.mocked(getNotificationSettings).mockResolvedValue({
    jobNotificationRoles: [],
  })
  vi.mocked(updateNotificationSettings).mockResolvedValue({
    jobNotificationRoles: ['hr_manager'],
  })
  mount()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: 'HR' }))
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() =>
    expect(updateNotificationSettings).toHaveBeenCalledWith({
      data: { jobNotificationRoles: ['hr_manager'] },
    }),
  )
})

it('keeps the draft and reports a safe error when saving fails', async () => {
  vi.mocked(getNotificationSettings).mockResolvedValue({
    jobNotificationRoles: defaultJobNotificationRoles,
  })
  vi.mocked(updateNotificationSettings).mockRejectedValue(
    new Error('private SQL'),
  )
  mount()
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('checkbox', { name: 'წარმოების უფროსი' }),
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      'პარამეტრები ვერ შეინახა. სცადეთ ხელახლა.',
    ),
  )
  expect(
    screen.getByRole('checkbox', { name: 'წარმოების უფროსი' }),
  ).not.toBeChecked()
  expect(screen.queryByText('private SQL')).not.toBeInTheDocument()
})
