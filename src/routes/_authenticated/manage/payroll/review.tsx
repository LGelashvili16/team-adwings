import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '#/lib/page-head'
import {
  hasAnyPermission,
  hasPermission,
} from '#/lib/authorization/permissions'
import { attendancePayrollReviewSearchSchema } from '#/features/payroll/attendance-payroll.schemas'
import { AttendancePayrollReviewPage } from '#/features/payroll/pages/attendance-payroll-review-page'

export const Route = createFileRoute('/_authenticated/manage/payroll/review')({
  validateSearch: attendancePayrollReviewSearchSchema,
  beforeLoad: ({ context }) => {
    if (
      !hasPermission(context.actor, 'manage.access') ||
      !hasAnyPermission(context.actor, [
        'payroll.attendance.review',
        'payroll.read.all',
      ])
    ) {
      throw { status: 403, code: 'FORBIDDEN' }
    }
  },
  head: () =>
    pageHead(
      'დასწრებით გამოთვლები',
      'დასვენების დღის ბონუსების, საათობრივი დარიცხვებისა და GPS ვიზიტების გადამოწმება.',
    ),
  component: AttendancePayrollReviewPage,
})
