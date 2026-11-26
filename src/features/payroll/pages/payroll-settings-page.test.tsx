import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { PayrollSettingsPage } from './payroll-settings-page'
import {
  getPayrollSettings,
  updatePayrollSettings,
} from '../payroll-settings.functions'
import { payrollSettingsKey } from '../payroll-settings.queries'
import { paymentScheduleDefaults } from '../payroll-settings.schemas'
import type { PayrollSettingsView } from '../payroll-settings.queries'

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useRouteContext: () => ({
      actor: { id: 'accountant', roles: ['accountant'] },
    }),
  }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('../payroll-settings.functions', () => ({
  getPayrollSettings: vi.fn(),
  updatePayrollSettings: vi.fn(),
}))
vi.mock('../monthly.functions', () => ({
  getMonthlyEmployee: vi.fn(),
  getMonthlyPayroll: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const initial: PayrollSettingsView = {
  latest: null,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPayrollSettings).mockResolvedValue(initial)
})
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <PayrollSettingsPage />
    </QueryClientProvider>,
  )
  return client
}

it('validates and saves a one-payment schedule', async () => {
  const user = userEvent.setup()
  vi.mocked(updatePayrollSettings).mockImplementation(async ({ data }) => {
    const { schedule } = data
    const value = {
      schedule,
      reason: 'გრაფიკი შენახულია.',
      version: 1,
      actorId: 'accountant',
      createdAt: '2026-11-24T10:00:00.000Z',
    }
    vi.mocked(getPayrollSettings).mockResolvedValue({ latest: value })
    return { ok: true, value }
  })
  mount()
  const twice = await screen.findByRole('radio', { name: 'ორჯერ' })
  expect(twice).toBeChecked()
  expect(
    screen.getByRole('heading', { name: 'ხელფასის მეორე ნაწილი' }),
  ).toBeVisible()
  const once = screen.getByRole('radio', { name: 'ერთხელ' })
  await user.click(once)
  expect(once).toBeChecked()
  expect(twice).not.toBeChecked()
  expect(
    screen.getByRole('heading', { name: 'ხელფასის გადახდა' }),
  ).toBeVisible()
  const start = screen.getAllByRole('spinbutton', { name: 'საწყისი დღე' })[0]
  await user.clear(start)
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(updatePayrollSettings).not.toHaveBeenCalled()
  expect(await screen.findByText('დღე უნდა იყოს 1-დან 31-მდე.')).toBeVisible()
  await waitFor(() => expect(start).toHaveFocus())
  await user.type(start, '12')
  const bonusMonth = within(
    screen.getByRole('region', { name: 'ბონუსები და პრემიები' }),
  ).getByRole('combobox', { name: 'გაცემის თვე' })
  expect(bonusMonth).toHaveTextContent('მომდევნო თვე')
  await user.click(bonusMonth)
  await user.click(screen.getByRole('option', { name: 'სახელფასო თვე' }))
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledOnce())
  expect(updatePayrollSettings).toHaveBeenCalledWith({
    data: {
      expectedVersion: 0,
      schedule: {
        ...paymentScheduleDefaults,
        first: null,
        salary: { ...paymentScheduleDefaults.salary, start: 12 },
        adjustments: { ...paymentScheduleDefaults.adjustments, offset: 0 },
      },
    },
  })
  expect(bonusMonth).toHaveTextContent('სახელფასო თვე')
})
it('preserves the draft after conflicts and background updates', async () => {
  const user = userEvent.setup()
  const message = 'პარამეტრები შეიცვალა. განაახლეთ გვერდი.'
  vi.mocked(updatePayrollSettings).mockResolvedValue({ ok: false, message })
  const client = mount()
  const rate = (
    await screen.findAllByRole('spinbutton', { name: 'საწყისი დღე' })
  )[1]
  await user.clear(rate)
  await user.type(rate, '12')
  client.setQueryData(payrollSettingsKey('accountant'), {
    ...initial,
    latest: { schedule: paymentScheduleDefaults, version: 1 },
  })
  expect(rate).toHaveValue(12)
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(await screen.findByText(message)).toBeVisible()
  expect(rate).toHaveValue(12)
  expect(toast.success).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledWith(message)
})

it('shows a safe error when settings cannot be read', async () => {
  vi.mocked(getPayrollSettings).mockRejectedValue(new Error('private SQL'))
  mount()
  expect(await screen.findByText(/პარამეტრები ვერ ჩაიტვირთა/)).toBeVisible()
  expect(screen.queryByText('private SQL')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'შენახვა' }),
  ).not.toBeInTheDocument()
})

it('retains unsaved inputs when a background refetch fails', async () => {
  const user = userEvent.setup()
  const client = mount()
  const rate = (
    await screen.findAllByRole('spinbutton', { name: 'საწყისი დღე' })
  )[1]
  await user.clear(rate)
  await user.type(rate, '12')
  vi.mocked(getPayrollSettings).mockRejectedValue(
    new Error('private database failure'),
  )
  await client.refetchQueries({ queryKey: payrollSettingsKey('accountant') })
  expect(
    await screen.findByText(/პარამეტრების განახლება ვერ მოხერხდა/),
  ).toBeVisible()
  expect(rate).toHaveValue(12)
  expect(screen.getByRole('button', { name: 'შენახვა' })).toBeEnabled()
  expect(toast.error).not.toHaveBeenCalled()
})

it('disables repeated submission while saving', async () => {
  const user = userEvent.setup()
  vi.mocked(updatePayrollSettings).mockReturnValue(new Promise(() => {}))
  mount()
  await user.click(await screen.findByRole('button', { name: 'შენახვა' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'შენახვა' })).toHaveAttribute(
      'aria-busy',
      'true',
    ),
  )
  expect(screen.getByRole('button', { name: 'შენახვა' })).toBeDisabled()
  expect(updatePayrollSettings).toHaveBeenCalledTimes(1)
})
