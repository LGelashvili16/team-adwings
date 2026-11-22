import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
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

export function AnnouncementDialog({
  value,
  preview,
  loading = false,
  error = false,
  actorId,
  automatic = false,
  onClose,
  progress,
}: {
  value?: AnnouncementDetail | null
  preview?: AnnouncementListItem
  loading?: boolean
  error?: boolean
  actorId: string
  automatic?: boolean
  onClose: () => void
  progress?: { current: number; total: number }
}) {
  const client = useQueryClient()
  const deferOnClose = Boolean(
    value &&
    (automatic || (value.showOnLogin && value.isRecipient && !value.readAt)),
  )
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
    if (mutation.isPending) return
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
        className="flex max-h-[90dvh] flex-col sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
          {publishedAt ? (
            <DialogDescription>
              {formatAnnouncementDate(publishedAt)}
            </DialogDescription>
          ) : loading ? (
            <Skeleton className="h-4 w-36" aria-hidden="true" />
          ) : null}
          {progress ? (
            <p role="status" className="text-sm text-muted-foreground">
              განცხადება {progress.current} / {progress.total}
            </p>
          ) : null}
        </DialogHeader>
        {value ? (
          <p className="min-h-24 overflow-y-auto text-sm leading-7 whitespace-pre-wrap wrap-anywhere">
            {value.body}
          </p>
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
          <p className="shrink-0 text-sm text-muted-foreground">
            დახურული განცხადება შემდეგი შესვლისას კვლავ გამოჩნდება.
          </p>
        ) : null}
        <DialogFooter className="shrink-0">
          <Button
            depth="raised"
            variant="outline"
            onClick={close}
            disabled={mutation.isPending}
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
              disabled={mutation.isPending}
              aria-busy={mutation.isPending && mutation.variables === 'read'}
            >
              {mutation.isPending && mutation.variables === 'read' ? (
                <Spinner aria-hidden="true" />
              ) : null}
              წავიკითხე
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
