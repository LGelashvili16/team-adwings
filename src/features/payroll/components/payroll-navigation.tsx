import { Link } from '@tanstack/react-router'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { hasPermission } from '#/lib/authorization/permissions'
import type { Actor } from '#/lib/authorization/actor'

export function PayrollNavigation({
  actor,
  active,
}: {
  actor: Actor
  active: 'employees' | 'settings' | 'calendar' | 'bonuses' | 'awards'
}) {
  return (
    <Tabs value={active}>
      <nav
        aria-label="ხელფასების განყოფილებები"
        className="-m-1 overflow-x-auto p-1"
      >
        <TabsList className="w-max gap-1 rounded-xl border p-0.5 group-data-horizontal/tabs:h-auto">
          {hasPermission(actor, 'payroll.read.all') ? (
            <TabsTrigger
              nativeButton={false}
              value="employees"
              className="h-9 px-4"
              render={<Link to="/manage/payroll" />}
            >
              თანამშრომლები
            </TabsTrigger>
          ) : null}
          {hasPermission(actor, 'payroll.read.all') ? (
            <TabsTrigger
              nativeButton={false}
              value="awards"
              className="h-9 px-4"
              render={<Link to="/manage/payroll/awards" />}
            >
              განაცხადები
            </TabsTrigger>
          ) : null}
          {hasPermission(actor, 'payroll.configure') ? (
            <TabsTrigger
              nativeButton={false}
              value="bonuses"
              className="h-9 px-4"
              render={<Link to="/manage/payroll/bonuses" />}
            >
              წახალისება
            </TabsTrigger>
          ) : null}
          {hasPermission(actor, 'payroll.configure') ? (
            <TabsTrigger
              nativeButton={false}
              value="calendar"
              className="h-9 px-4"
              render={<Link to="/manage/payroll/calendar" />}
            >
              კალენდარი
            </TabsTrigger>
          ) : null}
          {hasPermission(actor, 'payroll.configure') ? (
            <TabsTrigger
              nativeButton={false}
              value="settings"
              className="h-9 px-4"
              render={<Link to="/manage/payroll/settings" />}
            >
              პარამეტრები
            </TabsTrigger>
          ) : null}
        </TabsList>
      </nav>
    </Tabs>
  )
}
