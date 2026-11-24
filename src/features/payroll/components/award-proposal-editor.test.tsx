import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { AwardProposalEditor } from './award-proposal-editor'
import { getAwardChoices, setAwardProposal } from '../award-proposals.functions'
import type { BonusRuleVersion } from '../bonus-rules.types'

const rule: BonusRuleVersion = {
  version: 1,
  name: 'მეტრის ბონუსი',
  kind: 'bonus',
  calculation: 'additional_work',
  unitLabel: 'მეტრი',
  qualification: 'მიღების აქტით დადასტურებული შესრულება',
  amountMinor: 100,
  amountBasis: 'gross',
  currency: 'GEL',
  enabled: true,
  effectiveFrom: '2026-11-01',
}
vi.mock('../award-proposals.functions', () => ({
  getAwardChoices: vi.fn(),
  setAwardProposal: vi.fn(),
  getAwardProposal: vi.fn(),
  getAwardProposals: vi.fn(),
  cancelAwardProposal: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAwardChoices).mockImplementation(async (input) => ({
    ok: true,
    value: {
      records:
        input.data.kind === 'employee'
          ? [
              {
                id: 'worker',
                label: 'გიორგი',
                description: '@giorgi',
                rule: null,
              },
            ]
          : input.data.kind === 'rule'
            ? [
                {
                  id: '019ab984-7000-7000-8000-000000000001',
                  label: rule.name,
                  description: 'მეტრი',
                  rule,
                },
              ]
            : [],
      total: 1,
      pageSize: 20,
    },
  }))
  vi.mocked(setAwardProposal).mockResolvedValue({
    ok: true,
    value: { proposalId: '019ab984-7000-7000-8000-000000000002', version: 1 },
  })
})
function mount() {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AwardProposalEditor
        actorId="accountant"
        existing={null}
        today="2026-11-25"
        open
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
  return onClose
}
it('submits picker searches without submitting or validating the enclosing proposal', async () => {
  const user = userEvent.setup()
  mount()
  await user.click(screen.getByRole('button', { name: /^თანამშრომელი/ }))
  await user.type(
    screen.getByRole('textbox', { name: 'თანამშრომელი: ძიება' }),
    'გიორგი{Enter}',
  )
  expect(setAwardProposal).not.toHaveBeenCalled()
  expect(document.getElementById('award-person')).toHaveAttribute(
    'aria-invalid',
    'false',
  )
})
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^თანამშრომელი/ }))
  await user.click(await screen.findByRole('button', { name: /გიორგი/ }))
  await user.click(screen.getByRole('button', { name: /^წახალისების წესი/ }))
  await user.click(await screen.findByRole('button', { name: /მეტრის ბონუსი/ }))
  await user.type(
    screen.getByRole('textbox', { name: /წყაროს ნომერი/ }),
    'ACT-001',
  )
  const quantity = screen.getByRole('textbox', { name: /მიღებული რაოდენობა/ })
  await user.clear(quantity)
  await user.type(quantity, '1,005')
  await user.type(
    screen.getByRole('textbox', { name: /შესრულების მტკიცებულება/ }),
    'მიღების აქტით დადასტურებული შედეგი',
  )
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების საფუძველი/ }),
    'განაცხადის მომზადების საფუძველი',
  )
}
it('focuses the first invalid control and saves an individual proposal with exact quantity and selected rule version', async () => {
  const user = userEvent.setup(),
    onClose = mount()
  await user.click(screen.getByRole('button', { name: 'განაცხადის შენახვა' }))
  expect(setAwardProposal).not.toHaveBeenCalled()
  await waitFor(() =>
    expect(document.getElementById('award-person')).toHaveFocus(),
  )
  await fill(user)
  expect(screen.getByText('1,01 ₾')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'განაცხადის შენახვა' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(setAwardProposal).toHaveBeenCalledWith({
    data: expect.objectContaining({
      userId: 'worker',
      quantityMilli: 1005,
      expectedRuleVersion: 1,
      proposalId: null,
      expectedVersion: 0,
      reference: 'ACT-001',
      requestId: expect.any(String),
    }),
  })
})
it('keeps failed evidence/quantity drafts and reuses the same command identity for retries', async () => {
  vi.mocked(setAwardProposal).mockResolvedValueOnce({
    ok: false,
    message: 'წესი შეიცვალა. ხელახლა აირჩიეთ წესი.',
  })
  const user = userEvent.setup(),
    onClose = mount()
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'განაცხადის შენახვა' }))
  expect(
    await screen.findByText('წესი შეიცვალა. ხელახლა აირჩიეთ წესი.'),
  ).toBeVisible()
  expect(
    screen.getByRole('textbox', { name: /მიღებული რაოდენობა/ }),
  ).toHaveValue('1,005')
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'განაცხადის შენახვა' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(vi.mocked(setAwardProposal).mock.calls[0][0]).toEqual(
    vi.mocked(setAwardProposal).mock.calls[1][0],
  )
})
it('blocks dismissal and repeated submission during a pending save', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof setAwardProposal>>) => void
  vi.mocked(setAwardProposal).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const user = userEvent.setup(),
    onClose = mount()
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'განაცხადის შენახვა' }))
  expect(
    screen.getByRole('button', { name: 'განაცხადის შენახვა' }),
  ).toBeDisabled()
  expect(screen.getByRole('button', { name: 'დახურვა' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(onClose).not.toHaveBeenCalled()
  expect(setAwardProposal).toHaveBeenCalledOnce()
  resolve({
    ok: true,
    value: { proposalId: '019ab984-7000-7000-8000-000000000002', version: 1 },
  })
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
})
