import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { permissionsMiddleware } from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  employmentReadSchema,
  employmentVoidSchema,
  employmentWriteSchema,
} from './employment.schemas'
import {
  EmploymentError,
  readEmployeeEmployment,
  saveEmployeeEmployment,
  voidEmployeeEmployment,
} from './server/employment.service.server'

async function safely<T>(action: () => Promise<T>) {
  setResponseHeader('Cache-Control', 'private, no-store')
  try {
    return { ok: true as const, value: await enforcePolicy(action) }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error
    return {
      ok: false as const,
      message:
        error instanceof EmploymentError
          ? error.message
          : 'მოთხოვნა ვერ შესრულდა. სცადეთ ხელახლა.',
    }
  }
}
const reader = permissionsMiddleware('manage.access', 'employees.manage')
const editor = permissionsMiddleware(
  'manage.access',
  'employees.manage',
  'employees.employment.manage',
)
export const getEmployeeEmployment = createServerFn({ method: 'GET' })
  .middleware([reader])
  .validator(employmentReadSchema)
  .handler(({ context, data }) =>
    safely(() => readEmployeeEmployment(context.actor, data)),
  )
export const updateEmployeeEmployment = createServerFn({ method: 'POST' })
  .middleware([editor])
  .validator(employmentWriteSchema)
  .handler(({ context, data }) =>
    safely(() => saveEmployeeEmployment(context.actor, data)),
  )
export const discardEmployeeEmployment = createServerFn({ method: 'POST' })
  .middleware([editor])
  .validator(employmentVoidSchema)
  .handler(({ context, data }) =>
    safely(() => voidEmployeeEmployment(context.actor, data)),
  )
