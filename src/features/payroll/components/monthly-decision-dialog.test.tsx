import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { MonthlyDecisionDialog } from './monthly-decision-dialog'
import { setMonthlyDecision } from '../monthly.functions'

vi.mock('../monthly.functions', () => ({
  setMonthlyDecision: vi.fn(),
  deleteMonthlyEmployee: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
it('requires a reason and retains the reviewed month token during finalization', async () => {
  vi.mocked(setMonthlyDecision).mockResolvedValue({
    ok: true,
    value: { saved: 2 },
  })
  const user = userEvent.setup(),
    close = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MonthlyDecisionDialog
        actorId="accountant"
        month="2026-11"
        token={'a'.repeat(64)}
        closed={false}
        open
        onClose={close}
      />
    </QueryClientProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'თვის დასრულება' }))
  expect(setMonthlyDecision).not.toHaveBeenCalled()
  await user.type(
    screen.getByRole('textbox', { name: /^მიზეზი/ }),
    'ნოემბრის ყველა თანხა გადამოწმებულია',
  )
  await user.click(screen.getByRole('button', { name: 'თვის დასრულება' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(setMonthlyDecision).toHaveBeenCalledWith({
    data: expect.objectContaining({
      month: '2026-11',
      expectedToken: 'a'.repeat(64),
      action: 'finalize',
    }),
  })
})
