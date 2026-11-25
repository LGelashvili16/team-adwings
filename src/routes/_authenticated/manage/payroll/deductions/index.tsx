import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireSalaryWorkspace } from '#/features/payroll/salary.access'

export const Route = createFileRoute(
  '/_authenticated/manage/payroll/deductions/',
)({
  beforeLoad: ({ context }) => {
    requireSalaryWorkspace(context.actor)
    throw redirect({
      to: '/manage/payroll/monthly',
      search: { view: 'bonuses' },
      replace: true,
    })
  },
})
