import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { monthlyEmployeeQuery } from './monthly.queries'
import { payrollEmployeesQuery } from './payroll-employee.queries'
import { getMonthlyEmployees } from './monthly.functions'

vi.mock('./monthly.functions', () => ({
  getMonthlyEmployee: vi.fn(),
  getMonthlyPayroll: vi.fn(),
  getMonthlyEmployees: vi.fn(),
}))
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
