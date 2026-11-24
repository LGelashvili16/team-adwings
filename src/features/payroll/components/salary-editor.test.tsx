import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { SalaryEditor } from './salary-editor'
import { setSalaryTerms } from '../salary.functions'
import type { SalaryEmployee } from '../salary.types'

vi.mock('../salary.functions', () => ({ setSalaryTerms: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const targets: SalaryEmployee[] = [
  {
    userId: 'worker',
    name: 'ტესტის თანამშრომელი',
    username: 'worker',
    jobTitle: null,
    status: 'active',
    version: 2,
    current: null,
    next: null,
  },
  {
    userId: 'other',
    name: 'მეორე თანამშრომელი',
    username: null,
    jobTitle: null,
    status: 'active',
    version: 4,
    current: null,
    next: null,
  },
]
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(setSalaryTerms).mockResolvedValue({ ok: true, value: { saved: 2 } })
})
function mount() {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SalaryEditor
        actorId="accountant"
        targets={targets}
        today="2026-11-25"
        open
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
  return onClose
}
it('requires valid money and a reason, then saves exact bulk terms on the first valid click', async () => {
  const user = userEvent.setup(),
    onClose = mount()
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(setSalaryTerms).not.toHaveBeenCalled()
  const amount = screen.getByRole('textbox', { name: /თანხა ლარში/ })
  await waitFor(() => expect(amount).toHaveFocus())
  await user.type(amount, '2400,29')
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების მიზეზი/ }),
    'ხელშეკრულებით დადასტურებული თანხა',
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(setSalaryTerms).toHaveBeenCalledWith({
    data: {
      targets: [
        { userId: 'worker', expectedVersion: 2 },
        { userId: 'other', expectedVersion: 4 },
      ],
      effectiveFrom: '2026-11-25',
      kind: 'monthly',
      amountBasis: 'gross',
      currency: 'GEL',
      amountMinor: 240029,
      reason: 'ხელშეკრულებით დადასტურებული თანხა',
    },
  })
})
it('retains the complete draft and target revisions on a conflict', async () => {
  vi.mocked(setSalaryTerms).mockResolvedValue({
    ok: false,
    message: 'ხელფასი შეიცვალა. განაახლეთ მონაცემები.',
  })
  const user = userEvent.setup(),
    onClose = mount()
  await user.click(screen.getByRole('combobox', { name: /ხელფასის ტიპი/ }))
  await user.click(await screen.findByRole('option', { name: 'საათობრივი' }))
  await user.type(screen.getByRole('textbox', { name: /თანხა ლარში/ }), '15.25')
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების მიზეზი/ }),
    'საათობრივი შეთანხმება',
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(
    await screen.findByText('ხელფასი შეიცვალა. განაახლეთ მონაცემები.'),
  ).toBeVisible()
  expect(screen.getByRole('textbox', { name: /თანხა ლარში/ })).toHaveValue(
    '15.25',
  )
  expect(
    screen.getByRole('combobox', { name: /ხელფასის ტიპი/ }),
  ).toHaveTextContent('საათობრივი')
  expect(onClose).not.toHaveBeenCalled()
})
it('prevents dismissal and repeated saves while the mutation is pending', async () => {
  let finish!: (value: { ok: true; value: { saved: number } }) => void
  vi.mocked(setSalaryTerms).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const user = userEvent.setup(),
    onClose = mount()
  await user.type(screen.getByRole('textbox', { name: /თანხა ლარში/ }), '1200')
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების მიზეზი/ }),
    'ხელშეკრულების საფუძველზე',
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(screen.getByRole('button', { name: 'შენახვა' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'დახურვა' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(onClose).not.toHaveBeenCalled()
  finish({ ok: true, value: { saved: 2 } })
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
})
