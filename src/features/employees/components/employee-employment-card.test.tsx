import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { EmployeeEmploymentCard } from './employee-employment-card'
import { getEmployeeEmployment } from '../employment.functions'
import type { EmploymentView } from '../employment.types'
import type { Actor } from '#/lib/authorization/actor'

vi.mock('../employment.functions', () => ({ getEmployeeEmployment: vi.fn() }))
vi.mock('./employment-editor', () => ({ EmploymentEditor: () => null }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    search,
    children,
    'aria-label': label,
  }: {
    search: Record<string, number>
    children: React.ReactNode
    'aria-label'?: string
  }) => (
    <a
      aria-label={label}
      href={`?${new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]))}`}
    >
      {children}
    </a>
  ),
}))
const actor: Actor = {
  id: 'hr',
  name: 'HR',
  email: null,
  emailVerified: false,
  roles: ['hr_manager'],
}
const initial: EmploymentView = {
  revision: 0,
  today: '2026-11-25',
  timezone: 'Asia/Tbilisi',
  confirmed: false,
  periods: [],
  periodTotal: 0,
  history: [],
  historyTotal: 0,
  pageSize: 5,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getEmployeeEmployment).mockResolvedValue({
    ok: true,
    value: initial,
  })
})
function mount(current = actor, employmentPage = 1) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <EmployeeEmploymentCard
        actor={current}
        userId="worker"
        name="თანამშრომელი"
        employmentPage={employmentPage}
        employmentHistoryPage={2}
      />
    </QueryClientProvider>,
  )
}
it('shows honest unknown dates and scopes the server read to both validated pages', async () => {
  mount()
  expect(await screen.findByText('თარიღები დასაზუსტებელია')).toBeVisible()
  expect(screen.getByText(/ანგარიშის შექმნის თარიღი/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'დამატება' })).toBeVisible()
  expect(getEmployeeEmployment).toHaveBeenCalledWith({
    data: { userId: 'worker', employmentPage: 1, employmentHistoryPage: 2 },
  })
})
it('hides edits on the actor’s own profile even for an owner', async () => {
  mount({ ...actor, id: 'worker', roles: ['owner'] })
  await screen.findByText('თარიღები დასაზუსტებელია')
  expect(
    screen.queryByRole('button', { name: 'დამატება' }),
  ).not.toBeInTheDocument()
})
it('shows confirmed dates, scoped pagination and attributed history', async () => {
  vi.mocked(getEmployeeEmployment).mockResolvedValue({
    ok: true,
    value: {
      ...initial,
      confirmed: true,
      revision: 1,
      periodTotal: 6,
      periods: [
        { id: 'period', startDate: '2026-01-15', endDate: '2026-01-31' },
      ],
      historyTotal: 1,
      history: [
        {
          id: 'audit',
          action: 'created',
          before: null,
          after: {
            startDate: '2026-01-15',
            endDate: '2026-01-31',
            voided: false,
          },
          actorName: 'დადასტურების ავტორი',
          reason: 'დადასტურებულია ხელშეკრულებით',
          createdAt: '2026-11-25T10:00:00Z',
        },
      ],
    },
  })
  const user = userEvent.setup()
  mount(actor, 2)
  expect(await screen.findByText('დასრულებული')).toBeVisible()
  expect(screen.getAllByRole('link', { name: 'გვერდი 1' })[0]).toHaveAttribute(
    'href',
    '?employmentPage=1&employmentHistoryPage=2',
  )
  expect(screen.getByText('დადასტურების ავტორი')).toBeVisible()
  await user.click(screen.getByRole('button', { name: /ცვლილებების ისტორია/ }))
  expect(screen.queryByText('ანგარიშის შექმნის თარიღი')).not.toBeInTheDocument()
})
