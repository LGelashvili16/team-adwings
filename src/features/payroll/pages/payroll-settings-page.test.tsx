import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { PayrollSettingsPage } from './payroll-settings-page'
import {
  getPayrollSettings,
  updatePayrollSettings,
} from '../payroll-settings.functions'
import { payrollSettingsKey } from '../payroll-settings.queries'
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const initial: PayrollSettingsView = {
  today: '2026-11-24',
  current: null,
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

it('saves valid percentages as integer basis points without a manual reason', async () => {
  const user = userEvent.setup()
  vi.mocked(updatePayrollSettings).mockImplementation(async ({ data }) => ({
    ok: true,
    value: {
      ...data,
      reason: 'ხელფასების პარამეტრები შენახულია.',
      version: 1,
      actorId: 'accountant',
      createdAt: '2026-11-24T10:00:00.000Z',
    },
  }))
  mount()
  const income = await screen.findByRole('switch', {
    name: 'საშემოსავლოს გამოთვლა',
  })
  expect(income).not.toBeChecked()
  expect(
    screen.getByRole('textbox', { name: /საშემოსავლო გადასახადი/ }),
  ).toBeDisabled()
  expect(
    screen.queryByRole('textbox', { name: /ცვლილების მიზეზი/ }),
  ).not.toBeInTheDocument()
  await user.click(income)
  const incomeRate = screen.getByRole('textbox', {
    name: /საშემოსავლო გადასახადი/,
  })
  await user.clear(incomeRate)
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(updatePayrollSettings).not.toHaveBeenCalled()
  expect(
    await screen.findByText('მიუთითეთ პროცენტი მაქსიმუმ ორი ათწილადით.'),
  ).toBeVisible()
  await waitFor(() => expect(incomeRate).toHaveFocus())
  await user.type(incomeRate, '20')
  await user.click(screen.getByRole('switch', { name: 'საპენსიოს გამოთვლა' }))
  const rate = screen.getByRole('textbox', { name: /დასაქმებულის საპენსიო/ })
  await user.clear(rate)
  await user.type(rate, '2.25')
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() =>
    expect(updatePayrollSettings).toHaveBeenCalledWith({
      data: expect.objectContaining({
        incomeTaxEnabled: true,
        incomeTaxBasisPoints: 2000,
        pensionEnabled: true,
        employeePensionBasisPoints: 225,
        employerPensionBasisPoints: 200,
        expectedVersion: 0,
      }),
    }),
  )
  await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
  expect(
    vi.mocked(updatePayrollSettings).mock.calls[0]?.[0].data,
  ).not.toHaveProperty('reason')
  expect(
    screen.getByRole('switch', { name: 'საშემოსავლოს გამოთვლა' }),
  ).toBeChecked()
  expect(
    screen.getByRole('switch', { name: 'საპენსიოს გამოთვლა' }),
  ).toBeChecked()
  expect(
    screen.getByRole('textbox', { name: /დასაქმებულის საპენსიო/ }),
  ).toHaveValue('2.25')
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() =>
    expect(updatePayrollSettings).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        expectedVersion: 1,
        employeePensionBasisPoints: 225,
      }),
    }),
  )
})

it('preserves the draft after conflicts and background updates', async () => {
  const user = userEvent.setup()
  const message = 'პარამეტრები შეიცვალა. განაახლეთ გვერდი.'
  vi.mocked(updatePayrollSettings).mockResolvedValue({ ok: false, message })
  const client = mount()
  await user.click(
    await screen.findByRole('switch', { name: 'საშემოსავლოს გამოთვლა' }),
  )
  const rate = screen.getByRole('textbox', {
    name: /საშემოსავლო გადასახადი/,
  })
  await user.clear(rate)
  await user.type(rate, '21.5')
  client.setQueryData(payrollSettingsKey('accountant'), {
    ...initial,
    today: '2026-11-25',
  })
  expect(rate).toHaveValue('21.5')
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(await screen.findByText(message)).toBeVisible()
  expect(rate).toHaveValue('21.5')
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
  await user.click(
    await screen.findByRole('switch', { name: 'საშემოსავლოს გამოთვლა' }),
  )
  const rate = screen.getByRole('textbox', {
    name: /საშემოსავლო გადასახადი/,
  })
  await user.clear(rate)
  await user.type(rate, '21.5')
  vi.mocked(getPayrollSettings).mockRejectedValue(
    new Error('private database failure'),
  )
  await client.refetchQueries({ queryKey: payrollSettingsKey('accountant') })
  expect(
    await screen.findByText(/პარამეტრების განახლება ვერ მოხერხდა/),
  ).toBeVisible()
  expect(rate).toHaveValue('21.5')
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
