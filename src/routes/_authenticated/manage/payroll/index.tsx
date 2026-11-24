import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '#/lib/page-head'
import { requireSalaryWorkspace } from '#/features/payroll/salary.access'
import { salaryDirectorySchema } from '#/features/payroll/salary.schemas'
import { SalaryDirectoryPage } from '#/features/payroll/pages/salary-directory-page'

export const Route = createFileRoute('/_authenticated/manage/payroll/')({
  validateSearch: salaryDirectorySchema,
  beforeLoad: ({ context }) => requireSalaryWorkspace(context.actor),
  head: () =>
    pageHead('ხელფასები', 'თანამშრომლების შეთანხმებული ხელფასების მართვა.'),
  component: SalaryDirectoryPage,
})
