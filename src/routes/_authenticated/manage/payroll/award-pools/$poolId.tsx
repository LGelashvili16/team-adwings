import { createFileRoute } from '@tanstack/react-router'
import { hasEveryPermission } from '#/lib/authorization/permissions'
import { pageHead } from '#/lib/page-head'
import { awardHistorySchema } from '#/features/payroll/award-proposals.schemas'
import { poolIdSchema } from '#/features/payroll/award-review.schemas'
import { AwardPoolDetailPage } from '#/features/payroll/pages/award-pool-detail-page'

export const Route = createFileRoute(
  '/_authenticated/manage/payroll/award-pools/$poolId',
)({
  params: { parse: (params) => poolIdSchema.parse(params) },
  validateSearch: awardHistorySchema,
  beforeLoad: ({ context }) => {
    if (
      !hasEveryPermission(context.actor, ['manage.access', 'payroll.read.all'])
    )
      throw { status: 403, code: 'FORBIDDEN' }
  },
  head: () =>
    pageHead(
      'საერთო ფონდი',
      'ფონდის ბენეფიციარები, წილები და გადაწყვეტილებების ისტორია.',
    ),
  component: AwardPoolDetailPage,
})
