import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { AwardPoolEditor } from './award-pool-editor'
import { getAwardChoices } from '../award-proposals.functions'
import { setAwardPool } from '../award-pools.functions'
import type { BonusRuleVersion } from '../bonus-rules.types'

const rule: BonusRuleVersion = {
  version: 3,
  name: 'მეტრის ბონუსი',
  kind: 'bonus',
  calculation: 'additional_work',
  unitLabel: 'მეტრი',
  qualification: 'დადასტურებული შესრულება',
  amountMinor: 101,
  amountBasis: 'gross',
  currency: 'GEL',
  enabled: true,
  effectiveFrom: '2026-11-01',
}
vi.mock('../award-proposals.functions', () => ({
  getAwardChoices: vi.fn(),
  getAwardProposal: vi.fn(),
  getAwardProposals: vi.fn(),
}))
vi.mock('../award-pools.functions', () => ({ setAwardPool: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAwardChoices).mockImplementation(async (input) => ({
    ok: true,
    value: {
      records:
        input.data.kind === 'employee'
          ? [
              { id: 'worker-a', label: 'გიორგი', description: '', rule: null },
              { id: 'worker-b', label: 'ნინო', description: '', rule: null },
            ]
          : [
              {
                id: '019ab984-7000-7000-8000-000000000001',
                label: rule.name,
                description: '',
                rule,
              },
            ],
      total: 2,
      pageSize: 20,
    },
  }))
  vi.mocked(setAwardPool).mockResolvedValue({
    ok: true,
    value: { poolId: '019ab984-7000-7000-8000-000000000002', version: 1 },
  })
})
function mount() {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AwardPoolEditor
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
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^წახალისების წესი/ }))
  await user.click(await screen.findByRole('button', { name: /მეტრის ბონუსი/ }))
  for (const name of ['გიორგი', 'ნინო']) {
    await user.click(
      screen.getByRole('button', { name: /^ბენეფიციარები და წილები/ }),
    )
    await user.click(await screen.findByRole('button', { name }))
  }
  await user.click(screen.getByRole('button', { name: 'თანაბრად განაწილება' }))
  await user.type(
    screen.getByRole('textbox', { name: /წყაროს ნომერი/ }),
    'POOL-001',
  )
  await user.type(
    screen.getByRole('textbox', { name: /შესრულების მტკიცებულება/ }),
    'მიღების აქტით დადასტურებული შედეგი',
  )
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების საფუძველი/ }),
    'საერთო ფონდის მომზადების საფუძველი',
  )
}
it('submits the selected tariff on first save and preserves every tetri in equal shares', async () => {
  const user = userEvent.setup(),
    onClose = mount()
  await fill(user)
  expect(
    screen.getByRole('textbox', { name: 'გიორგი თანხა ლარში' }),
  ).toHaveValue('0.51')
  expect(screen.getByRole('textbox', { name: 'ნინო თანხა ლარში' })).toHaveValue(
    '0.50',
  )
  await user.click(screen.getByRole('button', { name: 'ფონდის შენახვა' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(setAwardPool).toHaveBeenCalledWith({
    data: expect.objectContaining({
      expectedRuleVersion: 3,
      quantityMilli: 1000,
      allocations: [
        { userId: 'worker-a', amountMinor: 51 },
        { userId: 'worker-b', amountMinor: 50 },
      ],
    }),
  })
})
it('blocks unbalanced shares and keeps a failed save draft available for correction', async () => {
  vi.mocked(setAwardPool).mockResolvedValueOnce({
    ok: false,
    message: 'წყარო შეიცვალა. ხელახლა მოამზადეთ ფონდი.',
  })
  const user = userEvent.setup(),
    onClose = mount()
  await fill(user)
  const amount = screen.getByRole('textbox', { name: 'გიორგი თანხა ლარში' })
  await user.clear(amount)
  await user.type(amount, '0.52')
  await user.click(screen.getByRole('button', { name: 'ფონდის შენახვა' }))
  expect(setAwardPool).not.toHaveBeenCalled()
  expect(
    screen.getByText('წილების ჯამი ფონდის თანხას ზუსტად უნდა უდრიდეს.'),
  ).toBeVisible()
  await user.clear(amount)
  await user.type(amount, '0.51')
  await user.click(screen.getByRole('button', { name: 'ფონდის შენახვა' }))
  expect(
    await screen.findByText('წყარო შეიცვალა. ხელახლა მოამზადეთ ფონდი.'),
  ).toBeVisible()
  expect(amount).toHaveValue('0.51')
  expect(onClose).not.toHaveBeenCalled()
})
