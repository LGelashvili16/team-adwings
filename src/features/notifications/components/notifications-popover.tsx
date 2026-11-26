import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  IconArrowRight,
  IconBell,
  IconBellRinging,
  IconChecks,
  IconInbox,
  IconTrash,
} from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Separator } from '#/components/ui/separator'
import { Spinner } from '#/components/ui/spinner'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '#/components/ui/popover'
import { notificationsQueryOptions } from '../notifications.queries'
import {
  useClearNotificationsPopup,
  useMarkAllNotificationsSeen,
} from '../hooks/use-mark-notifications-seen'
import { NotificationsFeed } from './notifications-feed'

export function NotificationsPopover({ actorId }: { actorId: string }) {
  const [open, setOpen] = useState(false)
  const query = useQuery(
    notificationsQueryOptions(actorId, 5, 0, { scope: 'popup' }),
  )
  const markSeen = useMarkAllNotificationsSeen(actorId)
  const clearPopup = useClearNotificationsPopup(actorId)
  const unseenCount = query.isError ? 0 : (query.data?.unseenCount ?? 0)
  const hasPopupItems = !query.isError && (query.data?.items.length ?? 0) > 0
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="relative size-[2.625rem] rounded-xl"
          />
        }
        aria-label={
          unseenCount > 0 ? 'შეტყობინებები, ახალი შეტყობინება' : 'შეტყობინებები'
        }
      >
        {unseenCount > 0 ? (
          <IconBellRinging aria-hidden="true" />
        ) : (
          <IconBell aria-hidden="true" />
        )}
        {unseenCount > 0 ? (
          <span
            aria-hidden="true"
            data-slot="notification-unread-dot"
            className="absolute top-2 right-2 size-2 rounded-full bg-destructive ring-2 ring-background"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        className="max-h-[min(36rem,var(--available-height))] w-[min(27rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-2xl p-0 shadow-xl motion-reduce:animate-none"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 bg-muted/15 px-4 py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background text-muted-foreground shadow-xs"
            >
              <IconInbox className="size-4" />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <PopoverTitle className="text-sm font-semibold tracking-tight">
                შეტყობინებები
              </PopoverTitle>
              {query.data && !query.isError ? (
                <Badge variant={unseenCount > 0 ? 'accent' : 'secondary'}>
                  {unseenCount > 0
                    ? `${unseenCount} წაუკითხავი`
                    : 'ყველა ნანახია'}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              depth="raised"
              size="icon-sm"
              className="size-9 rounded-xl"
              aria-label="ყველა შეტყობინების ნანახად მონიშვნა"
              title="ყველა შეტყობინების ნანახად მონიშვნა"
              disabled={
                unseenCount === 0 ||
                markSeen.isPending ||
                markSeen.pendingIds.length > 0 ||
                clearPopup.isPending ||
                query.isError
              }
              aria-busy={markSeen.isPending}
              onClick={() => markSeen.mutate([])}
            >
              {markSeen.isPending ? (
                <Spinner aria-hidden="true" />
              ) : (
                <IconChecks aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="outline"
              depth="raised"
              size="icon-sm"
              className="size-9 rounded-xl"
              aria-label="ყველას გასუფთავება"
              title="ყველას გასუფთავება"
              disabled={
                !hasPopupItems ||
                clearPopup.isPending ||
                markSeen.isPending ||
                query.isError
              }
              aria-busy={clearPopup.isPending}
              onClick={() => clearPopup.mutate()}
            >
              {clearPopup.isPending ? (
                <Spinner aria-hidden="true" />
              ) : (
                <IconTrash aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
        <Separator className="shrink-0" />
        <div className="app-scrollbar min-h-0 overflow-y-auto overscroll-contain">
          {open ? (
            <NotificationsFeed
              actorId={actorId}
              scope="popup"
              onNavigate={() => setOpen(false)}
            />
          ) : null}
        </div>
        <Separator className="shrink-0" />
        <div className="flex shrink-0 items-center justify-between gap-3 bg-muted/15 px-4 py-2">
          <span className="text-xs text-muted-foreground">
            ბოლო შეტყობინებები
          </span>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-xs font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            ყველას ნახვა
            <IconArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
