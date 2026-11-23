import { useRef } from 'react'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  IconBell,
  IconBellRinging,
  IconChecks,
  IconTrash,
} from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Spinner } from '#/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { ConfirmModalContent } from '#/components/common/confirm-modal-content'
import { DataPagination } from '#/components/common/data-pagination'
import { useModal } from '#/hooks/use-modal'
import { notificationsQueryOptions } from '../notifications.queries'
import type { NotificationItem } from '../notifications.types'
import {
  useDeleteAllNotifications,
  useDeleteNotification,
  useMarkAllNotificationsSeen,
} from '../hooks/use-mark-notifications-seen'
import { NotificationsFeed } from '../components/notifications-feed'

const authenticatedRoute = getRouteApi('/_authenticated')
const notificationsRoute = getRouteApi('/_authenticated/notifications')
const pageSize = 20

export function NotificationsPage() {
  const { actor } = authenticatedRoute.useRouteContext()
  const { page, filter } = notificationsRoute.useSearch()
  const navigate = useNavigate({ from: '/notifications' })
  const offset = (page - 1) * pageSize
  const unreadOnly = filter === 'unread'
  const query = useQuery(
    notificationsQueryOptions(actor.id, pageSize, offset, {
      scope: 'all',
      unreadOnly,
    }),
  )
  const markAllSeen = useMarkAllNotificationsSeen(actor.id)
  const deleteNotification = useDeleteNotification(actor.id)
  const deleteAllNotifications = useDeleteAllNotifications(actor.id)
  const { openModal } = useModal()
  const submittingDelete = useRef(false)
  const unseenCount = query.isError ? 0 : (query.data?.unseenCount ?? 0)
  const totalCount = query.isError ? 0 : (query.data?.totalCount ?? 0)
  const anyDeletePending =
    deleteAllNotifications.isPending || deleteNotification.pendingIds.length > 0

  const handleDeleteRequest = (item: NotificationItem) => {
    openModal(
      <ConfirmModalContent
        confirmLabel="წაშლა"
        confirmVariant="destructive"
        submitting={submittingDelete}
        body={
          <div className="rounded-xl border bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium wrap-anywhere text-foreground">
              {item.title}
            </p>
            <p className="mt-1 text-xs wrap-anywhere text-muted-foreground">
              {item.body}
            </p>
          </div>
        }
        onConfirm={async () => {
          const currentCount = query.data?.items.length ?? 0
          await deleteNotification.mutateAsync(item.id)
          if (page > 1 && currentCount <= 1) {
            void navigate({ search: { page: page - 1, filter } })
          }
          return true
        }}
      />,
      {
        title: 'შეტყობინების წაშლა',
        description:
          'შეტყობინება წაიშლება მხოლოდ თქვენი სიიდან და აღარ აღდგება.',
        canClose: () => !submittingDelete.current,
      },
    )
  }

  const handleDeleteAllRequest = () => {
    openModal(
      <ConfirmModalContent
        confirmLabel="ყველას წაშლა"
        confirmVariant="destructive"
        submitting={submittingDelete}
        onConfirm={async () => {
          await deleteAllNotifications.mutateAsync()
          if (page > 1) {
            void navigate({ search: { page: 1, filter } })
          }
          return true
        }}
      />,
      {
        title: 'ყველა შეტყობინების წაშლა',
        description:
          'ყველა შეტყობინება წაიშლება მხოლოდ თქვენი სიიდან და აღარ აღდგება.',
        canClose: () => !submittingDelete.current,
      },
    )
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            შეტყობინებები
          </h1>
          {query.data && !query.isError ? (
            <Badge variant={unseenCount > 0 ? 'accent' : 'green'}>
              {unseenCount > 0 ? `${unseenCount} წაუკითხავი` : 'ყველა ნანახია'}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            depth="raised"
            disabled={
              unseenCount === 0 ||
              markAllSeen.isPending ||
              markAllSeen.pendingIds.length > 0 ||
              anyDeletePending ||
              query.isError
            }
            aria-busy={markAllSeen.isPending}
            onClick={() => markAllSeen.mutate([])}
          >
            {markAllSeen.isPending ? (
              <Spinner aria-hidden="true" />
            ) : (
              <IconChecks data-icon="inline-start" aria-hidden="true" />
            )}
            ყველას ნანახად მონიშვნა
          </Button>
          <Button
            variant="destructive"
            depth="raised"
            disabled={
              totalCount === 0 ||
              markAllSeen.isPending ||
              markAllSeen.pendingIds.length > 0 ||
              anyDeletePending ||
              query.isError
            }
            aria-busy={deleteAllNotifications.isPending}
            onClick={handleDeleteAllRequest}
          >
            {deleteAllNotifications.isPending ? (
              <Spinner aria-hidden="true" />
            ) : (
              <IconTrash data-icon="inline-start" aria-hidden="true" />
            )}
            ყველას წაშლა
          </Button>
        </div>
      </header>

      <Tabs
        value={filter}
        onValueChange={(next) => {
          if (next === 'all' || next === 'unread') {
            void navigate({
              search: { page: 1, filter: next },
            })
          }
        }}
      >
        <TabsList className="gap-1 group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="all" className="h-9 px-4">
            <IconBell aria-hidden="true" />
            ყველა
          </TabsTrigger>
          <TabsTrigger value="unread" className="h-9 px-4">
            <IconBellRinging aria-hidden="true" />
            წაუკითხავი
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="min-w-0 gap-0 overflow-hidden rounded-2xl border py-0 ring-0">
        <CardContent className="p-0">
          <NotificationsFeed
            actorId={actor.id}
            limit={pageSize}
            offset={offset}
            scope="all"
            unreadOnly={unreadOnly}
            variant="page"
            deletingIds={deleteNotification.pendingIds}
            onDelete={handleDeleteRequest}
          />
        </CardContent>
        {query.data && !query.isError ? (
          <div className="border-t bg-muted/15 px-4 py-3 sm:px-6">
            <DataPagination
              page={page}
              total={totalCount}
              pageSize={pageSize}
              renderLink={(nextPage) => (
                <Link to="/notifications" search={{ page: nextPage, filter }} />
              )}
            />
          </div>
        ) : null}
      </Card>
    </div>
  )
}
