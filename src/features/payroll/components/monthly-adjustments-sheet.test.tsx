import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { MonthlyAdjustmentsSheet } from './monthly-adjustments-sheet'
import {
  getMonthlyEmployee,
  getMonthlyEmployees,
  setMonthlyAdjustments,
} from '../monthly.functions'

vi.mock('../monthly.functions', () => ({
  getMonthlyEmployee: vi.fn(),
  getMonthlyEmployees: vi.fn(),
  setMonthlyAdjustments: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

it('saves a premium and fine together without any base-pay fields', async () => {
  vi.mocked(getMonthlyEmployees).mockResolvedValue({
    ok: true,
    value: {
      records: [{ id: 'worker', label: 'გიორგი', description: '' }],
      total: 1,
      pageSize: 20,
    },
  })
  vi.mocked(getMonthlyEmployee).mockResolvedValue({
    ok: true,
    value: {
      timezone: 'Asia/Tbilisi',
      source: null,
      sourceMessage: 'ხელფასი არ არის განსაზღვრული.',
      salaryMissing: true,
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
      paymentWindows: [
        { stage: 'adjustments', start: '2026-12-15', end: '2026-12-20' },
        { stage: 'salary', start: '2026-12-10', end: '2026-12-15' },
      ],
    },
  })
  vi.mocked(setMonthlyAdjustments).mockResolvedValue({
    ok: true,
    value: { saved: 1 },
  })
  const user = userEvent.setup()
  const close = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MonthlyAdjustmentsSheet
        actorId="accountant"
        month="2026-11"
        initialEmployee={null}
        canEdit
        open
        onClose={close}
      />
    </QueryClientProvider>,
  )

  await user.click(await screen.findByRole('button', { name: /^თანამშრომელი/ }))
  await user.click(await screen.findByRole('button', { name: 'გიორგი' }))
  await user.click(await screen.findByRole('combobox', { name: /^ტიპი/ }))
  await user.click(await screen.findByRole('option', { name: 'პრემია' }))
  await user.click(screen.getByRole('button', { name: 'გაცემის თარიღი' }))
  await user.click(
    await screen.findByRole('button', { name: /18 დეკემბერი 2026/ }),
  )
  expect(screen.queryByText('ხელფასი(თვე) ლარში')).not.toBeInTheDocument()
  await user.type(
    screen.getByRole('textbox', { name: /^თანხა ლარში/ }),
    '100.50',
  )
  expect(screen.getByRole('textbox', { name: 'შენიშვნა' })).not.toBeRequired()
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის დამატება' }))
  await user.click(screen.getAllByRole('combobox', { name: /^ტიპი/ })[1])
  await user.click(await screen.findByRole('option', { name: 'ჯარიმა' }))
  await user.click(
    screen.getByRole('button', { name: 'ჯარიმის დაქვითვის თარიღი' }),
  )
  await user.click(
    await screen.findByRole('button', { name: /12 დეკემბერი 2026/ }),
  )
  await user.type(
    screen.getAllByRole('textbox', { name: /^თანხა ლარში/ })[1],
    '20',
  )
  await user.type(
    screen.getAllByRole('textbox', { name: 'შენიშვნა' })[1],
    'დადასტურებული საფუძველი',
  )
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის შენახვა' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(setMonthlyAdjustments).toHaveBeenCalledWith({
    data: {
      month: '2026-11',
      userId: 'worker',
      expectedVersion: 0,
      fineStage: null,
      paymentDates: { adjustments: '2026-12-18', salary: '2026-12-12' },
      requestId: expect.any(String),
      adjustments: [
        { kind: 'premium', amountMinor: 10050, reason: '' },
        { kind: 'fine', amountMinor: 2000, reason: 'დადასტურებული საფუძველი' },
      ],
    },
  })
}, 10000)
