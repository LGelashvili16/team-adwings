import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import {
  authenticatedMiddleware,
  permissionsMiddleware,
} from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  salaryDetailSchema,
  salaryDirectorySchema,
  salarySelfReadSchema,
  salarySaveSchema,
} from './salary.schemas'
import {
  readMySalary,
  readEmployeeSalary,
  readSalaryDirectory,
  saveSalaryTerms,
  SalaryError,
} from './server/salary.service.server'

async function safely<T>(action: () => Promise<T>) {
  setResponseHeader('Cache-Control', 'private, no-store')
  try {
    return { ok: true as const, value: await enforcePolicy(action) }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error
    return {
      ok: false as const,
      message:
        error instanceof SalaryError
          ? error.message
          : 'მოთხოვნა ვერ შესრულდა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.',
    }
  }
}
const reader = permissionsMiddleware('manage.access', 'payroll.read.all')
export const getMySalary = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .validator(salarySelfReadSchema)
  .handler(({ context, data }) =>
    safely(() => readMySalary(context.actor, data)),
  )
export const getEmployeeSalary = createServerFn({ method: 'GET' })
  .middleware([reader])
  .validator(salaryDetailSchema)
  .handler(({ context, data }) =>
    safely(() => readEmployeeSalary(context.actor, data)),
  )
export const getSalaryDirectory = createServerFn({ method: 'GET' })
  .middleware([reader])
  .validator(salaryDirectorySchema)
  .handler(({ context, data }) =>
    safely(() => readSalaryDirectory(context.actor, data)),
  )
export const setSalaryTerms = createServerFn({ method: 'POST' })
  .middleware([
    permissionsMiddleware(
      'manage.access',
      'payroll.read.all',
      'payroll.terms.manage',
    ),
  ])
  .validator(salarySaveSchema)
  .handler(({ context, data }) =>
    safely(() => saveSalaryTerms(context.actor, data)),
  )
