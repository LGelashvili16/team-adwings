import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  deleteMonthlyEmployee,
  getMonthlyEmployee,
  getMonthlyPaymentPreview,
  setMonthlyEmployee,
  setMonthlyPayments,
} from '../monthly.functions'
import type { MonthlyDetail } from '../monthly.types'
import { MonthlyEntrySheet } from './monthly-entry-sheet'
import { MonthlyRemoveDialog } from './monthly-remove-dialog'

vi.mock('../monthly.functions', () => ({
  deleteMonthlyEmployee: vi.fn(),
  getMonthlyEmployee: vi.fn(),
  getMonthlyPaymentPreview: vi.fn(),
  setMonthlyEmployee: vi.fn(),
  setMonthlyPayments: vi.fn(),
}))
vi.mock('../salary.functions', () => ({
  getMySalary: vi.fn(),
  getEmployeeSalary: vi.fn(),
  getSalaryDirectory: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const salary = {
  kind: 'monthly',
  amountMinor: 150000,
  amountBasis: 'net',
  currency: 'GEL',
  version: 1,
  effectiveFrom: '2026-11-25',
} as const
const view: MonthlyDetail = {
  timezone: 'Asia/Tbilisi',
  source: {
    employeeName: 'ანა',
    salary,
    requiresBaseConfirmation: true,
    sourceToken: 'a'.repeat(64),
  },
  baseNeedsReview: false,
  sourceMessage: null,
  salaryMissing: false,
  employmentNeedsReview: false,
  canOpenEmployeeProfile: false,
  current: null,
  history: [],
  total: 0,
  pageSize: 10,
  closed: false,
  payments: [],
  firstPaymentEnabled: true,
  defaultFineStage: 'salary',
  paymentWindows: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMonthlyEmployee).mockResolvedValue({ ok: true, value: view })
  vi.mocked(setMonthlyEmployee).mockResolvedValue({
    ok: true,
    value: { saved: 1 },
  })
})

it('can remove a payroll draft with the reason field blank', async () => {
  const user = userEvent.setup()
  const onRemoved = vi.fn()
  vi.mocked(deleteMonthlyEmployee).mockResolvedValue({
    ok: true,
    value: { saved: 1 },
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MonthlyRemoveDialog
        actorId="accountant"
        month="2026-11"
        employee={{ userId: 'worker', version: 1 }}
        open
        onClose={vi.fn()}
        onRemoved={onRemoved}
      />
    </QueryClientProvider>,
  )
  expect(screen.getByRole('textbox', { name: 'მიზეზი' })).not.toBeRequired()
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის ამოღება' }))
  await waitFor(() => expect(onRemoved).toHaveBeenCalledOnce())
  expect(deleteMonthlyEmployee).toHaveBeenCalledWith({
    data: expect.objectContaining({ reason: '', expectedVersion: 1 }),
  })
})

it('preserves edits across tabs and takes the user to the first invalid field', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MonthlyEntrySheet
        actorId="accountant"
        month="2026-11"
        userId="worker"
        employeeName="ანა"
        canEdit
        open
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
  const base = await screen.findByRole('textbox', {
    name: 'ხელფასი(თვე) ლარში',
  })
  expect(
    screen.getByRole('tab', { name: 'ხელფასი', selected: true }),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'ჩანაწერის დამატება' }),
  ).not.toBeInTheDocument()
  await user.clear(base)
  await user.type(base, '1250')
  await user.click(screen.getByRole('tab', { name: 'ბონუსები და ჯარიმები' }))
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის დამატება' }))
  await user.click(screen.getByRole('tab', { name: 'ისტორია' }))
  expect(
    within(screen.getByRole('tabpanel', { name: 'ისტორია' })).getByText(
      'ცვლილებები ჯერ არ არის',
    ),
  ).toBeVisible()
  const save = screen.getByRole('button', { name: 'ჩანაწერის შენახვა' })
  await user.click(save)
  expect(
    screen.getByRole('tab', { name: 'ბონუსები და ჯარიმები', selected: true }),
  ).toBeVisible()
  const bonus = screen.getByRole('textbox', { name: 'თანხა ლარში' })
  await waitFor(() => expect(bonus).toHaveFocus())
  expect(setMonthlyEmployee).not.toHaveBeenCalled()
  await user.type(bonus, '75')
  await user.click(screen.getByRole('tab', { name: 'ხელფასი' }))
  expect(base).toHaveValue('1250')
  await user.click(save)
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(setMonthlyEmployee).toHaveBeenCalledWith({
    data: expect.objectContaining({
      baseOverrideMinor: 125000,
      adjustments: [{ kind: 'bonus', amountMinor: 7500, reason: '' }],
    }),
  })
})

