import { queryOptions } from '@tanstack/react-query'
import { getMonthlyEmployee, getMonthlyPayroll } from './monthly.functions'
import type { MonthlySearch } from './monthly.schemas'

export const monthlyKey = (actorId: string) =>
  ['payroll-monthly', actorId] as const
export const monthlyPayrollQuery = (actorId: string, search: MonthlySearch) =>
  queryOptions({
    queryKey: [...monthlyKey(actorId), 'directory', search],
    queryFn: () => getMonthlyPayroll({ data: search }),
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
