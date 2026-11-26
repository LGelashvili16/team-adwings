import { queryOptions } from '@tanstack/react-query'
import { getEmployeeEmployment } from './employment.functions'

export const employmentKey = (actorId: string, userId: string) =>
  ['employee-employment', actorId, userId] as const
export const employmentQuery = (
  actorId: string,
  userId: string,
  employmentPage: number,
  employmentHistoryPage: number,
) =>
  queryOptions({
    queryKey: [
      ...employmentKey(actorId, userId),
      employmentPage,
      employmentHistoryPage,
    ],
    queryFn: () =>
      getEmployeeEmployment({
        data: { userId, employmentPage, employmentHistoryPage },
      }),
    retry: false,
    staleTime: 0,
  })
