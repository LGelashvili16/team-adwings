import { useEffect, useMemo, useRef } from 'react'
import {
  IconFocus2,
  IconGps,
  IconMapPin,
  IconPlayerPlay,
} from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Map, MapControls, MapMarker, useMap } from '#/components/ui/map'
import { formatGeorgianDateTime } from '#/lib/date-format'
import { cn } from '#/lib/utils'
import { buildGpsTrack } from '../gps-track'
import { gpsTimeZone } from '../gps.schemas'
import type { GpsHistory } from '../gps.queries'
import type { FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource } from 'maplibre-gl'

const sourceId = 'gps-history-track'
const casingId = 'gps-history-line-casing'
const lineId = 'gps-history-line'
const pointId = 'gps-history-point'
// Cartographic route stroke with a translucent halo keeps paths legible on both basemaps.
const routeColor = '#8250df'
const routeCasing = 'rgba(255, 255, 255, 0.55)'
const mapLabel = 'მარშრუტის რუკა'
const fitPadding = { top: 72, right: 64, bottom: 56, left: 64 }

type Segments = ReturnType<typeof buildGpsTrack>

export type GpsSelectedPoint = {
  id: string
  latitude: number
  longitude: number
  fixAt: Date
}

function fitSegments(
  map: ReturnType<typeof useMap>['map'],
  library: ReturnType<typeof useMap>['library'],
  segments: Segments,
  animate: boolean,
) {
  const coordinates = segments.flat()
  if (coordinates.length === 0) return
  const bounds = new library.LngLatBounds()
  for (const coordinate of coordinates) bounds.extend(coordinate)
  const duration =
    animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 450
      : 0
  if (
    bounds.getWest() !== bounds.getEast() ||
    bounds.getSouth() !== bounds.getNorth()
  ) {
    map.fitBounds(bounds, { padding: fitPadding, maxZoom: 16, duration })
    return
  }
  map.easeTo({ center: coordinates[0], zoom: 15, duration })
}

function TrackLayer({
  segments,
  selectedPoint,
}: {
  segments: Segments
  selectedPoint?: GpsSelectedPoint | null
}) {
  const { map, library, loaded } = useMap()
  const fittedMap = useRef<typeof map>(null)
  const data = useMemo<FeatureCollection<LineString | Point>>(
    () => ({
      type: 'FeatureCollection',
      features: segments.map((segment) => ({
        type: 'Feature',
        properties: {},
        geometry:
          segment.length === 1
            ? { type: 'Point', coordinates: segment[0] }
            : { type: 'LineString', coordinates: segment },
      })),
    }),
    [segments],
  )

  useEffect(() => {
    function draw() {
      const source = map.getSource<GeoJSONSource>(sourceId)
      if (source) {
        source.setData(data)
        return
      }
      map.addSource(sourceId, { type: 'geojson', data })
      map.addLayer({
        id: casingId,
        type: 'line',
        source: sourceId,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': routeCasing, 'line-width': 7 },
      })
      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': routeColor, 'line-width': 4 },
      })
      map.addLayer({
        id: pointId,
        type: 'circle',
        source: sourceId,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': routeColor,
          'circle-radius': 5,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
    }
    // The shared map replaces its style when the site theme changes.
    map.on('style.load', draw)
    if (map.getSource(sourceId) || map.isStyleLoaded()) draw()
    else map.once('idle', draw)
    // This overlay lives for the lifetime of its Map. Data changes update the source in place.
    return () => {
      map.off('style.load', draw)
      map.off('idle', draw)
    }
  }, [map, data])

  useEffect(() => {
    if (!loaded || fittedMap.current === map) return
    fitSegments(map, library, segments, false)
    fittedMap.current = map
  }, [map, library, loaded, segments])

  useEffect(() => {
    if (!loaded || !selectedPoint) return
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
      ? 0
      : 450
    map.easeTo({
      center: [selectedPoint.longitude, selectedPoint.latitude],
      zoom: Math.max(map.getZoom(), 15),
      duration,
    })
  }, [map, loaded, selectedPoint])

  return (
    <Button
      type="button"
      variant="outline"
      depth="raised"
      size="icon-lg"
      className="absolute top-4 right-4 z-10 bg-background dark:bg-background"
      aria-label="მარშრუტის ჩარჩოში მოქცევა"
      title="მარშრუტის სრულად ჩვენება"
      onClick={() => fitSegments(map, library, segments, true)}
    >
      <IconFocus2 aria-hidden="true" />
    </Button>
  )
}

