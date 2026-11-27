import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import {
  anyPermissionMiddleware,
  permissionsMiddleware,
} from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  attendancePayrollDetailSchema,
  attendancePayrollReviewSearchSchema,
  saveAttendancePayrollDecisionSchema,
} from './attendance-payroll.schemas'
import {
  AttendancePayrollError,
  readAttendancePayrollReview,
  readEmployeeAttendancePayrollDetail,
  saveAttendancePayrollDecision,
} from './server/attendance-payroll.service.server'

async function safely<T>(action: () => Promise<T>) {
  setResponseHeader('Cache-Control', 'private, no-store')
  try {
    return { ok: true as const, value: await enforcePolicy(action) }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error
    return {
      ok: false as const,
      message:
        error instanceof AttendancePayrollError
          ? error.message
          : 'დასწრებით გამოთვლის მოთხოვნა ვერ შესრულდა. სცადეთ ხელახლა.',
    }
  }
}

const reviewReader = [
  permissionsMiddleware('manage.access'),
  anyPermissionMiddleware('payroll.attendance.review', 'payroll.read.all'),
] as const

const reviewWriter = [
  permissionsMiddleware('manage.access', 'payroll.attendance.review'),
] as const

export const getAttendancePayrollReview = createServerFn({ method: 'GET' })
  .middleware([...reviewReader])
  .validator(attendancePayrollReviewSearchSchema)
  .handler(({ context, data }) =>
    safely(() => readAttendancePayrollReview(context.actor, data)),
  )

export const getEmployeeAttendancePayroll = createServerFn({ method: 'GET' })
  .middleware([...reviewReader])
  .validator(attendancePayrollDetailSchema)
  .handler(({ context, data }) =>
    safely(() => readEmployeeAttendancePayrollDetail(context.actor, data)),
  )

export const decideAttendancePayrollItem = createServerFn({ method: 'POST' })
  .middleware([...reviewWriter])
  .validator(saveAttendancePayrollDecisionSchema)
  .handler(({ context, data }) =>
    safely(() => saveAttendancePayrollDecision(context.actor, data)),
  )
