import { useState } from 'react'
import './job-marker.css'
import { useQuery } from '@tanstack/react-query'
import {
  IconArrowRight,
  IconMapPin,
  IconUser,
  IconUserPlus,
  IconCalendarDue,
  IconExclamationMark,
} from '@tabler/icons-react'
import { Button } from '#/components/ui/button'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Skeleton } from '#/components/ui/skeleton'
import { Separator } from '#/components/ui/separator'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from '#/components/ui/context-menu'
import { cn } from '#/lib/utils'
import { jobQueryOptions } from '../jobs.queries'
import { jobKinds, jobStatuses } from '../jobs.presentation'
import { jobIndicators } from '../jobs.indicators'
import { Badge } from '#/components/ui/badge'
import { useMapLongPress } from '../hooks/use-map-long-press'
import { JobStatusBadge } from './job-status-badge'
import { JobKindBadge } from './job-kind-badge'
import { formatJobDay } from '../jobs.dates'
import { JobActionDialog, JobActions } from './job-actions'
import type { JobAction } from './job-actions'
import type { Actor } from '#/lib/authorization/actor'
import type { JobMarker as Marker } from '../jobs.types'

const jobPinPath =
  'M22 1C8 1 1 8 1 22c0 10 4 16 12 20 4 2 7 6 9 9 2-3 5-7 9-9 8-4 12-10 12-20C43 8 36 1 22 1Z'

export function JobMarker({
  pin,
  actor,
  selected,
  onSelect,
  now = Date.now(),
}: {
  pin: Marker
  actor: Actor
  selected: boolean
  onSelect: (id: string) => void
  now?: number
}) {
  const [open, setOpen] = useState(false)
  const [pulseMountedAt] = useState(() => Date.now())
  const [action, setAction] = useState<JobAction | null>(null)
  const hold = useMapLongPress()
  const status = jobStatuses[pin.status]
  const kind = jobKinds[pin.kind]
  const markerStyle =
    pin.status === 'completed'
      ? jobStatuses.completed.markerStyle
      : kind.markerStyle
  const Icon = kind.icon
  const StatusIcon = status.icon
  const indicators = jobIndicators(pin, now)
  const DeadlineIcon = indicators.isOverdue
    ? IconExclamationMark
    : IconCalendarDue
  const deadlineLabel = indicators.isOverdue
    ? ', ვადაგადაცილებული'
    : indicators.dueTomorrow
      ? ', ვადა ხვალ'
      : ''
  const indicatorLabel = `${deadlineLabel}${indicators.isNew ? ', ახალი' : ''}`
  return (
    <>
      <ContextMenu open={open} onOpenChange={setOpen}>
        <ContextMenuTrigger
          {...hold}
          data-job-marker
          className="job-pin-trigger"
        >
          <Button
            variant="ghost"
            className={cn(
              'relative size-11 rounded-2xl border-0 p-0 hover:bg-transparent aria-expanded:bg-transparent focus-visible:ring-0',
              indicators.pulse && 'job-new-pulse',
            )}
            style={{
              color: markerStyle.color,
              animationDelay: pin.createdAt
                ? `${-Math.max(0, pulseMountedAt - Date.parse(pin.createdAt))}ms`
                : undefined,
            }}
            aria-label={`${pin.title}, ${kind.label}, ${status.label}${indicatorLabel}`}
            aria-pressed={selected}
            aria-haspopup="menu"
            title={`${pin.title} · ${kind.label} · ${status.label}${indicatorLabel}`}
            onClick={(event) => {
              event.stopPropagation()
              if (!open) onSelect(pin.id)
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 44 52"
              className="job-pin-shape absolute inset-x-0 top-0 size-full overflow-visible drop-shadow-md"
            >
              <g
                fill="none"
                strokeLinejoin="round"
                className={cn(
                  'group-focus-visible/button:opacity-100',
                  !selected && 'opacity-0',
                )}
              >
                <path
                  d={jobPinPath}
                  stroke="white"
                  strokeOpacity=".75"
                  strokeWidth="14"
                />
                <path
                  d={jobPinPath}
                  stroke="black"
                  strokeOpacity=".5"
                  strokeWidth="6"
                />
              </g>
              <path
                d={jobPinPath}
                fill={markerStyle.backgroundColor}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            {indicators.isNew ? (
              <Badge
                variant="red-vivid"
                className="pointer-events-none absolute -top-7 left-1/2 z-20 -translate-x-1/2"
              >
                ახალი
              </Badge>
            ) : null}
            {indicators.dueTomorrow || indicators.isOverdue ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -top-1 -left-1 z-10 flex size-5 items-center justify-center rounded-full border-2 border-background',
                  indicators.isOverdue
                    ? 'bg-badge-red-vivid text-badge-red-vivid-foreground'
                    : 'bg-badge-crimson text-badge-crimson-foreground',
                )}
              >
                <DeadlineIcon className="size-3" />
              </span>
            ) : null}
            <Icon className="relative size-5" aria-hidden="true" />
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -bottom-0.5 z-10 flex size-5 items-center justify-center rounded-full border-2"
              style={{
                ...status.markerStyle,
                borderColor: 'var(--background)',
              }}
            >
              <StatusIcon className="size-3" />
            </span>
          </Button>
        </ContextMenuTrigger>
        {open ? (
          <JobMarkerMenu
            pin={pin}
            actor={actor}
            onSelect={onSelect}
            onAction={(next) => {
              setAction(next)
              setOpen(false)
            }}
          />
        ) : null}
      </ContextMenu>
      <JobActionDialog
        actor={actor}
        action={action}
        onClose={() => setAction(null)}
      />
    </>
  )
}

