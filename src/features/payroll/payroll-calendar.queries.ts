import { queryOptions } from '@tanstack/react-query'
import {
  getCalendarPeople,
  getPayrollCalendar,
} from './payroll-calendar.functions'
import { payrollCalendarSearchSchema } from './payroll-calendar.schemas'
import type { PayrollCalendarSearch } from './payroll-calendar.schemas'

export const calendarKey = (actorId: string) =>
  ['payroll-calendar', actorId] as const
export const payrollCalendarQuery = (
  actorId: string,
  search: PayrollCalendarSearch,
) =>
  queryOptions({
    queryKey: [...calendarKey(actorId), search],
    queryFn: () => getPayrollCalendar({ data: search }),
    // History filters must not collapse the month above the focused search field. Never retain another actor, employee or month's view.
    placeholderData: (previous, previousQuery) => {
      const parsed = payrollCalendarSearchSchema.safeParse(
        previousQuery?.queryKey[2],
      )
      return previousQuery?.queryKey[1] === actorId &&
        parsed.success &&
        parsed.data.userId === search.userId &&
        parsed.data.month === search.month
        ? previous
        : undefined
    },
    retry: false,
    staleTime: 0,
  })
export const calendarPeopleQuery = (actorId: string, q: string, page: number) =>
  queryOptions({
    queryKey: [...calendarKey(actorId), 'people', q, page],
    queryFn: () => getCalendarPeople({ data: { q, page } }),
    retry: false,
    staleTime: 0,
  })
