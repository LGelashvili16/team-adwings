import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { getMonthlyEmployee, setMonthlyEmployee } from '../monthly.functions'
import type { MonthlyDetail } from '../monthly.types'
import { MonthlyEntrySheet } from './monthly-entry-sheet'

vi.mock('../monthly.functions', () => ({
  getMonthlyEmployee: vi.fn(),
  setMonthlyEmployee: vi.fn(),
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
