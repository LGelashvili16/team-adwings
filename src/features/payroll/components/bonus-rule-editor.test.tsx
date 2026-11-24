import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { BonusRuleEditor } from './bonus-rule-editor'
import { updateBonusRule } from '../bonus-rules.functions'

vi.mock('../bonus-rules.functions', () => ({
  updateBonusRule: vi.fn(),
  getBonusRule: vi.fn(),
  getBonusRules: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateBonusRule).mockResolvedValue({
    ok: true,
    value: { ruleId: '019ab984-7000-7000-8000-000000000001', version: 1 },
  })
})
function mount() {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BonusRuleEditor
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
  await user.type(
    screen.getByRole('textbox', { name: /დასახელება/ }),
    'განსაკუთრებული შესრულება',
  )
  await user.type(
    screen.getByRole('textbox', { name: /თანხა ლარში/ }),
    '123,45',
  )
  await user.type(
    screen.getByRole('textbox', { name: /მინიჭების პირობა/ }),
    'დადასტურებული დამატებითი შედეგი',
  )
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების საფუძველი/ }),
    'დირექტორის დადასტურებული გადაწყვეტილება',
  )
}
it('validates required fields, focuses the first error and saves exact money on the first valid click', async () => {
  const user = userEvent.setup(),
    onClose = mount()
  await user.click(screen.getByRole('button', { name: 'წესის შენახვა' }))
  expect(updateBonusRule).not.toHaveBeenCalled()
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: /დასახელება/ })).toHaveFocus(),
  )
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'წესის შენახვა' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(updateBonusRule).toHaveBeenCalledWith({
    data: expect.objectContaining({
      ruleId: null,
      expectedVersion: 0,
      requestId: expect.any(String),
      amountMinor: 12345,
      currency: 'GEL',
      calculation: 'fixed',
    }),
  })
})
it('requires extra-work units and restricts premiums to fixed awards', async () => {
  const user = userEvent.setup()
  mount()
  await fill(user)
  await user.click(screen.getByRole('combobox', { name: /გამოთვლის წესი/ }))
  await user.click(
    await screen.findByRole('option', { name: 'დამატებითი სამუშაოს მიხედვით' }),
  )
  await user.click(screen.getByRole('button', { name: 'წესის შენახვა' }))
  expect(updateBonusRule).not.toHaveBeenCalled()
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: /დამატებითი სამუშაოს ერთეული/ }),
    ).toHaveFocus(),
  )
  await user.type(
    screen.getByRole('textbox', { name: /დამატებითი სამუშაოს ერთეული/ }),
    'საათი',
  )
  await user.click(screen.getByRole('combobox', { name: /წახალისების ტიპი/ }))
  await user.click(await screen.findByRole('option', { name: /^პრემია$/ }))
  expect(
    screen.queryByRole('textbox', { name: /დამატებითი სამუშაოს ერთეული/ }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'წესის შენახვა' }))
  await waitFor(() =>
    expect(updateBonusRule).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'premium',
        calculation: 'fixed',
        unitLabel: '',
      }),
    }),
  )
})
it('retains failed drafts and command identity across a safe retry', async () => {
  vi.mocked(updateBonusRule).mockResolvedValueOnce({
    ok: false,
    message: 'წესი შეიცვალა. განაახლეთ მონაცემები.',
  })
  const user = userEvent.setup(),
    onClose = mount()
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'წესის შენახვა' }))
  expect(
    await screen.findByText('წესი შეიცვალა. განაახლეთ მონაცემები.'),
  ).toBeVisible()
  expect(screen.getByRole('textbox', { name: /თანხა ლარში/ })).toHaveValue(
    '123,45',
  )
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'წესის შენახვა' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  const calls = vi.mocked(updateBonusRule).mock.calls
  expect(calls[0][0]).toEqual(calls[1][0])
})
it('prevents repeated submission and dismissal while the save is pending', async () => {
  let resolve!: (result: Awaited<ReturnType<typeof updateBonusRule>>) => void
  vi.mocked(updateBonusRule).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const user = userEvent.setup(),
    onClose = mount()
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'წესის შენახვა' }))
  expect(screen.getByRole('button', { name: 'წესის შენახვა' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'დახურვა' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'გაუქმება' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(onClose).not.toHaveBeenCalled()
  expect(updateBonusRule).toHaveBeenCalledOnce()
  resolve({
    ok: true,
    value: { ruleId: '019ab984-7000-7000-8000-000000000001', version: 1 },
  })
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
})
