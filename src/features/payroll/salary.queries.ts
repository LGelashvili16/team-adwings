import { queryOptions } from '@tanstack/react-query'
import {
  getMySalary,
  getEmployeeSalary,
  getSalaryDirectory,
} from './salary.functions'
import type { SalaryDirectorySearch, SalarySelfSearch } from './salary.schemas'

export const salaryKey = (actorId: string) =>
  ['salary-workspace', actorId] as const
export const mySalaryQuery = (actorId: string, search: SalarySelfSearch) =>
  queryOptions({
    queryKey: [...salaryKey(actorId), 'mine', search] as const,
    queryFn: () => getMySalary({ data: search }),
    placeholderData: (previous, query) => {
      const previousSearch = query?.queryKey[3]
      return query?.queryKey[1] === actorId &&
        previousSearch?.page === search.page
        ? previous
        : undefined
    },
    retry: false,
    staleTime: 0,
  })
export const employeeSalaryQuery = (
  actorId: string,
  userId: string,
  page: number,
) =>
  queryOptions({
    queryKey: [...salaryKey(actorId), 'employee', userId, page],
    queryFn: () => getEmployeeSalary({ data: { userId, page } }),
    retry: false,
    staleTime: 0,
  })
export const salaryDirectoryQuery = (
  actorId: string,
  search: SalaryDirectorySearch,
) =>
  queryOptions({
    queryKey: [...salaryKey(actorId), 'directory', search],
    queryFn: () => getSalaryDirectory({ data: search }),
    retry: false,
    staleTime: 0,
  })