function RoutePin({
  label,
  variant,
  icon: Icon,
  pinClassName,
  tailClassName,
  haloClassName,
}: {
  label: string
  variant: 'green' | 'blue' | 'secondary' | 'purple'
  icon: typeof IconGps
  pinClassName: string
  tailClassName: string
  haloClassName?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Badge variant={variant} className="shadow-md">
        {label}
      </Badge>
      <div className="relative flex flex-col items-center">
        {haloClassName && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute -inset-1.5 rounded-full',
              haloClassName,
            )}
          />
        )}
        <span
          aria-hidden="true"
          className={cn(
            'relative z-10 flex size-9 items-center justify-center rounded-full border-2 border-white text-white shadow-md dark:border-white/90',
            pinClassName,
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'relative z-0 -mt-2 size-3 rotate-45 rounded-[2px] border-r-2 border-b-2 border-white shadow-sm dark:border-white/90',
            tailClassName,
          )}
        />
      </div>
    </div>
  )
}

export function GpsHistoryMap({
  fixes,
  selectedPoint,
  className,
}: {
  fixes: GpsHistory['track']
  selectedPoint?: GpsSelectedPoint | null
  className?: string
}) {
  const segments = useMemo(() => buildGpsTrack(fixes), [fixes])
  const first = segments.at(0)?.at(0)
  const last = segments.at(-1)?.at(-1)

  if (!first || !last) {
    return (
      <div
        className={cn(
          'flex min-h-80 flex-1 items-center justify-center p-6',
          className,
        )}
      >
        <Empty className="border-0 p-0">
          <EmptyHeader>
            <EmptyMedia aria-hidden="true">
              <IconMapPin />
            </EmptyMedia>
            <EmptyTitle>
              ამ პერიოდში რუკაზე საჩვენებელი მდებარეობა არ არის.
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative min-h-[24rem] w-full flex-1 sm:min-h-[30rem] lg:min-h-[36rem]',
        className,
      )}
    >
      <Map
        center={last}
        zoom={15}
        className="absolute inset-0 h-full w-full"
        label={mapLabel}
        showBuildings={false}
      >
        <TrackLayer segments={segments} selectedPoint={selectedPoint} />
        <MapControls />
        {first.join() !== last.join() && (
          <MapMarker longitude={first[0]} latitude={first[1]}>
            <RoutePin
              label="დასაწყისი"
              variant="blue"
              icon={IconPlayerPlay}
              pinClassName="bg-blue-600"
              tailClassName="bg-blue-600"
              haloClassName="bg-blue-600/18"
            />
          </MapMarker>
        )}
        <MapMarker
          longitude={last[0]}
          latitude={last[1]}
          elevated={!selectedPoint}
        >
          <RoutePin
            label="ბოლო მდებარეობა"
            variant="green"
            icon={IconGps}
            pinClassName="bg-emerald-600"
            tailClassName="bg-emerald-600"
            haloClassName="bg-emerald-600/18"
          />
        </MapMarker>
        {selectedPoint && (
          <MapMarker
            longitude={selectedPoint.longitude}
            latitude={selectedPoint.latitude}
            elevated
          >
            <RoutePin
              label={formatGeorgianDateTime(
                selectedPoint.fixAt.toISOString(),
                gpsTimeZone,
                true,
              )}
              variant="purple"
              icon={IconMapPin}
              pinClassName="bg-indigo-600"
              tailClassName="bg-indigo-600"
              haloClassName="bg-indigo-600/20"
            />
          </MapMarker>
        )}
      </Map>
    </div>
  )
}
