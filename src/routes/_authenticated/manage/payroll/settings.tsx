import { createFileRoute } from '@tanstack/react-router'
import { requirePagePermission } from '#/lib/auth/auth.functions'
import { pageHead } from '#/lib/page-head'
import { PayrollSettingsPage } from '#/features/payroll/pages/payroll-settings-page'

export const Route = createFileRoute('/_authenticated/manage/payroll/settings')(
  {
    beforeLoad: () =>
      requirePagePermission({ data: { permission: 'payroll.configure' } }),
    head: () =>
      pageHead(
        'ხელფასების პარამეტრები',
        'ანაზღაურების, საშემოსავლო გადასახადისა და საპენსიო შენატანების წესები.',
      ),
    component: PayrollSettingsPage,
  },
)
