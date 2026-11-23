import { Link } from '@tanstack/react-router'
import {
  IconArrowUpRight,
  IconCalendarClock,
  IconClock,
  IconClipboardList,
} from '@tabler/icons-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { hasEveryPermission } from '#/lib/authorization/permissions'
import type { PermissionOverrides, Role } from '#/lib/authorization/permissions'

/** The employee attendance workspace enforces company or assigned-employee scope on the server. */
export function UserWorkRecordsCard({
  roles,
  permissionOverrides,
  userId,
}: {
  roles: ReadonlyArray<Role>
  permissionOverrides?: PermissionOverrides
  userId: string
}) {
  const canReadCompany = hasEveryPermission({ roles, permissionOverrides }, [
    'manage.access',
    'attendance.read.all',
  ])
  const canReadAttendance =
    canReadCompany ||
    hasEveryPermission({ roles, permissionOverrides }, [
      'manage.access',
      'attendance.read.team',
    ])
  const canReviewTimesheets =
    canReadCompany ||
    hasEveryPermission({ roles, permissionOverrides }, [
      'manage.access',
      'timesheets.review.team',
    ])
  if (!canReadAttendance && !canReviewTimesheets) return null

  return (
    <Card className="rounded-2xl py-4 sm:py-5">
      <CardHeader className="px-4 sm:px-5">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/70 text-muted-foreground">
            <IconClipboardList className="size-4" aria-hidden="true" />
          </span>
          <h2>სამუშაო ჩანაწერები</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2.5 px-4 sm:grid-cols-2 sm:px-5">
        {canReadAttendance ? (
          <Button
            variant="outline"
            depth="raised"
            nativeButton={false}
            role="link"
            className="group/link h-auto min-w-0 justify-start gap-3 rounded-xl px-4 py-3.5 whitespace-normal"
            render={
              <Link to="/manage/attendance/$userId" params={{ userId }} />
            }
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/70 text-muted-foreground">
              <IconCalendarClock className="size-4" aria-hidden="true" />
            </span>
            <span className="flex-1 text-start font-medium">
              დასწრების ჩანაწერები
            </span>
            <IconArrowUpRight
              className="size-4 text-muted-foreground transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
              aria-hidden="true"
            />
          </Button>
        ) : null}
        {canReviewTimesheets ? (
          <Button
            variant="outline"
            depth="raised"
            nativeButton={false}
            role="link"
            className="group/link h-auto min-w-0 justify-start gap-3 rounded-xl px-4 py-3.5 whitespace-normal"
            render={
              <Link
                to="/manage/attendance/$userId"
                params={{ userId }}
                search={{ view: 'timesheet' }}
              />
            }
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/70 text-muted-foreground">
              <IconClock className="size-4" aria-hidden="true" />
            </span>
            <span className="flex-1 text-start font-medium">
              სამუშაო საათები
            </span>
            <IconArrowUpRight
              className="size-4 text-muted-foreground transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
              aria-hidden="true"
            />
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
