import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { MonthlyEntryForm } from './monthly-entry-form'
import { setMonthlyEmployee } from '../monthly.functions'
import type { MonthlyEntry, MonthlySource } from '../monthly.types'

vi.mock('../monthly.functions', () => ({ setMonthlyEmployee: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const source: MonthlySource = {
  employeeName: 'ანა',
  sourceToken: 'a'.repeat(64),
  requiresBaseConfirmation: false,
  salary: {
    kind: 'hourly',
    amountMinor: 12345,
    amountBasis: 'gross',
    currency: 'GEL',
    effectiveFrom: '2026-01-01',
    version: 1,
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(setMonthlyEmployee).mockResolvedValue({
    ok: true,
    value: { saved: 1 },
  })
})
function mount(value = source, current: MonthlyEntry | null = null) {
  const saved = vi.fn(),
    pending = vi.fn(),
    client = new QueryClient()
  const node = (snapshot: MonthlySource) => (
    <QueryClientProvider client={client}>
      <MonthlyEntryForm
        actorId="accountant"
        month="2026-11"
        userId="worker"
        source={snapshot}
        current={current}
        baseNeedsReview={Boolean(current)}
        onSaved={saved}
        onPending={pending}
      />
    </QueryClientProvider>
  )
  return { ...render(node(value)), saved, pending, node }
}
it('prefills the corrected agreement in an unpaid partial month', async () => {
  const corrected: MonthlySource = {
    ...source,
    requiresBaseConfirmation: true,
    salary: {
      ...source.salary,
      kind: 'monthly',
      amountMinor: 70000,
      version: 2,
    },
  }
  const { saved } = mount(corrected, {
    userId: 'worker',
    employeeName: 'ანა',
    status: 'draft',
    version: 1,
    salary: { ...corrected.salary, version: 1, amountMinor: 50000 },
    manualBase: true,
    baseMinor: 50000,
    baseReason: '',
    workedSeconds: 0,
    firstPaymentMinor: null,
    fineStage: null,
    paymentDates: null,
    adjustments: [],
    bonusMinor: 0,
    premiumMinor: 0,
    fineMinor: 0,
    totalMinor: 50000,
    reason: '',
    actorName: 'ბუღალტერი',
    recordedAt: '2026-11-25T09:00:00Z',
  })
  expect(
    screen.getByRole('textbox', { name: /^ხელფასი\(თვე\) ლარში/ }),
  ).toHaveValue('700.00')
  expect(screen.getByText(/გადაამოწმეთ და შეინახეთ თვის ხელფასი/)).toBeVisible()
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'ჩანაწერის შენახვა' }))
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  expect(setMonthlyEmployee).toHaveBeenCalledWith({
    data: expect.objectContaining({
      expectedVersion: 1,
      baseOverrideMinor: 70000,
    }),
  })
})
it('saves without a general change reason', async () => {
  const user = userEvent.setup()
  const { saved } = mount()
  expect(
    screen.queryByRole('textbox', { name: /^ცვლილების მიზეზი/ }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის შენახვა' }))
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  expect(
    vi.mocked(setMonthlyEmployee).mock.calls[0]?.[0].data,
  ).not.toHaveProperty('reason')
})
it('saves exact confirmed hourly pay with simple bonus, premium and fine lines', async () => {
  const user = userEvent.setup(),
    { saved } = mount()
  await user.clear(
    screen.getByRole('textbox', { name: /^დადასტურებული საათები/ }),
  )
  await user.type(
    screen.getByRole('textbox', { name: /^დადასტურებული საათები/ }),
    '1.33',
  )
  for (let i = 0; i < 3; i++) {
    await user.click(screen.getByRole('button', { name: 'ჩანაწერის დამატება' }))
    if (i) {
      await user.click(screen.getAllByRole('combobox', { name: /^ტიპი/ })[i])
      await user.click(
        await screen.findByRole('option', {
          name: i === 1 ? 'პრემია' : 'ჯარიმა',
        }),
      )
    }
    await user.type(
      screen.getAllByRole('textbox', { name: /^თანხა ლარში/ })[i],
      ['10.01', '20.02', '3.03'][i],
    )
  }
  const fineReason = screen.getAllByRole('textbox', { name: 'შენიშვნა' })[2]
  expect(fineReason).toBeRequired()
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის შენახვა' }))
  expect(
    await screen.findByText(
      'ჯარიმის შენიშვნა უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.',
    ),
  ).toBeVisible()
  expect(setMonthlyEmployee).not.toHaveBeenCalled()
  await user.type(fineReason, 'დადასტურებული საფუძველი')
  expect(screen.getByText('191,19 ₾')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის შენახვა' }))
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  expect(setMonthlyEmployee).toHaveBeenCalledWith({
    data: expect.objectContaining({
      workedSeconds: 4788,
      baseOverrideMinor: null,
      sourceToken: source.sourceToken,
      adjustments: [
        expect.objectContaining({
          kind: 'bonus',
          amountMinor: 1001,
          reason: '',
        }),
        expect.objectContaining({
          kind: 'premium',
          amountMinor: 2002,
          reason: '',
        }),
        expect.objectContaining({ kind: 'fine', amountMinor: 303 }),
      ],
    }),
  })
})
it('keeps failed drafts and their source revision after a background refresh', async () => {
  vi.mocked(setMonthlyEmployee).mockResolvedValue({
    ok: false,
    message: 'ტარიფი შეიცვალა. ხელახლა გახსენით ჩანაწერი.',
  })
  const user = userEvent.setup(),
    result = mount()
  const hours = screen.getByRole('textbox', { name: /^დადასტურებული საათები/ })
  await user.clear(hours)
  await user.type(hours, '2.5')
  result.rerender(
    result.node({
      ...source,
      sourceToken: 'b'.repeat(64),
      salary: { ...source.salary, amountMinor: 99999 },
    }),
  )
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის შენახვა' }))
  expect(
    await screen.findByText('ტარიფი შეიცვალა. ხელახლა გახსენით ჩანაწერი.'),
  ).toBeVisible()
  expect(hours).toHaveValue('2.5')
  expect(setMonthlyEmployee).toHaveBeenCalledWith({
    data: expect.objectContaining({ sourceToken: source.sourceToken }),
  })
  expect(result.saved).not.toHaveBeenCalled()
})
it('prefills the editable fixed base for a partial month and requires an amount on save', async () => {
  const user = userEvent.setup()
  mount({
    ...source,
    requiresBaseConfirmation: true,
    salary: { ...source.salary, kind: 'monthly', amountMinor: 300000 },
  })
  expect(
    screen.getByRole('switch', { name: 'თვის ხელფასის დადასტურება' }),
  ).toBeChecked()
  expect(
    screen.getByRole('switch', { name: 'თვის ხელფასის დადასტურება' }),
  ).toHaveAttribute('aria-disabled', 'true')
  const base = screen.getByRole('textbox', { name: 'ხელფასი(თვე) ლარში' })
  expect(base).toHaveValue('3000.00')
  expect(setMonthlyEmployee).not.toHaveBeenCalled()
  await user.clear(base)
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის შენახვა' }))
  expect(setMonthlyEmployee).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('textbox', { name: /^თვის ხელფასის საფუძველი/ }),
  ).not.toBeInTheDocument()
  await user.type(base, '500')
  await user.click(screen.getByRole('button', { name: 'ჩანაწერის შენახვა' }))
  await waitFor(() => expect(setMonthlyEmployee).toHaveBeenCalledOnce())
  expect(setMonthlyEmployee).toHaveBeenCalledWith({
    data: expect.objectContaining({ baseOverrideMinor: 50000 }),
  })
})
