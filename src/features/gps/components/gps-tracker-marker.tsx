import { useId, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { IconGps, IconX } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button, buttonVariants } from '#/components/ui/button'
import { MapMarker } from '#/components/ui/map'
import { formatGeorgianDateTime } from '#/lib/date-format'
import { cn } from '#/lib/utils'
import { formatGpsFixAge, isGpsFixStale } from '../gps.rules'
import { gpsTimeZone } from '../gps.schemas'
import { GpsBatteryLevel } from './gps-battery-level'
import type { GpsLocatedDevice } from '../gps.queries'
import type { Ref } from 'react'

type Props = {
  device: GpsLocatedDevice
  selected: boolean
  onSelect: (id: string | null) => void
  now: number
}

function pinBatteryDotClass(percent: number | null) {
  if (percent === null) return 'bg-zinc-400 dark:bg-zinc-500'
  if (percent <= 20) return 'bg-red-500'
  if (percent <= 50) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function Pin({
  device,
  selected,
  stale,
  age,
  onSelect,
  pinRef,
  popupId,
}: Omit<Props, 'now'> & {
  stale: boolean
  age: string
  pinRef: Ref<HTMLButtonElement>
  popupId: string
}) {
  return (
    <>
      <div className="relative flex flex-col items-center">
        {!stale && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute -inset-1.5 rounded-full bg-emerald-600/18 transition-opacity',
              selected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100',
            )}
          />
        )}
        <Button
          ref={pinRef}
          type="button"
          variant="outline"
          size="icon-lg"
          depth="raised"
          aria-label={`${device.name}, ბოლო მდებარეობა: ${age}`}
          aria-expanded={selected}
          aria-controls={selected ? popupId : undefined}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(selected ? null : device.id)
          }}
          className={cn(
            'relative z-10 size-11 rounded-full border-2 shadow-md motion-safe:transition-transform motion-safe:hover:scale-105 focus-visible:ring-4',
            stale
              ? 'border-dashed border-amber-500/80 bg-card text-amber-700 hover:bg-card hover:text-amber-700 focus-visible:ring-amber-500/40 dark:bg-card dark:text-amber-400 dark:hover:bg-card dark:hover:text-amber-300'
              : 'border-white bg-emerald-600 text-white hover:bg-emerald-500 hover:text-white focus-visible:ring-emerald-500/50 dark:border-white/90 dark:bg-emerald-600 dark:hover:bg-emerald-500',
            selected &&
              (stale
                ? 'scale-110 ring-4 ring-amber-500/35 ring-offset-2 ring-offset-background'
                : 'scale-110 ring-4 ring-emerald-600/35 ring-offset-2 ring-offset-background'),
          )}
        >
          <IconGps className="size-5" aria-hidden="true" />
          <span
            aria-hidden="true"
            className={cn(
              'absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-white shadow-sm dark:border-zinc-900',
              pinBatteryDotClass(device.batteryPercent),
            )}
          />
        </Button>
        <span
          aria-hidden="true"
          className={cn(
            'relative z-0 -mt-2 size-3.5 rotate-45 rounded-[2px] border-r-2 border-b-2 shadow-sm',
            stale
              ? 'border-amber-500/80 bg-card'
              : 'border-white bg-emerald-600 dark:border-white/90',
          )}
        />
      </div>
      {selected ? null : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full mb-2.5 hidden w-max max-w-48 items-center gap-2 rounded-lg border bg-popover/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-xs group-focus-within:flex group-hover:flex"
        >
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              stale ? 'bg-amber-400' : 'bg-emerald-500',
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium break-words text-popover-foreground">
              {device.name}
            </span>
            <span className="text-muted-foreground">{age}</span>
          </span>
        </span>
      )}
    </>
  )
}

function Popup({
  device,
  stale,
  age,
  onClose,
  id,
}: {
  device: GpsLocatedDevice
  stale: boolean
  age: string
  onClose: () => void
  id: string
}) {
  const { position } = device
  return (
    <div
      role="group"
      id={id}
      aria-label={`${device.name}: დეტალები`}
      className="absolute bottom-full mb-3 flex w-64 cursor-default flex-col gap-3 rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-semibold break-words">{device.name}</span>
          <Badge variant={stale ? 'secondary' : 'green'} className="w-max">
            {stale ? 'ძველი მდებარეობა' : 'აქტუალური მდებარეობა'}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="დახურვა"
          onClick={onClose}
        >
          <IconX aria-hidden="true" />
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">ბატარეა</dt>
        <dd>
          <GpsBatteryLevel percent={device.batteryPercent} />
        </dd>
        <dt className="text-muted-foreground">სიჩქარე</dt>
        <dd className="tabular-nums">{position.speedKmh} კმ/სთ</dd>
        <dt className="text-muted-foreground">GPS დრო</dt>
        <dd className="tabular-nums">
          {formatGeorgianDateTime(position.fixAt.toISOString(), gpsTimeZone)}
          <span className="block text-xs text-muted-foreground">{age}</span>
        </dd>
      </dl>
      <Link
        to="/manage/gps/$deviceId"
        params={{ deviceId: device.id }}
        search={{}}
        className={buttonVariants({ variant: 'outline', depth: 'raised' })}
      >
        მოწყობილობის ისტორია
      </Link>
    </div>
  )
}

/** Circular tracker pin, distinct from the rounded-square job markers, with a click-to-open popup. */
export function GpsTrackerMarker({ device, selected, onSelect, now }: Props) {
  const pinRef = useRef<HTMLButtonElement>(null)
  const popupId = useId()
  const close = () => {
    pinRef.current?.focus()
    onSelect(null)
  }
  const stale = isGpsFixStale(device.position.fixAt, now)
  const age = formatGpsFixAge(device.position.fixAt, now)
  return (
    <MapMarker
      longitude={device.position.longitude}
      latitude={device.position.latitude}
      elevated={selected}
    >
      <div
        className="group relative flex flex-col items-center"
        data-gps-marker
        onKeyDown={(event) => {
          if (event.key === 'Escape' && selected) {
            event.stopPropagation()
            close()
          }
        }}
      >
        <Pin
          device={device}
          selected={selected}
          stale={stale}
          age={age}
          onSelect={onSelect}
          pinRef={pinRef}
          popupId={popupId}
        />
        {selected ? (
          <Popup
            id={popupId}
            device={device}
            stale={stale}
            age={age}
            onClose={close}
          />
        ) : null}
      </div>
    </MapMarker>
  )
}