function JobMarkerMenu({
  pin,
  actor,
  onSelect,
  onAction,
}: {
  pin: Marker
  actor: Actor
  onSelect: (id: string) => void
  onAction: (action: JobAction) => void
}) {
  // Fetch permissions-relevant assignment/version only while the menu is open, using the shared detail cache.
  const query = useQuery(jobQueryOptions(actor.id, pin.id))
  const job = query.data
  return (
    <ContextMenuContent
      aria-label={`სამუშაო: ${job?.title ?? pin.title}`}
      className="w-80 max-w-[calc(100vw-2rem)]"
    >
      <ContextMenuGroup>
        <ContextMenuLabel className="flex flex-col gap-3 p-3 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job?.status ?? pin.status} />
            <JobKindBadge kind={job?.kind ?? pin.kind} />
          </span>
          <span className="font-semibold break-words text-foreground">
            {job?.title ?? pin.title}
          </span>
        </ContextMenuLabel>
        {query.isPending ? (
          <div
            role="status"
            aria-busy="true"
            className="flex flex-col gap-2 px-3 pb-3"
          >
            <span className="sr-only">სამუშაოს მოქმედებები იტვირთება</span>
            <Skeleton aria-hidden="true" className="h-4 w-full" />
            <Skeleton aria-hidden="true" className="h-4 w-2/3" />
            <Skeleton aria-hidden="true" className="h-4 w-3/4" />
            <Skeleton aria-hidden="true" className="h-4 w-1/2" />
          </div>
        ) : query.isError ? (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>
              მოქმედებები ვერ ჩაიტვირთა. გახსენით სამუშაოს დეტალები და სცადეთ
              ხელახლა.
            </AlertDescription>
          </Alert>
        ) : job ? (
          <div className="flex flex-col gap-2 px-3 pb-3 text-sm text-muted-foreground">
            {job.address ? (
              <p className="flex items-start gap-2">
                <IconMapPin
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="break-words">{job.address}</span>
              </p>
            ) : null}
            <p className="flex items-center gap-2">
              <IconUser className="size-4 shrink-0" aria-hidden="true" />
              {job.assigneeName ?? 'თავისუფალია'}
            </p>
            <p className="flex items-start gap-2">
              <IconUserPlus
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span className="min-w-0 break-words">
                დაამატა:{' '}
                <span className="text-foreground">{job.creatorName}</span>
              </span>
            </p>
            <p className="flex items-start gap-2">
              <IconCalendarDue
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                ვადა:{' '}
                {job.deadline ? (
                  <time
                    dateTime={job.deadline}
                    className="tabular-nums text-foreground"
                  >
                    {formatJobDay(job.deadline)}
                  </time>
                ) : (
                  'არ არის მითითებული'
                )}
              </span>
            </p>
          </div>
        ) : null}
        <Separator className="my-1" />
        <ContextMenuItem onClick={() => onSelect(pin.id)}>
          <IconArrowRight aria-hidden="true" />
          სამუშაოს დეტალები
        </ContextMenuItem>
        {job && !query.isError ? (
          <JobActions actor={actor} job={job} contextMenu onAction={onAction} />
        ) : null}
      </ContextMenuGroup>
    </ContextMenuContent>
  )
}
