import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { AwardReviewDialog } from './award-review-dialog'
import { reviewAwardPool } from '../award-pools.functions'

vi.mock('../award-proposals.functions', () => ({
  getAwardChoices: vi.fn(),
  getAwardProposal: vi.fn(),
  getAwardProposals: vi.fn(),
  decideAwardProposal: vi.fn(),
}))
vi.mock('../award-pools.functions', () => ({
  reviewAwardPool: vi.fn(),
  cancelAwardPool: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
it('requires independent verification, retains the target revision and prevents dismissal while saving', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof reviewAwardPool>>) => void
  vi.mocked(reviewAwardPool).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const user = userEvent.setup(),
    onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AwardReviewDialog
        actorId="reviewer"
        target={{
          kind: 'pool',
          id: 'pool-a',
          version: 4,
          label: 'საერთო წახალისება',
        }}
        decision="approved"
        open
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'დამტკიცება' }))
  expect(reviewAwardPool).not.toHaveBeenCalled()
  await user.click(screen.getByRole('checkbox'))
  await user.type(
    screen.getByRole('textbox', { name: /გადაწყვეტილების საფუძველი/ }),
    'გადამოწმებულია მიღების აქტი ACT-001',
  )
  await user.click(screen.getByRole('button', { name: 'დამტკიცება' }))
  await waitFor(() => expect(reviewAwardPool).toHaveBeenCalledOnce())
  expect(reviewAwardPool).toHaveBeenCalledWith({
    data: expect.objectContaining({
      poolId: 'pool-a',
      expectedVersion: 4,
      evidenceVerified: true,
      decision: 'approved',
    }),
  })
  expect(screen.getByRole('button', { name: 'დამტკიცება' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(onClose).not.toHaveBeenCalled()
  resolve({ ok: true, value: { poolId: 'pool-a', version: 5 } })
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
})
