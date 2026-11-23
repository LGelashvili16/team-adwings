import { useId } from 'react'
import {
  IconBriefcase,
  IconChevronRight,
  IconMapPin,
  IconSearch,
} from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Separator } from '#/components/ui/separator'
import { Skeleton } from '#/components/ui/skeleton'
import { jobKinds } from '../jobs.presentation'
import { JobStatusBadge } from './job-status-badge'
import type {
  JobMapSearchModel,
  MapSearchItem,
} from '../hooks/use-job-map-search'

function ResultGroup({
  title,
  icon: GroupIcon,
  items,
  loading,
  error,
  hint,
  onSelect,
}: {
  title: string
  icon: typeof IconMapPin
  items: Array<MapSearchItem>
  loading: boolean
  error: boolean
  hint: string
  onSelect: (item: MapSearchItem) => void
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5 py-1">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <h3
          id={headingId}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <GroupIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {title}
        </h3>
        {!loading && !error && items.length > 0 ? (
          <Badge
            variant="secondary"
            className="h-4.5 px-1.5 text-[11px] tabular-nums"
          >
            {items.length}
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <div
          role="status"
          aria-busy="true"
          className="flex flex-col gap-2 px-1.5 pb-1"
        >
          <span className="sr-only">შედეგები იტვირთება</span>
          <Skeleton className="h-12 w-full rounded-lg" aria-hidden="true" />
          <Skeleton className="h-12 w-4/5 rounded-lg" aria-hidden="true" />
        </div>
      ) : error ? (
        <Alert variant="destructive" className="mx-1.5 w-auto">
          <AlertDescription>
            ძიება დროებით მიუწვდომელია. სცადეთ ხელახლა მოგვიანებით.
          </AlertDescription>
        </Alert>
      ) : items.length ? (
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon =
              item.type === 'location'
                ? IconMapPin
                : jobKinds[item.job.kind].icon
            return (
              <Button
                data-search-result
                key={item.key}
                type="button"
                variant="ghost"
                className="group h-auto w-full justify-start gap-3 rounded-lg px-2 py-2 text-left whitespace-normal hover:bg-accent/70"
                onClick={() => onSelect(item)}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/70 text-muted-foreground"
                  style={
                    item.type === 'job'
                      ? jobKinds[item.job.kind].markerStyle
                      : undefined
                  }
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm leading-snug font-medium break-words text-foreground">
                    {item.label}
                  </span>
                  {item.type === 'location' &&
                  item.location.labelKa &&
                  item.location.labelEn ? (
                    <span
                      lang="en"
                      className="text-xs leading-snug text-muted-foreground"
                    >
                      {item.location.labelEn}
                    </span>
                  ) : item.type === 'job' ? (
                    <span className="text-xs leading-snug text-muted-foreground">
                      {jobKinds[item.job.kind].label}
                      {item.job.address ? ' · ' + item.job.address : ''}
                    </span>
                  ) : null}
                  {item.type === 'job' ? (
                    <span className="pt-0.5">
                      <JobStatusBadge status={item.job.status} />
                    </span>
                  ) : null}
                </span>
                <IconChevronRight
                  className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Button>
            )
          })}
        </div>
      ) : (
        <div className="mx-1 flex items-start gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <IconSearch className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>{hint}</p>
        </div>
      )}
    </section>
  )
}

export function JobMapSearchResults({
  model,
  onSelect,
}: {
  model: JobMapSearchModel
  onSelect: (item: MapSearchItem) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <ResultGroup
        title="ქუჩები და მისამართები"
        icon={IconMapPin}
        onSelect={onSelect}
        items={model.locations}
        loading={model.addressLoading}
        error={model.addressError}
        hint={
          model.query.length < 3
            ? 'შეიყვანეთ მინიმუმ 3 სიმბოლო, ქართულად ან ინგლისურად.'
            : 'მისამართი ვერ მოიძებნა. სცადეთ ქალაქის სახელის დამატება.'
        }
      />
      <Separator />
      <ResultGroup
        title="სამუშაოები"
        icon={IconBriefcase}
        onSelect={onSelect}
        items={model.work}
        loading={model.jobsLoading}
        error={model.jobsError}
        hint={
          model.query.length < 2
            ? 'სამუშაოს მოსაძებნად შეიყვანეთ მინიმუმ 2 სიმბოლო.'
            : 'ამ ფილტრებით შესაბამისი სამუშაო ვერ მოიძებნა.'
        }
      />
    </div>
  )
}
