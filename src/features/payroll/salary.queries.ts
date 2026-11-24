import { queryOptions } from '@tanstack/react-query'
import {
  getMySalary,
  getEmployeeSalary,
  getSalaryDirectory,
} from './salary.functions'
import type { SalaryDirectorySearch } from './salary.schemas'

export const salaryKey = (actorId: string) =>
  ['salary-workspace', actorId] as const
export const mySalaryQuery = (actorId: string, page: number) =>
  queryOptions({
    queryKey: [...salaryKey(actorId), 'mine', page],
    queryFn: () => getMySalary({ data: { page } }),
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
