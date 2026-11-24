import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { notificationsQueryOptions } from '../notifications.queries'
import type { NotificationItem } from '../notifications.types'
import {
  useMarkNotificationsSeen,
  useMarkNotificationsUnseen,
} from '../hooks/use-mark-notifications-seen'
import {
  NotificationList,
  NotificationsEmpty,
  NotificationsLoading,
} from './notification-list'

export function NotificationsFeed({
  actorId,
  limit = 5,
  offset = 0,
  scope = 'all',
  unreadOnly = false,
  variant = 'popover',
  deletingIds,
  onDelete,
  onNavigate,
}: {
  actorId: string
  limit?: number
  offset?: number
  scope?: 'all' | 'popup'
  unreadOnly?: boolean
  variant?: 'popover' | 'page'
  deletingIds?: Array<string>
  onDelete?: (item: NotificationItem) => void
  onNavigate?: () => void
}) {
  const query = useQuery(
    notificationsQueryOptions(actorId, limit, offset, { scope, unreadOnly }),
  )
  const markSeen = useMarkNotificationsSeen(actorId)
  const markUnseen = useMarkNotificationsUnseen(actorId)
  if (query.isPending) return <NotificationsLoading variant={variant} />
  if (query.isError)
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 p-6 text-center"
      >
        <p className="text-sm text-muted-foreground">
          შეტყობინებები ვერ ჩაიტვირთა.
        </p>
        <Button
          variant="outline"
          depth="raised"
          disabled={query.isFetching}
          aria-busy={query.isFetching}
          onClick={async () => {
            const result = await query.refetch()
            if (result.isError)
              toast.error('შეტყობინებები ვერ ჩაიტვირთა. სცადეთ ხელახლა.')
            else toast.success('შეტყობინებები განახლდა.')
          }}
        >
          {query.isFetching ? <Spinner aria-hidden="true" /> : null}
          ხელახლა ცდა
        </Button>
      </div>
    )
  if (query.data.items.length === 0) return <NotificationsEmpty />
  return (
    <NotificationList
      actorId={actorId}
      variant={variant}
      onNavigate={onNavigate}
      items={query.data.items}
      pendingIds={markSeen.pendingIds}
      deletingIds={deletingIds}
      onMarkSeen={(ids) => markSeen.mutate(ids)}
      onMarkUnseen={(ids) => markUnseen.mutate(ids)}
      onDelete={onDelete}
    />
  )
}
