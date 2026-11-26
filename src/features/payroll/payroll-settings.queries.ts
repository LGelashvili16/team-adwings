import { queryOptions } from '@tanstack/react-query'
import { getPayrollSettings } from './payroll-settings.functions'

export const payrollSettingsKey = (actorId: string) =>
  ['payroll-settings', actorId] as const
export const payrollSettingsQuery = (actorId: string) =>
  queryOptions({
    queryKey: payrollSettingsKey(actorId),
    queryFn: () => getPayrollSettings(),
    staleTime: 0,
    retry: false,
  })
export type PayrollSettingsView = Awaited<ReturnType<typeof getPayrollSettings>>
