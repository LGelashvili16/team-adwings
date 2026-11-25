import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '#/lib/page-head'
import { salarySelfSearchSchema } from '#/features/payroll/salary.schemas'
import { MySalaryPage } from '#/features/payroll/pages/my-salary-page'

export const Route = createFileRoute('/_authenticated/payroll')({
  validateSearch: salarySelfSearchSchema,
  head: () => pageHead('ხელფასი', 'თქვენი თვის უწყისები და ხელფასის ისტორია.'),
  component: MySalaryPage,
})
