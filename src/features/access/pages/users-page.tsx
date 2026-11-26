import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmployeeAccounts } from '../components/employee-accounts'
import type { Actor } from '#/lib/authorization/actor'
import type { EmployeeAccountSearch } from '../access.schemas'

export function UsersPage({
  search,
  actor,
}: {
  search: EmployeeAccountSearch
  actor: Actor
}) {
  // This private feature owns its cache; leaving the authenticated page discards it.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  )
  return (
    <QueryClientProvider client={client}>
      <EmployeeAccounts search={search} actor={actor} />
    </QueryClientProvider>
  )
}
