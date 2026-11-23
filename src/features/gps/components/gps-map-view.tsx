import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconFocus2, IconGps, IconSearch } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Map, MapControls, useMap } from '#/components/ui/map'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import { gpsKey, gpsMapQuery, hasGpsPosition } from '../gps.queries'
import { useGpsNow } from '../hooks/use-gps-now'
import { GpsDeviceCard } from './gps-device-card'
import { GpsMapLegend } from './gps-map-legend'
import { GpsTrackerLayer } from './gps-tracker-layer'
import type { GpsLocatedDevice, GpsMapDevice } from '../gps.queries'

// Pins anchor at their bottom edge; reserve their height and the top of the map for popups.
const fitPadding = { top: 96, right: 64, bottom: 64, left: 64 }

function fitTo(
  map: ReturnType<typeof useMap>['map'],
  library: ReturnType<typeof useMap>['library'],
  devices: Array<GpsLocatedDevice>,
) {
  const bounds = new library.LngLatBounds()
  for (const { position } of devices)
    bounds.extend([position.longitude, position.latitude])
  map.fitBounds(bounds, { padding: fitPadding, maxZoom: 15, duration: 0 })
}

function FitDevices({ devices }: { devices: Array<GpsLocatedDevice> }) {
  const { map, library, loaded } = useMap()
  const fittedMap = useRef<typeof map>(null)
  // The map is an external imperative system; fit once when its first data arrives.
  useEffect(() => {
    if (!loaded || fittedMap.current === map || !devices.length) return
    fittedMap.current = map
    fitTo(map, library, devices)
  }, [map, library, loaded, devices])
  return (
    <Button
      variant="outline"
      depth="raised"
      size="icon-lg"
      className="absolute top-4 right-4 z-10 bg-background dark:bg-background"
      aria-label="ყველა მოწყობილობის ჩვენება"
      title="ყველა მოწყობილობის ჩვენება"
      onClick={() => fitTo(map, library, devices)}
      disabled={!devices.length}
    >
      <IconFocus2 aria-hidden="true" />
    </Button>
  )
}

function Skeletons() {
  return (
    <div role="status" aria-busy="true" className="min-h-96">
      <span className="sr-only">მოწყობილობები იტვირთება</span>
      <Skeleton className="h-[32rem] rounded-xl" aria-hidden="true" />
    </div>
  )
}

export function GpsMapView({
  actorId,
  q,
  onEdit,
}: {
  actorId: string
  q: string
  onEdit?: (device: GpsMapDevice) => void
}) {
  const query = useQuery({
    ...gpsMapQuery(actorId, q, true),
    refetchInterval: 15_000,
    placeholderData: (previous, source) =>
      gpsKey(actorId).every((part, index) => source?.queryKey[index] === part)
        ? previous
        : undefined,
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const now = useGpsNow()
  if (query.isPending) return <Skeletons />
  const devices = query.isSuccess ? query.data.devices : []
  const total = query.isSuccess ? query.data.total : 0
  const located = devices.filter(
    (device): device is GpsLocatedDevice =>
      device.enabled && hasGpsPosition(device),
  )
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-label="GPS მოწყობილობების მდებარეობები"
          className="relative h-[32rem] min-w-0 overflow-hidden rounded-xl border lg:h-[min(72dvh,52rem)]"
        >
          <Map label="GPS მოწყობილობების რუკა" showBuildings={false}>
            <FitDevices devices={located} />
            <MapControls />
            <GpsTrackerLayer
              devices={located}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Map>
        </section>
        <aside
          aria-busy={query.isPlaceholderData}
          className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-muted/25 lg:max-h-[min(72dvh,52rem)]"
        >
          <div className="flex items-center justify-between border-b bg-card px-4 py-3.5">
            <h2 className="font-semibold">მოწყობილობები</h2>
            <div className="flex items-center gap-2">
              {query.isPlaceholderData && <Spinner aria-hidden="true" />}
              {query.isSuccess && (
                <Badge variant="secondary" className="tabular-nums">
                  {total}
                </Badge>
              )}
            </div>
          </div>
          <div className="app-scrollbar flex-1 overflow-y-auto">
            {query.isPlaceholderData && (
              <p role="status" className="sr-only">
                ძიების შედეგები იტვირთება.
              </p>
            )}
            {query.isError ? (
              <div className="p-3">
                <Alert variant="destructive">
                  <AlertDescription>
                    მოწყობილობები ვერ ჩაიტვირთა. განაახლეთ გვერდი.
                  </AlertDescription>
                </Alert>
              </div>
            ) : devices.length === 0 && !query.isPlaceholderData ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia aria-hidden="true">
                    {q ? <IconSearch /> : <IconGps />}
                  </EmptyMedia>
                  <EmptyTitle>
                    {q
                      ? 'ძიების შედეგები ვერ მოიძებნა.'
                      : 'GPS მოწყობილობები ჯერ არ არის დამატებული.'}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-3 p-3">
                {devices.map((device) => (
                  <GpsDeviceCard
                    key={device.id}
                    device={device}
                    selected={device.id === selectedId}
                    onSelect={setSelectedId}
                    onEdit={onEdit}
                    now={now}
                  />
                ))}
              </ul>
            )}
            {total > devices.length ? (
              <p className="border-t bg-card px-4 py-3 text-xs text-muted-foreground">
                ნაჩვენებია {devices.length} / {total} მოწყობილობა. დააზუსტეთ
                ძიება.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
      <GpsMapLegend />
    </div>
  )
}
