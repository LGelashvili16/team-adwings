import {
  IconBell,
  IconBellCheck,
  IconCheck,
  IconClock,
  IconDots,
  IconMail,
  IconTrash,
} from '@tabler/icons-react'
import { cn } from 'cn'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import type { NotificationItem } from '../notifications.types'
import { resolveNotificationLink } from '../notification-destination'
import { useIsMobile } from '#/hooks/use-mobile'
import { formatGeorgianDateTime } from '#/lib/date-format'

export function NotificationList({
  items,
  pendingIds,
  deletingIds,
  onMarkSeen,
  onMarkUnseen,
  onDelete,
  onNavigate,
  actorId = '',
  variant = 'popover',
}: {
  items: Array<NotificationItem>
  pendingIds: Array<string>
  deletingIds?: Array<string>
  onMarkSeen: (ids: Array<string>) => void
  onMarkUnseen: (ids: Array<string>) => void
  onDelete?: (item: NotificationItem) => void
  onNavigate?: () => void
  actorId?: string
  variant?: 'popover' | 'page'
}) {
  const isMobile = useIsMobile()

  return (
    <ul
      aria-label="შეტყობინებების სია"
      className={cn(
        'flex flex-col',
        variant === 'page' ? 'divide-y divide-border/70' : 'gap-1 p-2',
      )}
    >
      {items.map((item) => {
        const unseen = item.seenAt === null
        const pending = pendingIds.includes(item.id)
        const deleting = deletingIds?.includes(item.id) ?? false
        const rowBusy = pendingIds.length > 0 || (deletingIds?.length ?? 0) > 0
        const readActionLabel = unseen
          ? 'ნანახად მონიშვნა'
          : 'წაუკითხავად მონიშვნა'
        const ReadActionIcon = unseen ? IconCheck : IconMail
        const toggleRead = () => (unseen ? onMarkSeen : onMarkUnseen)([item.id])
        const linkTarget = resolveNotificationLink(item, actorId)
        const timestamp = (
          <time
            dateTime={item.createdAt}
            className={cn(
              'flex items-center gap-1.5 text-xs text-muted-foreground',
              variant === 'page' ? 'self-center' : 'mt-0.5',
            )}
          >
            <IconClock className="size-3 shrink-0" aria-hidden="true" />
            {formatGeorgianDateTime(item.createdAt, 'Asia/Tbilisi')}
          </time>
        )
        return (
          <li
            key={item.id}
            className={cn(
              'group relative gap-3 transition-colors motion-reduce:transition-none',
              variant === 'page'
                ? 'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start px-4 py-4 hover:bg-accent/55 focus-within:bg-accent/55 sm:px-6'
                : 'flex items-start rounded-xl px-3 py-3 hover:bg-accent/70 focus-within:bg-accent/70',
              unseen && (variant === 'page' ? 'bg-muted/20' : 'bg-muted/35'),
            )}
          >
            <div
              aria-hidden="true"
              data-slot="notification-item-icon"
              className={cn(
                'relative flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/70 text-muted-foreground',
                unseen && 'border-border bg-background text-primary shadow-xs',
              )}
            >
              {unseen ? (
                <IconBell className="size-4" />
              ) : (
                <IconBellCheck className="size-4" />
              )}
              {unseen ? (
                <span
                  data-slot="notification-item-unread-dot"
                  className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive ring-2 ring-popover"
                />
              ) : null}
            </div>
            {variant === 'page' ? timestamp : null}
            <div
              className={cn(
                'flex min-w-0 flex-1 flex-col gap-1',
                variant === 'page' && 'col-span-3 row-start-2 gap-2',
              )}
            >
              <p
                className={cn(
                  'text-sm leading-5 font-medium wrap-anywhere',
                  variant === 'page' && 'leading-6 font-semibold',
                  unseen || variant === 'page'
                    ? 'text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {linkTarget ? (
                  <Link
                    {...linkTarget}
                    onClick={onNavigate}
                    className="rounded-sm underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {item.title}
                  </Link>
                ) : (
                  item.title
                )}
                {unseen ? <span className="sr-only">, ახალი</span> : null}
              </p>
              <p
                className={cn(
                  'whitespace-pre-line wrap-anywhere text-muted-foreground',
                  variant === 'page'
                    ? 'text-sm leading-6'
                    : 'text-[0.8125rem] leading-5',
                )}
              >
                {item.body}
              </p>
              {variant === 'popover' ? timestamp : null}
              {!unseen ? <span className="sr-only">ნანახია</span> : null}
            </div>
            {variant === 'page' && isMobile ? (
              <div className="relative z-10 col-start-3 row-start-1">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 text-muted-foreground hover:bg-transparent aria-expanded:bg-transparent"
                        disabled={rowBusy}
                        aria-busy={pending || deleting}
                        aria-label={`შეტყობინების მოქმედებები: ${item.title}`}
                      >
                        {pending || deleting ? (
                          <Spinner aria-hidden="true" />
                        ) : (
                          <IconDots aria-hidden="true" />
                        )}
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        disabled={rowBusy}
                        onClick={toggleRead}
                        className="min-h-11"
                      >
                        <ReadActionIcon aria-hidden="true" />
                        {readActionLabel}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    {onDelete ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={rowBusy}
                            onClick={() => onDelete(item)}
                            className="min-h-11"
                          >
                            <IconTrash aria-hidden="true" />
                            წაშლა
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div
                className={cn(
                  'relative z-10 flex shrink-0 items-center justify-center self-center',
                  variant === 'page' && 'col-start-3 row-start-1',
                  onDelete && 'gap-1',
                )}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    'rounded-lg text-muted-foreground',
                    variant === 'page'
                      ? 'size-11'
                      : 'size-9 hover:bg-background/80 hover:text-foreground',
                  )}
                  disabled={rowBusy}
                  aria-busy={pending}
                  aria-label={`${readActionLabel}: ${item.title}`}
                  title={readActionLabel}
                  onClick={toggleRead}
                >
                  {pending ? (
                    <Spinner aria-hidden="true" />
                  ) : (
                    <ReadActionIcon aria-hidden="true" />
                  )}
                </Button>
                {onDelete ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={cn(
                      'rounded-lg text-muted-foreground',
                      variant === 'page'
                        ? 'size-11'
                        : 'size-9 hover:bg-destructive/10 hover:text-destructive',
                    )}
                    disabled={rowBusy}
                    aria-busy={deleting}
                    aria-label={`წაშლა: ${item.title}`}
                    title="წაშლა"
                    onClick={() => onDelete(item)}
                  >
                    {deleting ? (
                      <Spinner aria-hidden="true" />
                    ) : (
                      <IconTrash aria-hidden="true" />
                    )}
                  </Button>
                ) : null}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function NotificationsLoading({
  variant = 'popover',
}: {
  variant?: 'popover' | 'page'
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        'flex flex-col',
        variant === 'page' ? 'divide-y px-4 sm:px-6' : 'gap-2 px-5 py-4',
      )}
    >
      <span className="sr-only">შეტყობინებები იტვირთება</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className={cn(
            'gap-3',
            variant === 'page'
              ? 'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center py-4'
              : 'flex rounded-xl py-3',
          )}
        >
          <Skeleton className="size-9 shrink-0 rounded-xl motion-reduce:animate-none" />
          {variant === 'page' ? (
            <>
              <Skeleton className="h-3 w-full max-w-40 motion-reduce:animate-none" />
              <div className="flex gap-1">
                <Skeleton className="size-11 rounded-lg motion-reduce:animate-none" />
                <Skeleton className="hidden size-11 rounded-lg motion-reduce:animate-none md:block" />
              </div>
            </>
          ) : null}
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col gap-3',
              variant === 'page' && 'col-span-3',
            )}
          >
            <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-full motion-reduce:animate-none" />
            {variant === 'popover' ? (
              <Skeleton className="h-3 w-1/3 motion-reduce:animate-none" />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function NotificationsEmpty() {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 px-6 py-12 text-center"
    >
      <div
        className="flex size-16 items-center justify-center rounded-2xl border bg-muted/50"
        aria-hidden="true"
      >
        <IconBellCheck className="size-7 text-muted-foreground" />
      </div>
      <p className="font-medium">შეტყობინებები ჯერ არ გაქვთ</p>
    </div>
  )
}
