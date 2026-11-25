import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '#/lib/page-head'
import { requireSalaryWorkspace } from '#/features/payroll/salary.access'
import { monthlySearchSchema } from '#/features/payroll/monthly.schemas'
import { MonthlyPayrollPage } from '#/features/payroll/pages/monthly-payroll-page'

export const Route = createFileRoute('/_authenticated/manage/payroll/monthly')({
  validateSearch: monthlySearchSchema,
  beforeLoad: ({ context }) => requireSalaryWorkspace(context.actor),
  head: ({ match }) =>
    match.search.view === 'bonuses'
      ? pageHead(
          'ბონუსები, პრემიები და ჯარიმები',
          'თანამშრომლების ბონუსები, პრემიები და ჯარიმები თვის მიხედვით.',
        )
      : pageHead(
          'თვის ხელფასები',
          'თანამშრომლების თვის ხელფასები, ბონუსები, პრემიები და ჯარიმები.',
        ),
  component: MonthlyPayrollPage,
})
