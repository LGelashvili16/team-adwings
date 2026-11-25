import {
  IconPlus,
  IconX,
  IconCalendarDue,
  IconExclamationMark,
  IconCheck,
  IconMap2,
} from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { GpsMapLegendSections } from '#/features/gps/components/gps-map-legend'
import { jobKinds } from '../jobs.presentation'
import { jobStatusSchema } from '../jobs.schemas'
import { JobStatusBadge } from './job-status-badge'
import type { ResolvedLocation } from '../job-locations.types'
import type { JobMapPosition } from '../jobs.types'

export function JobsMapOverlays({
  location,
  canCreate,
  onCreate,
  onLocation,
}: {
  location: ResolvedLocation | null
  canCreate: boolean
  onCreate: (position: JobMapPosition) => void
  onLocation: (location: ResolvedLocation | null) => void
}) {
  return (
    <>
      {location ? (
        <div className="absolute bottom-4 left-4 z-10 flex max-w-[calc(100%-6rem)] flex-wrap items-center gap-3 rounded-xl border bg-background p-3 shadow-sm">
          <p className="min-w-0 flex-1 text-sm leading-relaxed break-words">
            {location.labelKa ?? location.labelEn}
          </p>
          {canCreate ? (
            <Button
              onClick={() =>
                onCreate({
                  longitude: location.longitude,
                  latitude: location.latitude,
                  address: location.labelKa ?? location.labelEn ?? '',
                })
              }
            >
              <IconPlus aria-hidden="true" />
              სამუშაოს დამატება
            </Button>
          ) : null}
          <Button
            variant="outline"
            depth="raised"
            size="icon"
            aria-label="ნაპოვნი მდებარეობის დახურვა"
            onClick={() => onLocation(null)}
          >
            <IconX aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </>
  )
}

export function JobsMapLegend({ showGps = false }: { showGps?: boolean }) {
  return (
    <Card
      size="sm"
      role="group"
      aria-label="რუკის ნიშნების განმარტება"
      className="gap-0"
    >
      <CardHeader className="border-b pb-3">
        <CardTitle
          role="heading"
          aria-level={2}
          className="flex items-center gap-2.5"
        >
          <span
            className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <IconMap2 className="size-4" />
          </span>
          რუკის ნიშნები
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 py-4 md:grid-cols-2 xl:grid-cols-[1fr_1.25fr_1fr]">
        <div
          role="group"
          aria-label="სამუშაოს ტიპები"
          className="flex min-w-0 flex-col gap-3"
        >
          <span className="text-xs font-medium text-muted-foreground">
            სამუშაოს ტიპები
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {Object.entries(jobKinds).map(([kind, item]) => {
              const Icon = item.icon
              return (
                <span
                  key={kind}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg border shadow-xs"
                    style={item.markerStyle}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  {item.label}
                </span>
              )
            })}
          </div>
        </div>

        <div
          role="group"
          aria-label="სამუშაოს სტატუსები"
          className="flex min-w-0 flex-col gap-3 xl:border-x xl:px-5"
        >
          <span className="text-xs font-medium text-muted-foreground">
            სამუშაოს სტატუსები
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            {jobStatusSchema.options.map((status) => (
              <JobStatusBadge key={status} status={status} />
            ))}
          </div>
        </div>
        <div
          className="flex min-w-0 flex-col gap-3 text-sm"
          role="group"
          aria-label="სამუშაოს დამატებითი ნიშნები"
        >
          <span className="text-xs font-medium text-muted-foreground">
            დამატებითი ნიშნები
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-badge-crimson text-badge-crimson-foreground">
                <IconCalendarDue className="size-3.5" aria-hidden="true" />
              </span>
              ვადა ხვალ
            </span>
            <span className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-badge-red-vivid text-badge-red-vivid-foreground">
                <IconExclamationMark className="size-3.5" aria-hidden="true" />
              </span>
              ვადაგადაცილებული
            </span>
            <span className="flex items-center gap-2">
              <Badge variant="red-vivid">ახალი</Badge>ჯერ არ გაგიხსნიათ
            </span>
            <span className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-badge-green-foreground bg-badge-green text-badge-green-foreground">
                <IconCheck className="size-3.5" aria-hidden="true" />
              </span>
              დასრულებული სამუშაო
            </span>
          </div>
        </div>
      </CardContent>
      {showGps ? (
        <CardFooter className="py-4">
          <GpsMapLegendSections />
        </CardFooter>
      ) : null}
    </Card>
  )
}
