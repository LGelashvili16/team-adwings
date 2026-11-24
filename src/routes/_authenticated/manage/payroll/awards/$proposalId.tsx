import { createFileRoute } from '@tanstack/react-router'
import { hasEveryPermission } from '#/lib/authorization/permissions'
import { pageHead } from '#/lib/page-head'
import {
  awardHistorySchema,
  awardIdSchema,
} from '#/features/payroll/award-proposals.schemas'
import { AwardProposalDetailPage } from '#/features/payroll/pages/award-proposal-detail-page'

export const Route = createFileRoute(
  '/_authenticated/manage/payroll/awards/$proposalId',
)({
  params: { parse: (params) => awardIdSchema.parse(params) },
  validateSearch: awardHistorySchema,
  beforeLoad: ({ context }) => {
    if (
      !hasEveryPermission(context.actor, ['manage.access', 'payroll.read.all'])
    )
      throw { status: 403, code: 'FORBIDDEN' }
  },
  head: () =>
    pageHead(
      'წახალისების განაცხადი',
      'განაცხადის მტკიცებულება და ცვლილებების ისტორია.',
    ),
  component: AwardProposalDetailPage,
})
