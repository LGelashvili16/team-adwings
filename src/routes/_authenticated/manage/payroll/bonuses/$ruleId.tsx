import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '#/lib/page-head'
import { hasEveryPermission } from '#/lib/authorization/permissions'
import {
  bonusRuleHistorySchema,
  bonusRuleIdSchema,
} from '#/features/payroll/bonus-rules.schemas'
import { BonusRuleDetailPage } from '#/features/payroll/pages/bonus-rule-detail-page'

export const Route = createFileRoute(
  '/_authenticated/manage/payroll/bonuses/$ruleId',
)({
  params: { parse: (params) => bonusRuleIdSchema.parse(params) },
  validateSearch: bonusRuleHistorySchema,
  beforeLoad: ({ context }) => {
    if (
      !hasEveryPermission(context.actor, ['manage.access', 'payroll.configure'])
    )
      throw { status: 403, code: 'FORBIDDEN' }
  },
  head: () =>
    pageHead('წახალისების წესი', 'წახალისების პირობა და ცვლილებების ისტორია.'),
  component: BonusRuleDetailPage,
})
