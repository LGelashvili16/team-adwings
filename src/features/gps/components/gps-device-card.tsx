import { Link } from '@tanstack/react-router'
import {
  IconClock,
  IconGauge,
  IconHistory,
  IconMapPin,
  IconPencil,
  IconSatellite,
} from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button, buttonVariants } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Separator } from '#/components/ui/separator'
import { formatGeorgianDateTime } from '#/lib/date-format'
import { cn } from '#/lib/utils'
import { formatGpsFixAge, isGpsFixStale } from '../gps.rules'
import { gpsTimeZone } from '../gps.schemas'
import { GpsBatteryLevel } from './gps-battery-level'
import type { GpsMapDevice } from '../gps.queries'

export function GpsDeviceCard({
  device,
  selected,
  onSelect,
  onEdit,
  now,
}: {
  device: GpsMapDevice
  selected: boolean
  onSelect: (id: string) => void
  onEdit?: (device: GpsMapDevice) => void
  now: number
}) {
  const fixAt = device.position?.fixAt
  const stale = fixAt ? isGpsFixStale(fixAt, now) : false
  const canFocus = Boolean(device.position && device.enabled)

  return (
    <li>
      <Card
        size="sm"
        className={cn(
          'relative gap-0 py-0 transition-all',
          canFocus && 'hover:ring-foreground/20',
          selected && 'bg-muted/40 ring-2 ring-primary',
        )}
      >
        <button
          type="button"
          disabled={!canFocus}
          aria-pressed={selected}
          onClick={() => onSelect(device.id)}
          className={cn(
            'flex w-full cursor-pointer flex-col gap-3 rounded-xl p-3.5 text-left transition-colors outline-none hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-75',
          )}
        >
          <div className={cn('flex flex-col gap-0.5 pr-11', onEdit && 'pr-20')}>
            <span className="font-semibold break-words text-foreground">
              {device.name}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              ID: {device.reportedId}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <GpsBatteryLevel percent={device.batteryPercent} />
            {!device.enabled ? (
              <Badge variant="secondary">გამორთულია</Badge>
            ) : fixAt ? (
              <Badge variant={stale ? 'secondary' : 'green'}>
                {formatGpsFixAge(fixAt, now)}
              </Badge>
            ) : (
              <Badge variant="outline">მდებარეობა არ დაფიქსირებულა</Badge>
            )}
          </div>

          <Separator />

          <dl className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 tabular-nums">
                <IconGauge className="size-3.5 shrink-0" aria-hidden="true" />
                <dt className="sr-only">სიჩქარე</dt>
                <dd className="font-medium text-foreground">
                  {device.position
                    ? `${device.position.speedKmh.toLocaleString('ka-GE')} კმ/სთ`
                    : 'უცნობია'}
                </dd>
              </div>
              {device.position?.satellites != null && (
                <div className="flex items-center gap-1 tabular-nums">
                  <IconSatellite
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <dt className="sr-only">თანამგზავრები</dt>
                  <dd>{device.position.satellites}</dd>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 tabular-nums">
              <IconClock className="size-3.5 shrink-0" aria-hidden="true" />
              <dt className="sr-only">ბოლო კავშირი</dt>
              <dd className="truncate">
                {device.lastContactAt
                  ? formatGeorgianDateTime(
                      device.lastContactAt.toISOString(),
                      gpsTimeZone,
                    )
                  : 'კავშირი არ დაფიქსირებულა'}
              </dd>
            </div>

            {device.position && (
              <div className="flex items-center gap-1.5 tabular-nums">
                <IconMapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <dt className="sr-only">კოორდინატები</dt>
                <dd className="truncate">
                  {device.position.latitude.toFixed(5)},{' '}
                  {device.position.longitude.toFixed(5)}
                </dd>
              </div>
            )}
          </dl>
        </button>

        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          {onEdit ? (
            <Button
              variant="outline"
              depth="raised"
              size="icon-sm"
              aria-label={`${device.name}: რედაქტირება`}
              title="რედაქტირება"
              onClick={() => onEdit(device)}
            >
              <IconPencil aria-hidden="true" />
            </Button>
          ) : null}
          <Link
            to="/manage/gps/$deviceId"
            params={{ deviceId: device.id }}
            search={{}}
            aria-label={`${device.name}: ისტორია`}
            title="მოწყობილობის ისტორია"
            className={buttonVariants({
              variant: 'outline',
              size: 'icon-sm',
              depth: 'raised',
            })}
          >
            <IconHistory aria-hidden="true" />
          </Link>
        </div>
      </Card>
    </li>
  )
}
