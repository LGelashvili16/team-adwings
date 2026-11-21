import { useQuery } from '@tanstack/react-query'
import {
  IconActivity,
  IconAlertCircle,
  IconDeviceMobilePlus,
  IconShieldCheck,
} from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { formatGeorgianDateTime } from '#/lib/date-format'
import { getGpsDiagnostics } from '../gps.functions'
import { gpsKey } from '../gps.queries'
import { gpsTimeZone } from '../gps.schemas'
import { GpsErrorSheet } from './gps-error-sheet'

const activity = [
  {
    kind: 'registration',
    label: 'ბოლო რეგისტრაციის მოთხოვნა',
    icon: IconDeviceMobilePlus,
  },
  {
    kind: 'authentication',
    label: 'ბოლო წარმატებული ავთენტიფიკაცია',
    icon: IconShieldCheck,
  },
  { kind: 'heartbeat', label: 'ბოლო საკონტროლო სიგნალი', icon: IconActivity },
  {
    kind: 'decode_error',
    label: 'ბოლო დეკოდირების შეცდომა',
    icon: IconAlertCircle,
  },
] as const

export function GpsDeviceDiagnostics({
  actorId,
  deviceId,
  deviceName,
}: {
  actorId: string
  deviceId: string
  deviceName: string
}) {
  const query = useQuery({
    queryKey: [...gpsKey(actorId), 'diagnostics', deviceId],
    queryFn: () => getGpsDiagnostics({ data: { deviceId } }),
    refetchInterval: 15_000,
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>კავშირის დიაგნოსტიკა</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div className="flex flex-col gap-2" role="status" aria-busy="true">
            <span className="sr-only">კავშირის დიაგნოსტიკა იტვირთება</span>
            <Skeleton className="h-14" aria-hidden="true" />
            <Skeleton className="h-14" aria-hidden="true" />
          </div>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              კავშირის დიაგნოსტიკა ვერ ჩაიტვირთა. განაახლეთ გვერდი.
            </AlertDescription>
          </Alert>
        ) : (
          <dl className="flex flex-col gap-2">
            {activity.map(({ kind, label, icon: Icon }) => {
              const event = query.data.find((item) => item.kind === kind)
              const receivedAt = event?.receivedAt
              const hasDecodeError = kind === 'decode_error' && Boolean(event)
              const value = receivedAt && (
                <time dateTime={receivedAt.toISOString()}>
                  {formatGeorgianDateTime(
                    receivedAt.toISOString(),
                    gpsTimeZone,
                    true,
                  )}
                </time>
              )
              return (
                <div
                  key={kind}
                  className="flex flex-col gap-1.5 rounded-lg border bg-muted/25 px-3 py-2.5"
                >
                  <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Icon
                      className={
                        hasDecodeError
                          ? 'size-4 shrink-0 text-destructive'
                          : 'size-4 shrink-0 text-muted-foreground'
                      }
                      aria-hidden="true"
                    />
                    {label}
                  </dt>
                  <dd className="flex flex-wrap items-center justify-between gap-2 text-sm tabular-nums">
                    <span
                      className={
                        receivedAt
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground'
                      }
                    >
                      {value ?? 'არ დაფიქსირებულა'}
                    </span>
                    {hasDecodeError && event && (
                      <GpsErrorSheet deviceName={deviceName} error={event} />
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
