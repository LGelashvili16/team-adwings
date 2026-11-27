import { queryOptions } from '@tanstack/react-query'
import {
  getAttendancePayrollReview,
  getEmployeeAttendancePayroll,
} from './attendance-payroll.functions'
import type { AttendancePayrollReviewSearch } from './attendance-payroll.schemas'

export const attendancePayrollKey = (actorId: string) =>
  ['payroll-attendance-review', actorId] as const

export const attendancePayrollReviewQuery = (
  actorId: string,
  search: AttendancePayrollReviewSearch,
) =>
  queryOptions({
    queryKey: [...attendancePayrollKey(actorId), 'directory', search] as const,
    queryFn: () => getAttendancePayrollReview({ data: search }),
    staleTime: 0,
    retry: false,
  })

export const employeeAttendancePayrollQuery = (
  actorId: string,
  month: string,
  userId: string,
) =>
  queryOptions({
    queryKey: [...attendancePayrollKey(actorId), 'employee', month, userId] as const,
    queryFn: () => getEmployeeAttendancePayroll({ data: { month, userId } }),
    staleTime: 0,
    retry: false,
  })
