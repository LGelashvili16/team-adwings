import { queryOptions } from '@tanstack/react-query'
import { getEmployeeAccount, listAccounts } from './access.functions'
import type { EmployeeAccountSearch } from './access.schemas'

export const employeeAccountKeys = {
  all: ['employee-accounts'] as const,
}

export const employeeAccountsQuery = (
  actorId: string,
  search: EmployeeAccountSearch,
) =>
  queryOptions({
    queryKey: [...employeeAccountKeys.all, 'list', actorId, search],
    queryFn: () => listAccounts({ data: search }),
    retry: false,
    staleTime: 0,
  })

export const employeeAccountQuery = (actorId: string, userId: string) =>
  queryOptions({
    queryKey: [...employeeAccountKeys.all, 'detail', actorId, userId],
    queryFn: () => getEmployeeAccount({ data: { userId } }),
    retry: false,
    staleTime: 0,
  })
