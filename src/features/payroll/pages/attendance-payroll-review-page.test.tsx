import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorHTMLAttributes } from 'react'
import { AttendancePayrollReviewPage } from './attendance-payroll-review-page'

const calls = vi.hoisted(() => ({
  getReview: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../attendance-payroll.functions', () => ({
  getAttendancePayrollReview: calls.getReview,
  getEmployeeAttendancePayroll: vi.fn(),
  decideAttendancePayrollItem: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useRouteContext: () => ({
      actor: {
        id: 'hr-1',
        name: 'HR მენეჯერი',
        email: 'hr@example.com',
        emailVerified: true,
        roles: ['hr_manager'],
      },
    }),
    useSearch: () => ({
      q: '',
      onlyFlagged: false,
      page: 1,
    }),
    useNavigate: () => calls.navigate,
  }),
  Link: ({
    to,
    search: _search,
    resetScroll: _resetScroll,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string
    search?: Record<string, unknown>
    resetScroll?: boolean
  }) => <a href={to} {...props} />,
}))

describe('AttendancePayrollReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders cleanly for HR when navigating without a month query param', async () => {
    calls.getReview.mockResolvedValue({
      ok: true,
      value: {
        month: '2026-11',
        records: [
          {
            userId: 'u-1',
            employeeName: 'გიორგი',
            salaryKind: 'monthly',
            hasMixedSalaryKinds: false,
            proratedFixedMinor: 0,
            autoRestDayBonusEnabled: true,
            restDayClockInAllowed: true,
            autoBonusMinor: 13000,
            hourlyCalculatedMinor: 0,
            hourlyPayableSeconds: 0,
            needsReviewCount: 1,
            totalItems: 1,
          },
        ],
        total: 1,
        pageSize: 20,
        canReview: true,
      },
    })

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AttendancePayrollReviewPage />
      </QueryClientProvider>,
    )

    expect(
      screen.getByRole('heading', { name: 'დასწრებით გამოთვლები' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('გიორგი')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /სახელფასო თვე/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})
