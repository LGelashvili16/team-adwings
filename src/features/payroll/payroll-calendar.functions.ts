import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { permissionsMiddleware } from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  calendarPeopleSchema,
  payrollCalendarSearchSchema,
  saveCalendarExceptionSchema,
} from './payroll-calendar.schemas'
import {
  PayrollCalendarError,
  readCalendarPeople,
  readPayrollCalendar,
  saveCalendarException,
} from './server/payroll-calendar.service.server'

async function safely<T>(action: () => Promise<T>) {
  setResponseHeader('Cache-Control', 'private, no-store')
  try {
    return { ok: true as const, value: await enforcePolicy(action) }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error
    return {
      ok: false as const,
      message:
        error instanceof PayrollCalendarError
          ? error.message
          : 'კალენდრის მოთხოვნა ვერ შესრულდა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.',
    }
  }
}
const manager = permissionsMiddleware('manage.access', 'payroll.configure')
export const getPayrollCalendar = createServerFn({ method: 'GET' })
  .middleware([manager])
  .validator(payrollCalendarSearchSchema)
  .handler(({ context, data }) =>
    safely(() => readPayrollCalendar(context.actor, data)),
  )
export const updateCalendarException = createServerFn({ method: 'POST' })
  .middleware([manager])
  .validator(saveCalendarExceptionSchema)
  .handler(({ context, data }) =>
    safely(() => saveCalendarException(context.actor, data)),
  )
export const getCalendarPeople = createServerFn({ method: 'GET' })
  .middleware([
    permissionsMiddleware(
      'manage.access',
      'payroll.configure',
      'payroll.read.all',
    ),
  ])
  .validator(calendarPeopleSchema)
  .handler(({ context, data }) =>
    safely(() => readCalendarPeople(context.actor, data)),
  )
