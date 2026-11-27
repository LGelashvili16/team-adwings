import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import {
  anyPermissionMiddleware,
  permissionsMiddleware,
} from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  readRestDayPolicySchema,
  saveRestDayPolicySchema,
} from './rest-day-policy.schemas'
import {
  RestDayPolicyError,
  readEmployeeRestDayPolicy,
  saveEmployeeRestDayPolicy,
} from './server/rest-day-policy.service.server'

async function safely<T>(action: () => Promise<T>) {
  setResponseHeader('Cache-Control', 'private, no-store')
  try {
    return { ok: true as const, value: await enforcePolicy(action) }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error
    return {
      ok: false as const,
      message:
        error instanceof RestDayPolicyError
          ? error.message
          : 'დასვენების დღის წესების მოთხოვნა ვერ შესრულდა. სცადეთ ხელახლა.',
    }
  }
}

export const getEmployeeRestDayPolicy = createServerFn({ method: 'GET' })
  .middleware([
    permissionsMiddleware('manage.access'),
    anyPermissionMiddleware('payroll.attendance.review', 'payroll.read.all'),
  ])
  .validator(readRestDayPolicySchema)
  .handler(({ context, data }) =>
    safely(() => readEmployeeRestDayPolicy(context.actor, data)),
  )

export const setEmployeeRestDayPolicy = createServerFn({ method: 'POST' })
  .middleware([
    permissionsMiddleware('manage.access', 'payroll.attendance.review'),
  ])
  .validator(saveRestDayPolicySchema)
  .handler(({ context, data }) =>
    safely(() => saveEmployeeRestDayPolicy(context.actor, data)),
  )
