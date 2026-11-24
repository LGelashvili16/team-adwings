import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { SalaryWorkspace } from './salary-workspace-page'
import { getMySalary, getEmployeeSalary } from '../salary.functions'
import type { Actor } from '#/lib/authorization/actor'
import type { SalaryDetail } from '../salary.types'

vi.mock('../salary.functions', () => ({
  getMySalary: vi.fn(),
  getEmployeeSalary: vi.fn(),
}))
vi.mock('../components/salary-editor', () => ({ SalaryEditor: () => null }))
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/manage/payroll">{children}</a>
  ),
}))
const actor: Actor = {
  id: 'worker',
  name: 'თანამშრომელი',
  email: null,
  emailVerified: false,
  roles: ['employee'],
}
const view: SalaryDetail = {
  defaultAmountBasis: 'gross',
  employee: {
    userId: 'worker',
    name: 'თანამშრომელი',
    jobTitle: null,
    username: null,
    status: 'active',
    version: 0,
    current: null,
    next: null,
  },
  today: '2026-11-25',
  timezone: 'Asia/Tbilisi',
  history: [],
  total: 0,
  pageSize: 10,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMySalary).mockResolvedValue({ ok: true, value: view })
  vi.mocked(getEmployeeSalary).mockResolvedValue({ ok: true, value: view })
})
function mount(person = actor, userId?: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SalaryWorkspace actor={person} page={1} userId={userId} />
    </QueryClientProvider>,
  )
}
it('reads only the authenticated employee salary and presents missing agreements honestly', async () => {
  mount()
  expect(await screen.findByText('ხელფასი არ არის განსაზღვრული')).toBeVisible()
  expect(getMySalary).toHaveBeenCalledWith({ data: { page: 1 } })
  expect(getEmployeeSalary).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('button', { name: 'ხელფასის განსაზღვრა' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(/სახელფასო უწყისის გამოთვლა ჯერ არ არის ჩართული/),
  ).toBeVisible()
})
it('shows the real agreed rate and upcoming change without inventing monthly take-home totals', async () => {
  vi.mocked(getMySalary).mockResolvedValue({
    ok: true,
    value: {
      ...view,
      employee: {
        ...view.employee,
        version: 1,
        current: {
          version: 1,
          effectiveFrom: '2026-11-01',
          kind: 'hourly',
          amountMinor: 1525,
          amountBasis: 'gross',
          currency: 'GEL',
        },
        next: null,
      },
    },
  })
  mount()
  expect(await screen.findByText(/15,25/)).toBeVisible()
  expect(screen.getByText('საათში')).toBeVisible()
  expect(screen.getByText('დარიცხული თანხა')).toBeVisible()
  expect(screen.queryByText('გადასახდელი თანხა')).not.toBeInTheDocument()
})
it('keeps an owner’s own salary read-only on the management screen', async () => {
  mount({ ...actor, roles: ['owner'] }, actor.id)
  await screen.findByText('ხელფასი არ არის განსაზღვრული')
  expect(
    screen.queryByRole('button', { name: 'ხელფასის განსაზღვრა' }),
  ).not.toBeInTheDocument()
  expect(getEmployeeSalary).toHaveBeenCalledWith({
    data: { userId: actor.id, page: 1 },
  })
})
