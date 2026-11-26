// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { readActorFromHeaders } from '#/lib/auth/session.server'
import { monthlyPayrollPdfResponse } from './monthly-export.server'
import { readMonthlyPayroll } from './monthly.service.server'
import type { Actor } from '#/lib/authorization/actor'
import type { MonthlyDirectory, MonthlyDirectoryRow } from '../monthly.types'

vi.mock('@tanstack/react-start/server-only', () => ({}))
vi.mock('#/lib/auth/session.server', () => ({ readActorFromHeaders: vi.fn() }))
vi.mock('./monthly.service.server', () => ({
  MonthlyPayrollError: class extends Error {},
  readMonthlyPayroll: vi.fn(),
}))

const accountant: Actor = {
  id: 'accountant',
  name: 'ბუღალტერი',
  email: null,
  emailVerified: false,
  roles: ['accountant'],
}
const employee: MonthlyDirectoryRow = {
  userId: 'employee',
  employeeName: 'ნინო მაისურაძე',
  salary: null,
  version: 1,
  status: 'draft',
  baseMinor: 123456,
  bonusMinor: 5000,
  premiumMinor: 2000,
  fineMinor: 0,
  totalMinor: 130456,
  paidMinor: 123456,
  paidAdjustments: false,
  baseNeedsConfirmation: false,
  payoutDates: {
    first: { start: '2026-11-14', end: '2026-11-16', paidOn: '2026-11-15' },
  },
  adjustmentDates: [],
}
const report: MonthlyDirectory = {
  month: '2026-11',
  period: 'all',
  entryCount: 24,
  closed: false,
  paymentWindows: [{ stage: 'first', start: '2026-11-14', end: '2026-11-16' }],
  records: Array.from({ length: 24 }, (_, index) => ({
    ...employee,
    userId: `employee-${index}`,
    employeeName: `${employee.employeeName} ${index + 1}`,
  })),
  nextPeriodChangeAt: null,
  total: 24,
  pageSize: 1000,
}
const request = (query = '') =>
  new Request(`http://localhost/api/payroll/monthly-pdf?${query}`)

afterEach(() => vi.resetAllMocks())

it('rejects anonymous, forbidden and invalid exports before reading payroll', async () => {
  vi.mocked(readActorFromHeaders).mockResolvedValueOnce(null)
  vi.mocked(readActorFromHeaders).mockResolvedValueOnce({
    ...accountant,
    roles: ['employee'],
  })
  vi.mocked(readActorFromHeaders).mockResolvedValueOnce(accountant)

  expect((await monthlyPayrollPdfResponse(request())).status).toBe(401)
  expect((await monthlyPayrollPdfResponse(request())).status).toBe(403)
  expect(
    (await monthlyPayrollPdfResponse(request('month=2026-13'))).status,
  ).toBe(400)
  expect(readMonthlyPayroll).not.toHaveBeenCalled()
})

it('downloads all matching rows as a private, multipage PDF with an embedded font', async () => {
  vi.mocked(readActorFromHeaders).mockResolvedValue(accountant)
  vi.mocked(readMonthlyPayroll).mockResolvedValue(report)

  const response = await monthlyPayrollPdfResponse(
    request('month=2026-11&period=all&q=employee&sort=name_desc'),
  )
  expect(readMonthlyPayroll).toHaveBeenCalledWith(
    accountant,
    {
      month: '2026-11',
      period: 'all',
      q: 'employee',
      sort: 'name_desc',
      page: 1,
    },
    true,
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.get('Content-Type')).toBe('application/pdf')
  expect(response.headers.get('Content-Disposition')).toBe(
    'attachment; filename="payroll-2026-11-all.pdf"',
  )
  const pdf = Buffer.from(await response.arrayBuffer()).toString('latin1')
  expect(pdf).toMatch(/^%PDF-/)
  expect(pdf).toContain('/FontFile2')
  expect(pdf.match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1)
  expect(pdf.trimEnd()).toMatch(/%%EOF$/)
}, 15000)
