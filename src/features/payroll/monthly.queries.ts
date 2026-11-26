import { queryOptions } from '@tanstack/react-query'
import { getMonthlyEmployee, getMonthlyPayroll } from './monthly.functions'
import type { MonthlySearch } from './monthly.schemas'

export const monthlyKey = (actorId: string) =>
  ['payroll-monthly', actorId] as const
export const monthlyPayrollQuery = (actorId: string, search: MonthlySearch) =>
  queryOptions({
    queryKey: [...monthlyKey(actorId), 'directory', search] as const,
    queryFn: () => getMonthlyPayroll({ data: search }),
    placeholderData: (previous, query) => {
      const previousSearch = query?.queryKey[3]
      return previous?.ok &&
        query?.queryKey[1] === actorId &&
        previousSearch &&
        previousSearch.month === search.month &&
        previousSearch.view === search.view &&
        previousSearch.q === search.q &&
        previousSearch.sort === search.sort &&
        previousSearch.period !== search.period
        ? previous
        : undefined
    },
    staleTime: 0,
    refetchInterval: ({ state }) => {
      const boundary = state.data?.ok
        ? state.data.value.nextPeriodChangeAt
        : null
      return boundary && state.status !== 'error'
        ? Math.max(1000, boundary - Date.now())
        : false
    },
    retry: false,
  })
export const monthlyEmployeeQuery = (
  actorId: string,
  month: string,
  userId: string,
  page: number,
) =>
  queryOptions({
    queryKey: [...monthlyKey(actorId), 'employee', month, userId, page],
    queryFn: () => getMonthlyEmployee({ data: { month, userId, page } }),
    placeholderData: (previous, query) =>
      query?.queryKey[1] === actorId &&
      query.queryKey[3] === month &&
      query.queryKey[4] === userId
        ? previous
        : undefined,
    staleTime: 0,
    retry: false,
  })
