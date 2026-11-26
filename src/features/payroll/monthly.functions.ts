import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { permissionsMiddleware } from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { formatMonthlyPayrollCsv } from './monthly.rules'
import {
  monthlySearchSchema,
  monthlyDetailSchema,
  monthlySaveSchema,
  monthlyAdjustmentsSaveSchema,
  paymentPreviewSchema,
  publishPaymentsSchema,
  monthlyRemoveSchema,
} from './monthly.schemas'
import {
  MonthlyPayrollError,
  readMonthlyPayroll,
  readMonthlyEmployee,
  readMonthlyEmployees,
  saveMonthlyEmployee,
  saveMonthlyAdjustments,
  previewMonthlyPayments,
  publishMonthlyPayments,
  removeMonthlyEmployee,
} from './server/monthly.service.server'

async function safely<T>(action: () => Promise<T>) {
  setResponseHeader('Cache-Control', 'private, no-store')
  try {
    return { ok: true as const, value: await enforcePolicy(action) }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error
    return {
      ok: false as const,
      message:
        error instanceof MonthlyPayrollError
          ? error.message
          : 'უწყისის მოთხოვნა ვერ შესრულდა. გადაამოწმეთ მონაცემები და სცადეთ ხელახლა.',
    }
  }
}
const reader = permissionsMiddleware('manage.access', 'payroll.read.all')
const writer = permissionsMiddleware(
  'manage.access',
  'payroll.read.all',
  'payroll.manage',
)
export const getMonthlyPayroll = createServerFn({ method: 'GET' })
  .middleware([reader])
  .validator(monthlySearchSchema)
  .handler(({ context, data }) =>
    safely(() => readMonthlyPayroll(context.actor, data)),
  )
export const getMonthlyPayrollCsv = createServerFn({ method: 'GET' })
  .middleware([reader])
  .validator(monthlySearchSchema.omit({ view: true }))
  .handler(({ context, data }) =>
    safely(async () =>
      formatMonthlyPayrollCsv(
        await readMonthlyPayroll(context.actor, data, true),
      ),
    ),
  )
export const getMonthlyEmployee = createServerFn({ method: 'GET' })
  .middleware([reader])
  .validator(monthlyDetailSchema)
  .handler(({ context, data }) =>
    safely(() => readMonthlyEmployee(context.actor, data)),
  )
export const getMonthlyEmployees = createServerFn({ method: 'GET' })
  .middleware([writer])
  .validator(monthlySearchSchema)
  .handler(({ context, data }) =>
    safely(() => readMonthlyEmployees(context.actor, data)),
  )
export const setMonthlyEmployee = createServerFn({ method: 'POST' })
  .middleware([writer])
  .validator(monthlySaveSchema)
  .handler(({ context, data }) =>
    safely(() => saveMonthlyEmployee(context.actor, data)),
  )
export const setMonthlyAdjustments = createServerFn({ method: 'POST' })
  .middleware([writer])
  .validator(monthlyAdjustmentsSaveSchema)
  .handler(({ context, data }) =>
    safely(() => saveMonthlyAdjustments(context.actor, data)),
  )
export const getMonthlyPaymentPreview = createServerFn({ method: 'GET' })
  .middleware([writer])
  .validator(paymentPreviewSchema)
  .handler(({ context, data }) =>
    safely(() => previewMonthlyPayments(context.actor, data)),
  )
export const setMonthlyPayments = createServerFn({ method: 'POST' })
  .middleware([writer])
  .validator(publishPaymentsSchema)
  .handler(({ context, data }) =>
    safely(() => publishMonthlyPayments(context.actor, data)),
  )
export const deleteMonthlyEmployee = createServerFn({ method: 'POST' })
  .middleware([writer])
  .validator(monthlyRemoveSchema)
  .handler(({ context, data }) =>
    safely(() => removeMonthlyEmployee(context.actor, data)),
  )
