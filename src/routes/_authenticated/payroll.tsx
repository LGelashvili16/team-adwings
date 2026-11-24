import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '#/lib/page-head'
import { salaryHistorySearchSchema } from '#/features/payroll/salary.schemas'
import { MySalaryPage } from '#/features/payroll/pages/salary-workspace-page'

export const Route = createFileRoute('/_authenticated/payroll')({
  validateSearch: salaryHistorySearchSchema,
  head: () =>
    pageHead('ხელფასი', 'თქვენი შეთანხმებული ხელფასი და ცვლილებების ისტორია.'),
  component: MySalaryPage,
})
