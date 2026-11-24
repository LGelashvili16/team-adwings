import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { CalendarExceptionEditor } from './calendar-exception-editor'
import { updateCalendarException } from '../payroll-calendar.functions'
import type { CalendarDraft } from './calendar-exception-editor'

vi.mock('../payroll-calendar.functions', () => ({
  updateCalendarException: vi.fn(),
  getCalendarPeople: vi.fn(),
  getPayrollCalendar: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const draft: CalendarDraft = {
  key: 1,
  revision: 5,
  userId: null,
  scopeName: 'კომპანიის კალენდარი',
  day: {
    date: '2026-11-23',
    kind: 'day_off',
    source: 'holiday',
    statutoryHoliday: true,
    legalCalendarKnown: true,
    hours: null,
    employeeVersion: null,
    companyEffectiveFrom: '2026-01-01',
    timezone: 'Asia/Tbilisi',
    companyException: null,
    employeeException: null,
    leaves: [],
    leaveReview: false,
    holidayWorkReview: false,
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateCalendarException).mockResolvedValue({
    ok: true,
    value: { revision: 6 },
  })
})
function mount(value = draft) {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarExceptionEditor
        draft={value}
        actorId="accountant"
        open
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
  return onClose
}
it('explains holiday work, validates the required reason and saves on the first valid click', async () => {
  const user = userEvent.setup(),
    onClose = mount()
  expect(
    screen.getByText(/სამუშაო დღედ მითითება უქმის სტატუსს არ აუქმებს/),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(updateCalendarException).not.toHaveBeenCalled()
  const reason = screen.getByRole('textbox', { name: /ცვლილების საფუძველი/ })
  await waitFor(() => expect(reason).toHaveFocus())
  await user.type(reason, 'დადასტურებული დასვენების დღე')
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(updateCalendarException).toHaveBeenCalledWith({
    data: {
      userId: null,
      date: '2026-11-23',
      kind: 'day_off',
      hours: null,
      reason: 'დადასტურებული დასვენების დღე',
      expectedRevision: 5,
    },
  })
})
it('preserves working times, scope and revision after a failed save', async () => {
  vi.mocked(updateCalendarException).mockResolvedValue({
    ok: false,
    message: 'კალენდარი შეიცვალა. განაახლეთ მონაცემები.',
  })
  const user = userEvent.setup(),
    onClose = mount({ ...draft, userId: 'worker', scopeName: 'თანამშრომელი' })
  await user.click(screen.getByRole('combobox', { name: /წესი/ }))
  await user.click(await screen.findByRole('option', { name: 'სამუშაო დღე' }))
  expect(screen.getByLabelText(/დაწყების დრო/)).toHaveValue('09:00')
  expect(screen.getByLabelText(/დასრულების დრო/)).toHaveValue('18:00')
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების საფუძველი/ }),
    'ინდივიდუალური შეთანხმება',
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(
    await screen.findByText('კალენდარი შეიცვალა. განაახლეთ მონაცემები.'),
  ).toBeVisible()
  expect(screen.getByLabelText(/დასრულების დრო/)).toHaveValue('18:00')
  expect(
    screen.getByRole('textbox', { name: /ცვლილების საფუძველი/ }),
  ).toHaveValue('ინდივიდუალური შეთანხმება')
  expect(updateCalendarException).toHaveBeenCalledWith({
    data: expect.objectContaining({
      userId: 'worker',
      hours: { start: '09:00', end: '18:00' },
      expectedRevision: 5,
    }),
  })
  expect(onClose).not.toHaveBeenCalled()
})
it('prevents repeated submission and dismissal while preserving the shared Sheet lifecycle', async () => {
  let finish!: (value: { ok: true; value: { revision: number } }) => void
  vi.mocked(updateCalendarException).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const user = userEvent.setup(),
    onClose = mount()
  await user.type(
    screen.getByRole('textbox', { name: /ცვლილების საფუძველი/ }),
    'დადასტურებული ცვლილება',
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(screen.getByRole('button', { name: 'შენახვა' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'დახურვა' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(onClose).not.toHaveBeenCalled()
  finish({ ok: true, value: { revision: 6 } })
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
})
