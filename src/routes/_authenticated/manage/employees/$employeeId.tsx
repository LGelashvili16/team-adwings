import { createFileRoute } from '@tanstack/react-router'
import { UserDetailPage } from '#/features/access/pages/user-detail-page'
import { accessContent } from '#/features/access/access.content'
import { pageHead } from '#/lib/page-head'
import { requirePagePermission } from '#/lib/auth/auth.functions'
import { z } from 'zod'
import { recordIdSchema } from '#/lib/route-schemas'
import { employmentSearchSchema } from '#/features/employees/employment.schemas'

export const Route = createFileRoute(
  '/_authenticated/manage/employees/$employeeId',
)({
  validateSearch: employmentSearchSchema,
  params: {
    parse: (params) => z.object({ employeeId: recordIdSchema }).parse(params),
  },
  beforeLoad: () =>
    requirePagePermission({ data: { permission: 'employees.manage' } }),
  head: () =>
    pageHead(
      accessContent.userDetail.title,
      accessContent.userDetail.description,
    ),
  component: UserDetailPage,
})
