import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '#/lib/page-head'
import { hasEveryPermission } from '#/lib/authorization/permissions'
import { bonusRuleSearchSchema } from '#/features/payroll/bonus-rules.schemas'
import { BonusRulesPage } from '#/features/payroll/pages/bonus-rules-page'

export const Route = createFileRoute('/_authenticated/manage/payroll/bonuses/')(
  {
    validateSearch: bonusRuleSearchSchema,
    beforeLoad: ({ context }) => {
      if (
        !hasEveryPermission(context.actor, [
          'manage.access',
          'payroll.configure',
        ])
      )
        throw { status: 403, code: 'FORBIDDEN' }
    },
    head: () =>
      pageHead(
        'წახალისების წესები',
        'ბონუსებისა და პრემიების დათარიღებული პირობები.',
      ),
    component: BonusRulesPage,
  },
)
