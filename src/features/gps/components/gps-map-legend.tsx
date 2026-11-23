import { IconGps } from '@tabler/icons-react'
import { Card, CardContent } from '#/components/ui/card'
import { cn } from '#/lib/utils'

const gpsPinStates = [
  {
    id: 'fresh',
    label: 'აქტიური მდებარეობა',
    pinClassName: 'border-white bg-emerald-600 text-white dark:border-white/90',
  },
  {
    id: 'stale',
    label: 'ძველი მდებარეობა (30+ წთ)',
    pinClassName:
      'border-dashed border-amber-500/80 bg-card text-amber-700 dark:text-amber-400',
  },
] as const

const gpsBatteryDots = [
  { id: 'high', label: '51-100%', dotClassName: 'bg-emerald-500' },
  { id: 'medium', label: '21-50%', dotClassName: 'bg-amber-500' },
  { id: 'low', label: '0-20%', dotClassName: 'bg-red-500' },
  {
    id: 'unknown',
    label: 'უცნობია',
    dotClassName: 'bg-zinc-400 dark:bg-zinc-500',
  },
] as const

export function GpsMapLegendSections() {
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      <div
        role="group"
        aria-label="GPS მოწყობილობის სტატუსები"
        className="flex flex-col gap-2"
      >
        <span className="text-xs font-medium text-muted-foreground">
          GPS მოწყობილობები
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {gpsPinStates.map(({ id, label, pinClassName }) => (
            <span
              key={id}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border-2 shadow-xs',
                  pinClassName,
                )}
              >
                <IconGps className="size-3.5" />
              </span>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div
        role="group"
        aria-label="ბატარეის ინდიკატორის ფერები"
        className="flex flex-col gap-2"
      >
        <span className="text-xs font-medium text-muted-foreground">
          ბატარეის ინდიკატორი
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {gpsBatteryDots.map(({ id, label, dotClassName }) => (
            <span
              key={id}
              className="flex items-center gap-1.5 text-sm text-foreground tabular-nums"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-3 shrink-0 rounded-full border border-background shadow-xs',
                  dotClassName,
                )}
              />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function GpsMapLegend() {
  return (
    <Card size="sm">
      <CardContent
        role="group"
        aria-label="რუკის ნიშნების განმარტება"
        className="py-1"
      >
        <GpsMapLegendSections />
      </CardContent>
    </Card>
  )
}
