import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import {
  IconCalendarDollar,
  IconChecklist,
  IconMoneybagPlus,
  IconSettings,
  IconUserDollar,
} from '@tabler/icons-react'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import {
  hasAnyPermission,
  hasPermission,
} from '#/lib/authorization/permissions'
import type { Actor } from '#/lib/authorization/actor'

const tabs = [
  {
    value: 'monthly',
    to: '/manage/payroll/monthly',
    label: 'ხელფასის გაცემა',
    icon: IconCalendarDollar,
    permission: 'payroll.read.all',
  },
  {
    value: 'employees',
    to: '/manage/payroll',
    label: 'ანაზღაურება',
    icon: IconUserDollar,
    permission: 'payroll.read.all',
  },
  {
    value: 'adjustments',
    to: '/manage/payroll/monthly',
    label: 'ბონუსები / პრემიები / ჯარიმები',
    icon: IconMoneybagPlus,
    permission: 'payroll.read.all',
  },
  {
    value: 'review',
    to: '/manage/payroll/review',
    label: 'დასწრებით გამოთვლები',
    icon: IconChecklist,
    permission: ['payroll.read.all', 'payroll.attendance.review'],
  },
  {
    value: 'settings',
    to: '/manage/payroll/settings',
    label: 'პარამეტრები',
    icon: IconSettings,
    permission: 'payroll.configure',
  },
] as const
export function PayrollNavigation({
  actor,
  active,
  month,
}: {
  actor: Actor
  active: (typeof tabs)[number]['value']
  month?: string
}) {
  const railRef = useRef<HTMLElement>(null)
  useEffect(() => {
    // Synchronize the horizontal tab rail with route selection without scrolling the page.
    const rail = railRef.current,
      selected = rail?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!rail || !selected) return
    const bounds = rail.getBoundingClientRect(),
      item = selected.getBoundingClientRect()
    if (item.right > bounds.right)
      rail.scrollLeft += item.right - bounds.right + 4
    else if (item.left < bounds.left)
      rail.scrollLeft -= bounds.left - item.left + 4
  }, [active])
  const visibleTabs = tabs.filter((item) =>
    typeof item.permission === 'string'
      ? hasPermission(actor, item.permission)
      : hasAnyPermission(actor, item.permission),
  )
  if (visibleTabs.length <= 1) return null
  return (
    <Tabs value={active} className="min-w-0">
      <nav
        ref={railRef}
        aria-label="ხელფასების განყოფილებები"
        className="-m-1 overflow-x-auto p-1"
      >
        <TabsList className="w-max gap-1 rounded-xl border p-0.5 group-data-horizontal/tabs:h-auto">
          {visibleTabs.map(({ value, to, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                nativeButton={false}
                value={value}
                className="h-9 px-4"
                render={
                  <Link
                    to={to}
                    search={
                      to === '/manage/payroll/monthly'
                        ? {
                            month,
                            view:
                              value === 'adjustments' ? 'bonuses' : undefined,
                          }
                        : to === '/manage/payroll/review'
                          ? { month, page: 1, q: '', onlyFlagged: false }
                          : undefined
                    }
                    aria-current={value === active ? 'page' : undefined}
                  />
                }
              >
                <Icon aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
        </TabsList>
      </nav>
    </Tabs>
  )
}
