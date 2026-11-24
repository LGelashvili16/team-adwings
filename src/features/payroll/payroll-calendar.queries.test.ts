import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { payrollCalendarQuery } from './payroll-calendar.queries'
import { payrollCalendarSearchSchema } from './payroll-calendar.schemas'
import type { PayrollCalendarView } from './payroll-calendar.types'

vi.mock('./payroll-calendar.functions', () => ({
  getPayrollCalendar: vi.fn(),
  getCalendarPeople: vi.fn(),
}))
const search = payrollCalendarSearchSchema.parse({
  month: '2026-11',
  userId: 'worker',
})
const view: PayrollCalendarView = {
  holidayRuleVersion: 'baseline',
  revision: 1,
  today: '2026-11-25',
  month: '2026-11',
  timezone: 'Asia/Tbilisi',
  person: {
    userId: 'worker',
    name: 'თანამშრომელი',
    username: null,
    jobTitle: null,
  },
  days: [],
  history: [],
  historyTotal: 0,
  historyPageSize: 10,
}
it('keeps the same monthly context stable during history filtering', () => {
  const client = new QueryClient(),
    options = payrollCalendarQuery('accountant', search)
  const previous = { ok: true as const, value: view }
  client.setQueryData(options.queryKey, previous)
  const observer = new QueryObserver(client, options)
  observer.setOptions(
    payrollCalendarQuery('accountant', {
      ...search,
      historyQ: 'ავტორი',
      historyPage: 2,
    }),
  )
  expect(observer.getCurrentResult().data).toBe(previous)
  expect(observer.getCurrentResult().isPlaceholderData).toBe(true)
  observer.destroy()
  client.clear()
})
it('never presents another actor, employee or month as placeholder calendar data', () => {
  const client = new QueryClient(),
    options = payrollCalendarQuery('accountant', search)
  const previous = { ok: true as const, value: view }
  client.setQueryData(options.queryKey, previous)
  for (const [actorId, next] of [
    ['other-actor', search],
    ['accountant', { ...search, userId: 'other-employee' }],
    ['accountant', { ...search, month: '2026-12' }],
  ] as const) {
    const observer = new QueryObserver(client, options)
    observer.setOptions(payrollCalendarQuery(actorId, next))
    expect(observer.getCurrentResult().data).toBeUndefined()
    expect(observer.getCurrentResult().isPlaceholderData).toBe(false)
    observer.destroy()
  }
  client.clear()
})
