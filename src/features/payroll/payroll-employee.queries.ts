import { queryOptions } from '@tanstack/react-query'
import { getMonthlyEmployees } from './monthly.functions'
import { monthlyKey } from './monthly.queries'
import type { z } from 'zod'
import type { payrollEmployeeSearchSchema } from './payroll-search.schemas'

export function payrollEmployeesQuery(
  actorId: string,
  data: z.input<typeof payrollEmployeeSearchSchema>,
) {
  return queryOptions({
    queryKey: [...monthlyKey(actorId), 'employees', data],
    queryFn: () => getMonthlyEmployees({ data }),
    retry: false,
    staleTime: 0,
  })
}
