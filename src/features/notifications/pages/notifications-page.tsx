import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { IconBell, IconBellRinging, IconChecks } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Spinner } from '#/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { DataPagination } from '#/components/common/data-pagination'
import { notificationsQueryOptions } from '../notifications.queries'
import { useMarkAllNotificationsSeen } from '../hooks/use-mark-notifications-seen'
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
  const unseenCount = query.isError ? 0 : (query.data?.unseenCount ?? 0)
  const totalCount = query.isError ? 0 : (query.data?.totalCount ?? 0)

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
        <Button
          variant="outline"
          depth="raised"
          disabled={
            unseenCount === 0 ||
            markAllSeen.isPending ||
            markAllSeen.pendingIds.length > 0 ||
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
        <TabsList>
          <TabsTrigger value="all">
            <IconBell aria-hidden="true" />
            ყველა
          </TabsTrigger>
          <TabsTrigger value="unread">
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
          />
        </CardContent>
        {query.data && !query.isError ? (
          <div className="border-t bg-muted/15 px-4 py-3 sm:px-6">
            <DataPagination
              page={page}
              total={totalCount}
              pageSize={pageSize}
              renderLink={(nextPage) => (
                <Link
                  to="/notifications"
                  search={{ page: nextPage, filter }}
                />
              )}
            />
          </div>
        ) : null}
      </Card>
    </div>
  )
}
