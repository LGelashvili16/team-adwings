import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '#/lib/page-head'
import { hasEveryPermission } from '#/lib/authorization/permissions'
import { payrollCalendarSearchSchema } from '#/features/payroll/payroll-calendar.schemas'
import { PayrollCalendarPage } from '#/features/payroll/pages/payroll-calendar-page'

export const Route = createFileRoute('/_authenticated/manage/payroll/calendar')(
  {
    validateSearch: payrollCalendarSearchSchema,
    beforeLoad: ({ context }) => {
      if (
        !hasEveryPermission(context.actor, [
          'manage.access',
          'payroll.configure',
        ])
      )
        throw { status: 403, code: 'FORBIDDEN' }
    },
    head: () =>
      pageHead(
        'სახელფასო კალენდარი',
        'სახელფასო კალენდრის გამონაკლისები და ცვლილებების ისტორია.',
      ),
    component: PayrollCalendarPage,
  },
)
