import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { EmploymentEditor } from './employment-editor'
import {
  updateEmployeeEmployment,
  discardEmployeeEmployment,
} from '../employment.functions'
import type { EmploymentDraft } from './employment-editor'

vi.mock('../employment.functions', () => ({
  updateEmployeeEmployment: vi.fn(),
  discardEmployeeEmployment: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// Date selection itself is exercised in the browser. Keep these tests focused on draft and mutation behavior.
vi.mock('#/components/common/date-picker', () => ({
  DatePicker: ({
    id,
    value,
    onChange,
    onBlur,
    invalid,
  }: {
    id: string
    value: string
    onChange: (value: string) => void
    onBlur: () => void
    invalid: boolean
  }) => (
    <input
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      aria-invalid={invalid}
    />
  ),
}))
const initial: EmploymentDraft = {
  key: 1,
  revision: 3,
  mode: 'edit',
  period: {
    id: '019a095c-7cc2-7000-8000-000000000001',
    startDate: '2026-01-01',
    endDate: null,
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateEmployeeEmployment).mockResolvedValue({
    ok: true,
    value: { revision: 4 },
  })
})
function mount(draft = initial) {
  const onClose = vi.fn(),
    onSaved = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EmploymentEditor
        open
        draft={draft}
        userId="employee"
        name="ტესტის თანამშრომელი"
        today="2026-11-25"
        onClose={onClose}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  )
  return { onClose, onSaved }
}
it('requires a reason, focuses the invalid field, then saves on the first valid click', async () => {
  const user = userEvent.setup(),
    callbacks = mount()
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(
    await screen.findByText('მიზეზი უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.'),
  ).toBeVisible()
  expect(updateEmployeeEmployment).not.toHaveBeenCalled()
  const reason = screen.getByRole('textbox', { name: /ცვლილების მიზეზი/ })
  await waitFor(() => expect(reason).toHaveFocus())
  await user.type(reason, 'ხელშეკრულებით დადასტურებულია')
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledTimes(1))
  expect(updateEmployeeEmployment).toHaveBeenCalledWith({
    data: {
      userId: 'employee',
      periodId: initial.period?.id,
      expectedRevision: 3,
      startDate: '2026-01-01',
      endDate: null,
      reason: 'ხელშეკრულებით დადასტურებულია',
    },
  })
  expect(callbacks.onClose).toHaveBeenCalledTimes(1)
})
it('preserves the complete draft after a revision conflict', async () => {
  vi.mocked(updateEmployeeEmployment).mockResolvedValue({
    ok: false,
    message: 'პერიოდები შეიცვალა. განაახლეთ გვერდი.',
  })
  const user = userEvent.setup(),
    callbacks = mount()
  await user.type(
    screen.getByRole('textbox', { name: /დასრულების თარიღი/ }),
    '2026-11-30',
  )
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების მიზეზი/ }),
    'დასაქმების დასრულება',
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(
    await screen.findByText('პერიოდები შეიცვალა. განაახლეთ გვერდი.'),
  ).toBeVisible()
  expect(
    screen.getByRole('textbox', { name: /დასრულების თარიღი/ }),
  ).toHaveValue('2026-11-30')
  expect(screen.getByRole('textbox', { name: /ცვლილების მიზეზი/ })).toHaveValue(
    'დასაქმების დასრულება',
  )
  expect(callbacks.onClose).not.toHaveBeenCalled()
})
it('blocks repeat submission and dismissal while saving', async () => {
  let finish!: (value: { ok: true; value: { revision: number } }) => void
  vi.mocked(updateEmployeeEmployment).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const user = userEvent.setup(),
    callbacks = mount()
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების მიზეზი/ }),
    'თარიღის დაზუსტება',
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(screen.getByRole('button', { name: 'შენახვა' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'დახურვა' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(callbacks.onClose).not.toHaveBeenCalled()
  finish({ ok: true, value: { revision: 4 } })
  await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce())
})
it('explains voiding and submits only the scoped period and reason', async () => {
  vi.mocked(discardEmployeeEmployment).mockResolvedValue({
    ok: true,
    value: { revision: 4 },
  })
  const user = userEvent.setup(),
    callbacks = mount({ ...initial, mode: 'void' })
  expect(
    screen.getByText(/ხელფასის გამოთვლისას აღარ გამოიყენება/),
  ).toBeVisible()
  expect(
    screen.queryByRole('textbox', { name: /დაწყების თარიღი/ }),
  ).not.toBeInTheDocument()
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების მიზეზი/ }),
    'შეცდომით მითითებული თარიღები',
  )
  await user.click(screen.getByRole('button', { name: 'პერიოდის გაუქმება' }))
  await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce())
  expect(discardEmployeeEmployment).toHaveBeenCalledWith({
    data: {
      userId: 'employee',
      periodId: initial.period?.id,
      expectedRevision: 3,
      reason: 'შეცდომით მითითებული თარიღები',
    },
  })
  expect(updateEmployeeEmployment).not.toHaveBeenCalled()
})
