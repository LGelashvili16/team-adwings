import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconFocus2,
  IconMapPin,
  IconMaximize,
  IconMinimize,
  IconBuildingStore,
  IconBuildingSkyscraper,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconCircleDashed,
} from '@tabler/icons-react'
import { Map, MapControls, MapMarker, useMap } from '#/components/ui/map'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { cn } from '#/lib/utils'
import { JobsMapMenu, MapContextLocation } from './jobs-map-menu'
import { JobMarker as JobMapMarker } from './job-marker'
import { jobIndicators, jobMarkerPriority } from '../jobs.indicators'
import { jobGeofenceRing } from '../jobs.geofence'
import { JobsGeofenceLayer } from './jobs-geofence-layer'
import type { Actor } from '#/lib/authorization/actor'
import type { JobMapPosition, JobMarker } from '../jobs.types'
import type { ReactNode, RefObject } from 'react'
import type { MapCamera } from '#/components/ui/map'
import type { ResolvedLocation } from '../job-locations.types'

// Markers anchor at their bottom edge; reserve their height as well as the top controls.
const fitPadding = { top: 112, right: 128, bottom: 80, left: 64 }
const geofenceFocusPadding = 52

function MapFocus({
  pins,
  pinsReady,
  initialPin,
  selected,
  onSelect,
  location,
  focused,
  restoreCamera,
  focusRequest,
  actor,
  controls,
  showGeofences,
  expanded,
  onExpand,
}: {
  pins: Array<JobMarker>
  pinsReady: boolean
  initialPin?: string
  selected?: JobMarker
  onSelect: (id: string) => void
  location?: ResolvedLocation
  focused: RefObject<string | null>
  restoreCamera: boolean
  focusRequest: number
  actor: Actor
  controls?: ReactNode
  showGeofences: boolean
  expanded: boolean
  onExpand: () => void
}) {
  const { map, library, loaded } = useMap()
  const [controlsOpen, setControlsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const initialized = useRef(restoreCamera)
  function fit() {
    if (!pins.length) return
    const bounds = new library.LngLatBounds()
    for (const pin of pins) bounds.extend([pin.longitude, pin.latitude])
    map.fitBounds(bounds, {
      padding: fitPadding,
      maxZoom: 14,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 500,
      linear: true,
    })
  }
  useEffect(() => {
    if (!pinsReady || initialized.current) return
    initialized.current = true
    if (
      location ||
      (selected &&
        (showGeofences || selected.id !== initialPin || focusRequest > 0)) ||
      !pins.length
    )
      return
    const bounds = new library.LngLatBounds()
    for (const pin of pins) bounds.extend([pin.longitude, pin.latitude])
    // Position before the first tiles render; animate only when job results arrive after map load.
    map.fitBounds(bounds, {
      padding: fitPadding,
      maxZoom: 14,
      duration:
        loaded && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 500
          : 0,
      linear: true,
    })
  }, [
    map,
    library,
    loaded,
    pinsReady,
    pins,
    location,
    selected,
    initialPin,
    focusRequest,
    showGeofences,
  ])
  useEffect(() => {
    const target = location ?? selected
    const fitGeofence = showGeofences && Boolean(selected) && !location
    const key = target
      ? [
          focusRequest,
          location?.sourceId ?? selected?.id,
          target.longitude,
          target.latitude,
        ].join(':')
      : null
    // The map is recreated in the expanded dialog. A previously focused result must not reset the restored camera.
    if (focused.current === key) return
    focused.current = key
    if (
      !target ||
      (selected?.id === initialPin &&
        !location &&
        focusRequest === 0 &&
        !fitGeofence)
    )
      return
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
      ? 0
      : 500
    if (fitGeofence) {
      const bounds = new library.LngLatBounds()
      for (const point of jobGeofenceRing(target)) bounds.extend(point)
      map.fitBounds(bounds, {
        padding: geofenceFocusPadding,
        maxZoom: 17,
        duration,
        linear: true,
      })
    } else {
      map.flyTo({
        center: [target.longitude, target.latitude],
        zoom: Math.max(map.getZoom(), 13),
        duration,
      })
    }
  }, [
    map,
    library,
    selected?.id,
    selected?.longitude,
    selected?.latitude,
    location?.sourceId,
    location?.longitude,
    location?.latitude,
    focused,
    focusRequest,
    initialPin,
    showGeofences,
  ])
  const visiblePins = useMemo(() => {
    if (!selected) return pins
    return pins.some((pin) => pin.id === selected.id)
      ? pins.map((pin) =>
          pin.id === selected.id
            ? {
                ...pin,
                longitude: selected.longitude,
                latitude: selected.latitude,
              }
            : pin,
        )
      : [...pins, selected]
  }, [pins, selected])
  return (
    <>
      <JobsGeofenceLayer
        pins={visiblePins}
        selectedId={selected?.id}
        visible={showGeofences}
      />
      {location ? (
        <MapMarker longitude={location.longitude} latitude={location.latitude}>
          <span
            role="img"
            aria-label={`ნაპოვნი მდებარეობა: ${location.labelKa ?? location.labelEn}`}
            className="flex size-11 items-center justify-center rounded-2xl border-2 border-primary-foreground bg-primary text-primary-foreground shadow-md"
          >
            <IconMapPin className="size-6" aria-hidden="true" />
          </span>
        </MapMarker>
      ) : null}
      {visiblePins.map((pin) => (
        <MapMarker
          key={pin.id}
          longitude={pin.longitude}
          latitude={pin.latitude}
          priority={jobMarkerPriority(
            jobIndicators(pin, now),
            selected?.id === pin.id,
          )}
        >
          <JobMapMarker
            now={now}
            pin={pin}
            actor={actor}
            selected={selected?.id === pin.id}
            onSelect={onSelect}
          />
        </MapMarker>
      ))}
      <div
        className={cn(
          'absolute top-4 right-4 z-20 transition-transform duration-200 ease-out motion-reduce:transition-none',
          !controlsOpen && 'translate-x-[calc(100%+1rem)]',
        )}
      >
        <Button
          type="button"
          variant="outline-solid"
          depth="raised"
          size="icon-lg"
          className="absolute top-0 -left-11"
          aria-label={
            controlsOpen
              ? 'რუკის ხელსაწყოების დამალვა'
              : 'რუკის ხელსაწყოების ჩვენება'
          }
          aria-expanded={controlsOpen}
          aria-controls="jobs-map-controls"
          onClick={() => setControlsOpen(!controlsOpen)}
        >
          {controlsOpen ? (
            <IconChevronRight aria-hidden="true" />
          ) : (
            <IconChevronLeft aria-hidden="true" />
          )}
        </Button>
        <Card
          id="jobs-map-controls"
          inert={!controlsOpen}
          aria-hidden={!controlsOpen || undefined}
          size="sm"
          className="gap-0 py-2"
        >
          <CardContent className="flex flex-col gap-2 px-2">
            <Button
              data-map-expand
              variant="outline-solid"
              depth="raised"
              size="icon-lg"
              aria-label={expanded ? 'რუკის შემცირება' : 'რუკის გაშლა'}
              title={expanded ? 'რუკის შემცირება' : 'რუკის გაშლა'}
              onClick={onExpand}
            >
              {expanded ? (
                <IconMinimize aria-hidden="true" />
              ) : (
                <IconMaximize aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="outline-solid"
              depth="raised"
              size="icon-lg"
              aria-label="ყველა სამუშაოს ჩვენება"
              title="ყველა სამუშაოს ჩვენება"
              onClick={fit}
              disabled={!pins.length}
            >
              <IconFocus2 data-icon="inline-start" aria-hidden="true" />
            </Button>
            {controls}
            <MapControls inline />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
export default function JobsMap({
  pins,
  pinsReady,
  initialPin,
  selected,
  onSelect,
  onPick,
  showEmpty,
  location,
  camera,
  focused,
  canCreate,
  onExpand,
  children,
  expanded,
  focusRequest,
  actor,
  showPlaces,
  onPlacesChange,
  showBuildings,
  onBuildingsChange,
  showGeofences = true,
  onGeofencesChange,
  showCompleted = true,
  onCompletedChange,
  controlExtras,
}: {
  pins: Array<JobMarker>
  pinsReady: boolean
  initialPin?: string
  selected?: JobMarker
  onSelect: (id: string) => void
  onPick: (position: JobMapPosition) => void
  showEmpty: boolean
  location?: ResolvedLocation
  camera: RefObject<MapCamera | null>
  focused: RefObject<string | null>
  canCreate: boolean
  onExpand: () => void
  children?: ReactNode
  expanded: boolean
  focusRequest: number
  actor: Actor
  showPlaces: boolean
  onPlacesChange: (show: boolean) => void
  showBuildings: boolean
  onBuildingsChange: (show: boolean) => void
  showGeofences?: boolean
  onGeofencesChange?: (show: boolean) => void
  showCompleted?: boolean
  onCompletedChange?: (show: boolean) => void
  controlExtras?: ReactNode
}) {
  const [position, setPosition] = useState<JobMapPosition | null>(null)
  const [restoreCamera] = useState(() => Boolean(camera.current))
  const visiblePins = showCompleted
    ? pins
    : pins.filter((pin) => pin.status !== 'completed')
  const content = (
    <Map camera={camera} showPlaces={showPlaces} showBuildings={showBuildings}>
      <MapFocus
        pins={visiblePins}
        pinsReady={pinsReady}
        initialPin={initialPin}
        selected={
          selected?.status === 'completed' && !showCompleted
            ? undefined
            : selected
        }
        location={location}
        onSelect={onSelect}
        focused={focused}
        restoreCamera={restoreCamera}
        focusRequest={focusRequest}
        actor={actor}
        expanded={expanded}
        onExpand={onExpand}
        showGeofences={showGeofences}
        controls={
          <>
            <Button
              variant={showPlaces ? 'default' : 'outline-solid'}
              depth="raised"
              size="icon-lg"
              aria-label="ობიექტების ჩვენება"
              aria-pressed={showPlaces}
              title={showPlaces ? 'ობიექტების დამალვა' : 'ობიექტების ჩვენება'}
              onClick={() => onPlacesChange(!showPlaces)}
            >
              <IconBuildingStore aria-hidden="true" />
            </Button>
            <Button
              variant={showBuildings ? 'default' : 'outline-solid'}
              depth="raised"
              size="icon-lg"
              aria-label="სამგანზომილებიანი შენობები"
              aria-pressed={showBuildings}
              title={
                showBuildings
                  ? 'სამგანზომილებიანი შენობების გამორთვა'
                  : 'სამგანზომილებიანი შენობების ჩართვა'
              }
              onClick={() => onBuildingsChange(!showBuildings)}
            >
              <IconBuildingSkyscraper aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant={showGeofences ? 'default' : 'outline-solid'}
              depth="raised"
              size="icon-lg"
              aria-label="გეოზონების ჩვენება"
              aria-pressed={showGeofences}
              title={
                showGeofences ? 'გეოზონების დამალვა' : 'გეოზონების ჩვენება'
              }
              onClick={() => onGeofencesChange?.(!showGeofences)}
            >
              <IconCircleDashed aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant={showCompleted ? 'default' : 'outline-solid'}
              depth="raised"
              size="icon-lg"
              aria-label="დასრულებული სამუშაოების ჩვენება"
              aria-pressed={showCompleted}
              title={
                showCompleted
                  ? 'დასრულებული სამუშაოების დამალვა'
                  : 'დასრულებული სამუშაოების ჩვენება'
              }
              onClick={() => onCompletedChange?.(!showCompleted)}
            >
              <IconCircleCheck aria-hidden="true" />
            </Button>
            {controlExtras}
          </>
        }
      />
      {canCreate ? <MapContextLocation onPoint={setPosition} /> : null}
      {children}
      {showEmpty && !location ? (
        <div className="pointer-events-none absolute bottom-12 left-4 flex max-w-64 items-start gap-3 rounded-xl border bg-background/95 p-3 text-sm shadow-sm">
          <IconMapPin
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <p className="leading-relaxed">ამ ხედში სამუშაოები ჯერ არ არის.</p>
        </div>
      ) : null}
    </Map>
  )
  return canCreate ? (
    <JobsMapMenu position={position} onCreate={onPick}>
      {content}
    </JobsMapMenu>
  ) : (
    content
  )
}
