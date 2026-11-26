import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { monthlyEmployeeQuery, monthlyPayrollQuery } from './monthly.queries'
import { payrollEmployeesQuery } from './payroll-employee.queries'
import { getMonthlyEmployees } from './monthly.functions'
import type { MonthlySearch } from './monthly.schemas'

vi.mock('./monthly.functions', () => ({
  getMonthlyEmployee: vi.fn(),
  getMonthlyPayroll: vi.fn(),
  getMonthlyEmployees: vi.fn(),
}))
it('retains payroll results while switching periods within the same directory', () => {
  const client = new QueryClient()
  const search: MonthlySearch = {
    month: '2026-11',
    page: 2,
    q: '',
    sort: 'name',
    period: 'first',
  }
  const options = monthlyPayrollQuery('accountant', search)
  client.setQueryData(options.queryKey, {
    ok: true,
    value: {
      month: '2026-11',
      period: 'first',
      records: [],
      paymentWindows: [],
      closed: false,
      entryCount: 0,
      nextPeriodChangeAt: null,
      total: 0,
      pageSize: 20,
    },
  })
  const nextSearch = { ...search, page: 1, period: 'salary' } as const
  const observer = new QueryObserver(client, options)
  observer.setOptions(monthlyPayrollQuery('accountant', nextSearch))
  expect(observer.getCurrentResult().isPlaceholderData).toBe(true)
  expect(observer.getCurrentResult().data).toBe(
    client.getQueryData(options.queryKey),
  )
  for (const [actor, changes] of [
    ['other', {}],
    ['accountant', { month: '2026-12' }],
    ['accountant', { view: 'bonuses' }],
    ['accountant', { q: 'ანა' }],
    ['accountant', { sort: 'name_desc' }],
  ] as const) {
    observer.setOptions(
      monthlyPayrollQuery(actor, { ...nextSearch, ...changes }),
    )
    expect(observer.getCurrentResult().data).toBeUndefined()
  }
  observer.destroy()
  client.clear()
})
it('retains history pagination only within the same actor, month and employee', () => {
  const client = new QueryClient(),
    options = monthlyEmployeeQuery('accountant', '2026-11', 'worker', 1),
    result = { ok: false as const, message: 'ჩანაწერი არ არის' }
  client.setQueryData(options.queryKey, result)
  for (const [actor, month, employee, keep] of [
    ['accountant', '2026-11', 'worker', true],
    ['other', '2026-11', 'worker', false],
    ['accountant', '2026-12', 'worker', false],
    ['accountant', '2026-11', 'other', false],
  ] as const) {
    const observer = new QueryObserver(client, options)
    observer.setOptions(monthlyEmployeeQuery(actor, month, employee, 2))
    expect(observer.getCurrentResult().data).toBe(keep ? result : undefined)
    observer.destroy()
  }
  client.clear()
})
it('scopes employee picker results to the current actor', async () => {
  vi.mocked(getMonthlyEmployees).mockResolvedValue({
    ok: true,
    value: { records: [], total: 0, pageSize: 20 },
  })
  const client = new QueryClient(),
    input = {
      q: 'ანა',
      page: 1,
    }
  await client.fetchQuery(payrollEmployeesQuery('accountant', input))
  expect(getMonthlyEmployees).toHaveBeenCalledWith({
    data: { q: 'ანა', page: 1 },
  })

  expect(
    client.getQueryData(payrollEmployeesQuery('other', input).queryKey),
  ).toBeUndefined()
  client.clear()
})
