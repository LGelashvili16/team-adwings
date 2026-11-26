import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { MonthlyPaymentDialog } from './monthly-payment-dialog'
import {
  getMonthlyPaymentPreview,
  setMonthlyPayments,
} from '../monthly.functions'

vi.mock('../monthly.functions', () => ({
  getMonthlyPaymentPreview: vi.fn(),
  setMonthlyPayments: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

it('confirms the exact preview for ready employees and explains who is pending', async () => {
  const user = userEvent.setup()
  const close = vi.fn()
  const month = '2026-11'
  const token = 'a'.repeat(64)
  const dates = { start: '2026-11-25', end: '2026-11-29' }
  vi.mocked(getMonthlyPaymentPreview).mockResolvedValue({
    ok: true,
    value: {
      ...dates,
      token,
      available: true,
      paidOn: '2026-11-25',
      policyVersion: 1,
      ready: [
        {
          name: 'ანა',
          baseMinor: 50000,
          bonusMinor: 0,
          premiumMinor: 0,
          fineMinor: 0,
          totalMinor: 50000,
        },
      ],
      pending: [{ name: 'ბექა', message: 'დაადასტურეთ სამუშაო საათები.' }],
    },
  })
  vi.mocked(setMonthlyPayments).mockResolvedValue({
    ok: true,
    value: { saved: 1 },
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MonthlyPaymentDialog
        actorId="accountant"
        month={month}
        windows={[{ stage: 'first', ...dates }]}
        open
        onClose={close}
      />
    </QueryClientProvider>,
  )
  expect(await screen.findByText('ანა')).toBeVisible()
  const warnings = screen.getByRole('button', {
    name: 'გადასამოწმებელია 1 თანამშრომელი',
  })
  expect(warnings).toHaveAttribute('aria-expanded', 'false')
  expect(
    screen.queryByRole('list', { name: 'გადასამოწმებელი თანამშრომლები' }),
  ).not.toBeInTheDocument()
  warnings.focus()
  await user.keyboard('{Enter}')
  expect(warnings).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('ბექა')).toBeVisible()
  expect(screen.getByText('დაადასტურეთ სამუშაო საათები.')).toBeVisible()
  await user.keyboard(' ')
  expect(warnings).toHaveAttribute('aria-expanded', 'false')
  expect(setMonthlyPayments).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'გაცემის დადასტურება' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(setMonthlyPayments).toHaveBeenCalledWith({
    data: {
      month,
      stage: 'first',
      expectedToken: token,
      requestId: expect.any(String),
    },
  })
})
