import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '#/lib/page-head'
import { requireSalaryWorkspace } from '#/features/payroll/salary.access'
import {
  salaryDetailSchema,
  salaryHistorySearchSchema,
} from '#/features/payroll/salary.schemas'
import { EmployeeSalaryPage } from '#/features/payroll/pages/salary-workspace-page'

export const Route = createFileRoute('/_authenticated/manage/payroll/$userId')({
  params: {
    parse: (params) => salaryDetailSchema.pick({ userId: true }).parse(params),
  },
  validateSearch: salaryHistorySearchSchema,
  beforeLoad: ({ context }) => requireSalaryWorkspace(context.actor),
  head: () =>
    pageHead(
      'თანამშრომლის ხელფასი',
      'შეთანხმებული ანაზღაურება და ცვლილებების ისტორია.',
    ),
  component: EmployeeSalaryPage,
})
