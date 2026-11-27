import { queryOptions } from '@tanstack/react-query'
import { getEmployeeRestDayPolicy } from './rest-day-policy.functions'

export const restDayPolicyKey = (actorId: string, userId?: string) =>
  userId
    ? (['payroll-rest-day-policy', actorId, userId] as const)
    : (['payroll-rest-day-policy', actorId] as const)

export const employeeRestDayPolicyQuery = (
  actorId: string,
  userId: string,
  page = 1,
) =>
  queryOptions({
    queryKey: [...restDayPolicyKey(actorId, userId), page] as const,
    queryFn: () => getEmployeeRestDayPolicy({ data: { userId, page } }),
    staleTime: 0,
    retry: false,
  })
