import { createFileRoute } from '@tanstack/react-router'
import { hasEveryPermission } from '#/lib/authorization/permissions'
import { pageHead } from '#/lib/page-head'
import { awardSearchSchema } from '#/features/payroll/award-proposals.schemas'
import { AwardProposalsPage } from '#/features/payroll/pages/award-proposals-page'

export const Route = createFileRoute('/_authenticated/manage/payroll/awards/')({
  validateSearch: awardSearchSchema,
  beforeLoad: ({ context }) => {
    if (
      !hasEveryPermission(context.actor, ['manage.access', 'payroll.read.all'])
    )
      throw { status: 403, code: 'FORBIDDEN' }
  },
  head: () =>
    pageHead(
      'წახალისების განაცხადები',
      'თანამშრომლების წახალისების ინდივიდუალური განაცხადები.',
    ),
  component: AwardProposalsPage,
})