it('issues the selected employee’s remaining salary after changes are saved', async () => {
  const user = userEvent.setup()
  const month = '2026-11'
  const onClose = vi.fn()
  const dates = { start: '2026-11-25', end: '2026-11-29' }
  const firstPayment = {
    stage: 'first' as const,
    paidOn: dates.start,
    baseMinor: 75000,
    bonusMinor: 0,
    premiumMinor: 0,
    fineMinor: 0,
    totalMinor: 75000,
  }
  const initial: MonthlyDetail = {
    ...view,
    payments: [firstPayment],
    paymentWindows: [
      { stage: 'first', ...dates },
      { stage: 'salary', ...dates },
      { stage: 'adjustments', ...dates },
    ],
  }
  const token = 'b'.repeat(64)
  vi.mocked(getMonthlyEmployee).mockResolvedValue({ ok: true, value: initial })
  vi.mocked(getMonthlyPaymentPreview).mockResolvedValue({
    ok: true,
    value: {
      ...dates,
      token,
      available: true,
      paidOn: dates.start,
      policyVersion: 1,
      ready: [{ ...firstPayment, name: 'ანა' }],
      pending: [],
    },
  })
  vi.mocked(setMonthlyPayments).mockImplementationOnce(async () => {
    vi.mocked(getMonthlyEmployee).mockResolvedValue({
      ok: true,
      value: {
        ...initial,
        payments: [firstPayment, { ...firstPayment, stage: 'salary' }],
      },
    })
    return { ok: true, value: { saved: 1 } }
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MonthlyEntrySheet
        actorId="accountant"
        month={month}
        userId="worker"
        employeeName="ანა"
        canEdit
        open
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
  const issue = await screen.findByRole('button', { name: 'ხელფასის გაცემა' })
  expect(issue).toBeEnabled()
  const base = screen.getByRole('textbox', { name: 'ხელფასი(თვე) ლარში' })
  expect(base).toHaveValue('1500.00')
  await user.clear(base)
  await user.type(base, '1250')
  expect(issue).toBeDisabled()
  expect(getMonthlyPaymentPreview).not.toHaveBeenCalled()
  await user.clear(base)
  await user.type(base, '1500.00')
  await user.click(issue)
  const dialog = await screen.findByRole('dialog', { name: 'ხელფასის გაცემა' })
  expect(within(dialog).getByText('ხელფასის მეორე ნაწილი')).toBeVisible()
  expect(dialog).toHaveAccessibleDescription(/^ანა\s*·\s*ნოემბერი 2026/)
  const confirm = within(dialog).getByRole('button', {
    name: 'გაცემის დადასტურება',
  })
  await waitFor(() => expect(confirm).toBeEnabled())
  expect(getMonthlyPaymentPreview).toHaveBeenCalledWith({
    data: { month, stage: 'salary', userId: 'worker' },
  })
  await user.click(confirm)
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
  expect(setMonthlyPayments).toHaveBeenCalledWith({
    data: {
      month,
      stage: 'salary',
      userId: 'worker',
      expectedToken: token,
      requestId: expect.any(String),
    },
  })
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'ანა' })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'ხელფასის გაცემა' }),
  ).not.toBeInTheDocument()
})
