import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  IconCalendar,
  IconCheck,
  IconInfoCircle,
  IconSpeakerphone,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { markAnnouncement } from '../announcements.functions'
import { announcementKeys } from '../announcements.queries'
import { formatAnnouncementDate } from '../announcements.format'
import { notificationKeys } from '#/features/notifications/notifications.queries'
import type {
  AnnouncementDetail,
  AnnouncementListItem,
} from '../announcements.types'

const DEFAULT_LOCK_DURATION_MS = 4000
const RING_RADIUS = 11
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function AnnouncementCountdown({
  remainingMs,
  totalMs,
}: {
  remainingMs: number
  totalMs: number
}) {
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs))
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000))
  const dashOffset = RING_CIRCUMFERENCE * (1 - ratio)

  return (
    <div
      className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground"
      aria-live="off"
    >
      <div className="relative flex size-7 shrink-0 items-center justify-center">
        <svg
          className="-rotate-90 size-7"
          viewBox="0 0 28 28"
          aria-hidden="true"
        >
          <circle
            cx="14"
            cy="14"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-muted-foreground/20"
          />
          <circle
            cx="14"
            cy="14"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className="text-primary transition-[stroke-dashoffset] duration-100 ease-linear motion-reduce:transition-none"
          />
        </svg>
        <span className="absolute text-[11px] font-semibold tabular-nums text-foreground">
          {seconds}
        </span>
      </div>
      <span className="tabular-nums">მოიცადეთ {seconds} წმ</span>
    </div>
  )
}

export function AnnouncementDialog({
  value,
  preview,
  loading = false,
  error = false,
  actorId,
  automatic = false,
  onClose,
  progress,
  lockDurationMs = DEFAULT_LOCK_DURATION_MS,
}: {
  value?: AnnouncementDetail | null
  preview?: AnnouncementListItem
  loading?: boolean
  error?: boolean
  actorId: string
  automatic?: boolean
  onClose: () => void
  progress?: { current: number; total: number }
  lockDurationMs?: number
}) {
  const client = useQueryClient()
  const deferOnClose = Boolean(
    value &&
    (automatic || (value.showOnLogin && value.isRecipient && !value.readAt)),
  )
  const shouldLock = Boolean(
    value && lockDurationMs > 0 && (automatic || !value.readAt),
  )
  const [remainingMs, setRemainingMs] = useState(
    shouldLock ? lockDurationMs : 0,
  )

  useEffect(() => {
    if (!shouldLock) {
      setRemainingMs(0)
      return
    }
    const deadline = Date.now() + lockDurationMs
    setRemainingMs(lockDurationMs)
    const timer = window.setInterval(() => {
      const next = Math.max(0, deadline - Date.now())
      setRemainingMs(next)
      if (next === 0) window.clearInterval(timer)
    }, 50)
    return () => window.clearInterval(timer)
  }, [shouldLock, lockDurationMs, value?.id])

  const locked = shouldLock && remainingMs > 0
  const progressRatio =
    shouldLock && lockDurationMs > 0
      ? Math.max(0, Math.min(1, remainingMs / lockDurationMs))
      : 0

  const mutation = useMutation({
    mutationFn: async (action: 'dismiss' | 'read') => {
      if (!value) return
      const result = await markAnnouncement({ data: { id: value.id, action } })
      if (!result.ok) throw new Error(result.message)
    },
    onSuccess: async (_, action) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: announcementKeys.all(actorId) }),
        client.invalidateQueries({ queryKey: notificationKeys.own(actorId) }),
      ])
      toast.success(
        action === 'read'
          ? 'განცხადება მონიშნულია წაკითხულად.'
          : 'განცხადება დახურულია.',
      )
      onClose()
    },
    onError: () => toast.error('მონიშვნა ვერ მოხერხდა. სცადეთ ხელახლა.'),
    retry: false,
  })
  function close() {
    if (locked || mutation.isPending) return
    if (deferOnClose) mutation.mutate('dismiss')
    else onClose()
  }
  const title = value?.title ?? preview?.title ?? 'განცხადება'
  const publishedAt = value?.publishedAt ?? preview?.publishedAt
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        {shouldLock ? (
          <div
            className="h-1 w-full shrink-0 overflow-hidden bg-muted/60"
            aria-hidden="true"
          >
            <div
              className="h-full w-full origin-left bg-primary transition-transform duration-100 ease-linear motion-reduce:transition-none"
              style={{ transform: `scaleX(${progressRatio})` }}
            />
          </div>
        ) : null}

        <DialogHeader className="shrink-0 border-b px-6 pt-5 pb-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <IconSpeakerphone className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-lg font-semibold leading-snug tracking-tight wrap-anywhere">
                  {title}
                </DialogTitle>
                {publishedAt ? (
                  <DialogDescription className="flex items-center gap-1.5 text-xs">
                    <IconCalendar
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {formatAnnouncementDate(publishedAt)}
                  </DialogDescription>
                ) : loading ? (
                  <Skeleton className="h-4 w-36" aria-hidden="true" />
                ) : null}
              </div>
            </div>
            {progress ? (
              <Badge
                role="status"
                variant="secondary"
                className="shrink-0 tabular-nums"
              >
                განცხადება {progress.current} / {progress.total}
              </Badge>
            ) : null}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {value ? (
            <div className="min-h-24 rounded-xl border border-border/60 bg-muted/20 p-4 sm:p-5">
              <p className="text-sm leading-7 whitespace-pre-wrap wrap-anywhere text-foreground/95">
                {value.body}
              </p>
            </div>
          ) : loading ? (
            <div
              role="status"
              aria-label="განცხადება იტვირთება"
              aria-busy="true"
              className="flex min-h-24 flex-col gap-2.5 py-1"
            >
              <Skeleton className="h-4 w-full" aria-hidden="true" />
              <Skeleton className="h-4 w-11/12" aria-hidden="true" />
              <Skeleton className="h-4 w-2/3" aria-hidden="true" />
            </div>
          ) : error ? (
            <div className="min-h-24">
              <Alert variant="destructive">
                <AlertDescription>
                  განცხადება ვერ ჩაიტვირთა. გადაამოწმეთ თქვენი წვდომა და სცადეთ
                  ხელახლა.
                </AlertDescription>
              </Alert>
            </div>
          ) : null}

          {deferOnClose ? (
            <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
              <IconInfoCircle className="size-4 shrink-0" aria-hidden="true" />
              დახურული განცხადება შემდეგი შესვლისას კვლავ გამოჩნდება.
            </p>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 flex-col gap-3 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center">
            {locked ? (
              <AnnouncementCountdown
                remainingMs={remainingMs}
                totalMs={lockDurationMs}
              />
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              depth="raised"
              variant="outline"
              onClick={close}
              disabled={locked || mutation.isPending}
              aria-busy={mutation.isPending && mutation.variables === 'dismiss'}
            >
              {mutation.isPending && mutation.variables === 'dismiss' ? (
                <Spinner aria-hidden="true" />
              ) : null}
              დახურვა
            </Button>
            {value && !value.readAt ? (
              <Button
                depth="raised"
                className="min-w-28"
                onClick={() => mutation.mutate('read')}
                disabled={locked || mutation.isPending}
                aria-busy={mutation.isPending && mutation.variables === 'read'}
              >
                {mutation.isPending && mutation.variables === 'read' ? (
                  <Spinner aria-hidden="true" />
                ) : (
                  <IconCheck aria-hidden="true" />
                )}
                წავიკითხე
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
