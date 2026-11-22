import { IconPlus, IconX } from '@tabler/icons-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Separator } from '#/components/ui/separator'
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
    <Card size="sm">
      <CardContent
        role="group"
        aria-label="რუკის ნიშნების განმარტება"
        className="flex flex-col gap-4 py-1"
      >
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div
            role="group"
            aria-label="სამუშაოს ტიპები"
            className="flex flex-col gap-2"
          >
            <span className="text-xs font-medium text-muted-foreground">
              სამუშაოს ტიპები
            </span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {Object.entries(jobKinds).map(([kind, item]) => {
                const Icon = item.icon
                return (
                  <span
                    key={kind}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-lg border"
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
            className="flex flex-col gap-2"
          >
            <span className="text-xs font-medium text-muted-foreground">
              სამუშაოს სტატუსები
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {jobStatusSchema.options.map((status) => (
                <JobStatusBadge key={status} status={status} />
              ))}
            </div>
          </div>
        </div>

        {showGps ? (
          <>
            <Separator />
            <GpsMapLegendSections />
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
