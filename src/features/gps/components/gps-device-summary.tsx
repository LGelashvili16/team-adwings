import { useState } from 'react'
import {
  IconAntennaBars5,
  IconCheck,
  IconClock,
  IconCopy,
  IconGauge,
  IconMapPin,
  IconRoad,
  IconSatellite,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Separator } from '#/components/ui/separator'
import { formatGeorgianDateTime } from '#/lib/date-format'
import { formatGpsFixAge, isGpsFixStale } from '../gps.rules'
import { gpsTimeZone } from '../gps.schemas'
import { useGpsNow } from '../hooks/use-gps-now'
import { GpsBatteryLevel } from './gps-battery-level'
import type { GpsHistory } from '../gps.queries'

function formatTime(date: Date | null) {
  return date
    ? formatGeorgianDateTime(date.toISOString(), gpsTimeZone, true)
    : 'არ დაფიქსირებულა'
}

function formatCoordinates(point: { latitude: number; longitude: number }) {
  return `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`
}

export function GpsDeviceSummary({
  device,
  latestFix,
  battery,
}: {
  device: GpsHistory['device']
  latestFix: GpsHistory['latestFix']
  battery: GpsHistory['battery']
}) {
  const [copiedCoords, setCopiedCoords] = useState(false)
  const now = useGpsNow()
  const fixAge = latestFix ? formatGpsFixAge(latestFix.fixAt, now) : null
  const fixStale = latestFix ? isGpsFixStale(latestFix.fixAt, now) : false

  const copyCoordinates = async () => {
    if (!latestFix) return
    try {
      await navigator.clipboard.writeText(formatCoordinates(latestFix))
      setCopiedCoords(true)
      toast.success('კოორდინატები დაკოპირდა.')
      window.setTimeout(() => setCopiedCoords(false), 1800)
    } catch {
      toast.error('კოორდინატების კოპირება ვერ მოხერხდა.')
    }
  }

  const telemetry = [
    {
      label: 'სიჩქარე',
      value: latestFix?.speedKmh,
      unit: 'კმ/სთ',
      icon: IconGauge,
    },
    {
      label: 'თანამგზავრები',
      value: latestFix?.satellites,
      unit: '',
      icon: IconSatellite,
    },
    {
      label: 'მობილური სიგნალი',
      value: latestFix?.cellularSignal,
      unit: '',
      icon: IconAntennaBars5,
    },
    {
      label: 'გარბენი',
      value: latestFix?.odometerKm,
      unit: 'კმ',
      icon: IconRoad,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>ტელემეტრია</h2>
        </CardTitle>
        {fixAge && (
          <CardAction>
            <Badge variant={fixStale ? 'secondary' : 'green'}>{fixAge}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-sm text-muted-foreground">ბატარეა</dt>
            <dd className="flex flex-col items-end gap-0.5 text-right">
              <GpsBatteryLevel percent={battery?.percent ?? null} />
              {battery && (
                <time
                  className="text-xs tabular-nums text-muted-foreground"
                  dateTime={battery.fixAt.toISOString()}
                >
                  {formatTime(battery.fixAt)}
                </time>
              )}
            </dd>
          </div>

          <div className="flex items-start justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <IconClock className="size-4 shrink-0" aria-hidden="true" />
              ბოლო კავშირი
            </dt>
            <dd className="text-right font-medium tabular-nums">
              {formatTime(device.lastContactAt)}
            </dd>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <IconMapPin className="size-4 shrink-0" aria-hidden="true" />
                ბოლო მდებარეობა
              </dt>
              <dd className="text-right font-medium tabular-nums">
                {formatTime(latestFix?.fixAt ?? null)}
              </dd>
            </div>
            {latestFix && (
              <dd className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5">
                <span className="truncate text-xs tabular-nums text-muted-foreground">
                  {formatCoordinates(latestFix)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="კოორდინატების კოპირება"
                  title="კოორდინატების კოპირება"
                  onClick={() => {
                    void copyCoordinates()
                  }}
                >
                  {copiedCoords ? (
                    <IconCheck aria-hidden="true" />
                  ) : (
                    <IconCopy aria-hidden="true" />
                  )}
                </Button>
              </dd>
            )}
          </div>
        </dl>

        <Separator />

        <dl className="grid grid-cols-2 gap-2.5">
          {telemetry.map(({ label, value, unit, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-lg border bg-muted/25 p-2.5"
            >
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </dt>
              <dd
                className={
                  value == null
                    ? 'text-sm font-medium text-muted-foreground'
                    : 'text-base font-semibold tabular-nums'
                }
              >
                {value == null
                  ? 'უცნობია'
                  : `${value.toLocaleString('ka-GE')}${unit ? ` ${unit}` : ''}`}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
