import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconCrosshair,
  IconGps,
  IconRoute,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { DataPagination } from '#/components/common/data-pagination'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button, buttonVariants } from '#/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { formatGeorgianDateTime } from '#/lib/date-format'
import { GpsBatteryLevel } from '../components/gps-battery-level'
import { GpsDeviceDiagnostics } from '../components/gps-device-diagnostics'
import { GpsDeviceSummary } from '../components/gps-device-summary'
import { GpsHistoryMap } from '../components/gps-history-map'
import { GpsHistoryRange } from '../components/gps-history-range'
import { buildGpsTrack, computeGpsTrackDistanceKm } from '../gps-track'
import { gpsHistoryQuery } from '../gps.queries'
import { gpsHistorySearch, gpsPageSize, gpsTimeZone } from '../gps.schemas'
import type { GpsSelectedPoint } from '../components/gps-history-map'
import type { GpsHistory } from '../gps.queries'
import type { GpsHistorySearch } from '../gps.schemas'

const features = tableFeatures({})
const column = createColumnHelper<typeof features, GpsHistory['rows'][number]>()

const displayTime = (date: Date | null) =>
  date
    ? formatGeorgianDateTime(date.toISOString(), gpsTimeZone, true)
    : 'არ დაფიქსირებულა'

const coordinates = (point: { latitude: number; longitude: number }) =>
  `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`

function formatDistanceKm(km: number) {
  if (km < 0.05) return '0 კმ'
  return `${km.toLocaleString('ka-GE', {
    minimumFractionDigits: km < 10 ? 1 : 0,
    maximumFractionDigits: km < 10 ? 1 : 0,
  })} კმ`
}

function createColumns(
  selectedId: string | null,
  onSelectPoint: (point: GpsSelectedPoint | null) => void,
) {
  return [
    column.display({
      id: 'fixAt',
      header: 'GPS დრო',
      cell: ({ row }) => displayTime(row.original.fixAt),
    }),
    column.display({
      id: 'coordinates',
      header: 'კოორდინატები',
      cell: ({ row }) => coordinates(row.original),
    }),
    column.display({
      id: 'valid',
      header: 'GPS სტატუსი',
      cell: ({ row }) => (
        <Badge variant={row.original.valid ? 'green' : 'secondary'}>
          {row.original.valid ? 'ვალიდური' : 'არავალიდური'}
        </Badge>
      ),
    }),
    column.display({
      id: 'batteryPercent',
      header: 'ბატარეა',
      cell: ({ row }) => (
        <GpsBatteryLevel percent={row.original.batteryPercent ?? null} />
      ),
    }),
    column.display({
      id: 'receivedAt',
      header: 'მიღების დრო',
      cell: ({ row }) => displayTime(row.original.receivedAt),
    }),
    column.display({
      id: 'speedKmh',
      header: 'სიჩქარე (კმ/სთ)',
      cell: ({ row }) => row.original.speedKmh,
    }),
    column.display({
      id: 'course',
      header: 'მიმართულება (°)',
      cell: ({ row }) => row.original.course,
    }),
    column.display({
      id: 'altitude',
      header: 'სიმაღლე (მ)',
      cell: ({ row }) => row.original.altitude ?? 'უცნობია',
    }),
    column.display({
      id: 'locate',
      header: () => <span className="sr-only">რუკაზე ჩვენება</span>,
      cell: ({ row }) => {
        const point = row.original
        const active = selectedId === point.id
        return (
          <Button
            type="button"
            variant={active ? 'secondary' : 'outline'}
            depth="raised"
            size="icon-sm"
            disabled={!point.valid}
            aria-pressed={active}
            aria-label="რუკაზე ჩვენება"
            title="რუკაზე ჩვენება"
            onClick={() =>
              onSelectPoint(
                active
                  ? null
                  : {
                      id: point.id,
                      latitude: point.latitude,
                      longitude: point.longitude,
                      fixAt: point.fixAt,
                    },
              )
            }
          >
            <IconCrosshair aria-hidden="true" />
          </Button>
        )
      },
    }),
  ]
}

function HistoryTable({
  rows,
  pending,
  selectedId,
  onSelectPoint,
}: {
  rows: GpsHistory['rows']
  pending: boolean
  selectedId: string | null
  onSelectPoint: (point: GpsSelectedPoint | null) => void
}) {
  const columns = useMemo(
    () => createColumns(selectedId, onSelectPoint),
    [selectedId, onSelectPoint],
  )
  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (row) => row.id,
  })
  return (
    <div aria-busy={pending}>
      {pending && (
        <span className="sr-only" role="status">
          ჩანაწერები იტვირთება
        </span>
      )}
      <Table aria-label="GPS მდებარეობის ჩანაწერები">
        <TableHeader className="bg-muted/40">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  <table.FlexRender header={header} />
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="tabular-nums">
          {pending
            ? Array.from({ length: 4 }, (_, index) => (
                <TableRow key={index} aria-hidden="true">
                  {columns.map((item) => (
                    <TableCell key={item.id}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={
                    selectedId === row.original.id ? 'selected' : undefined
                  }
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  )
}

function HistoryLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true">
      <span className="sr-only">მდებარეობის ისტორია იტვირთება</span>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton
          className="h-[28rem] rounded-xl lg:h-[38rem]"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-72 rounded-xl" aria-hidden="true" />
          <Skeleton className="h-64 rounded-xl" aria-hidden="true" />
        </div>
      </div>
      <Skeleton className="h-64 rounded-xl" aria-hidden="true" />
    </div>
  )
}

export function GpsHistoryPage({
  actorId,
  deviceId,
  search,
  onRangeChange,
}: {
  actorId: string
  deviceId: string
  search: GpsHistorySearch
  onRangeChange: (range: Pick<GpsHistorySearch, 'from' | 'to'>) => void
}) {
  const query = useQuery({
    ...gpsHistoryQuery(actorId, deviceId, search),
    refetchInterval: 15_000,
  })
  const history = query.data
  const { to: today } = gpsHistorySearch.parse({})
  const [selectedPoint, setSelectedPoint] = useState<GpsSelectedPoint | null>(
    null,
  )
  const [copiedId, setCopiedId] = useState(false)

  const rangeKey = `${deviceId}:${search.from}:${search.to}`
  const trackDistanceKm = useMemo(() => {
    if (!history?.track.length) return 0
    return computeGpsTrackDistanceKm(buildGpsTrack(history.track))
  }, [history?.track])

  const activePoint =
    selectedPoint && history?.rows.some((row) => row.id === selectedPoint.id)
      ? selectedPoint
      : null

  const copyDeviceId = async () => {
    if (!history) return
    try {
      await navigator.clipboard.writeText(history.device.reportedId)
      setCopiedId(true)
      toast.success('მოწყობილობის იდენტიფიკატორი დაკოპირდა.')
      window.setTimeout(() => setCopiedId(false), 1800)
    } catch {
      toast.error('იდენტიფიკატორის კოპირება ვერ მოხერხდა.')
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link
            to="/manage/gps"
            search={{}}
            className={buttonVariants({
              variant: 'outline',
              depth: 'raised',
              size: 'icon',
            })}
            aria-label="GPS მოწყობილობების სია"
          >
            <IconArrowLeft aria-hidden="true" />
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="min-w-0 wrap-anywhere text-2xl font-semibold tracking-tight">
              {history?.device.name ?? 'მდებარეობის ისტორია'}
            </h1>
            {history && (
              <>
                <Badge variant={history.device.enabled ? 'green' : 'secondary'}>
                  {history.device.enabled ? 'ჩართულია' : 'გამორთულია'}
                </Badge>
                <span className="inline-flex items-center gap-1 rounded-lg border bg-card px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  <span className="sr-only">
                    GPS მოწყობილობის იდენტიფიკატორი:
                  </span>
                  {history.device.reportedId}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="იდენტიფიკატორის კოპირება"
                    title="იდენტიფიკატორის კოპირება"
                    onClick={() => {
                      void copyDeviceId()
                    }}
                  >
                    {copiedId ? (
                      <IconCheck aria-hidden="true" />
                    ) : (
                      <IconCopy aria-hidden="true" />
                    )}
                  </Button>
                </span>
                <Badge variant="outline">JT808</Badge>
              </>
            )}
          </div>
        </div>

        {history && (
          <section
            aria-label="მდებარეობის ისტორიის პერიოდი"
            className="flex flex-wrap items-center gap-2"
          >
            {[
              { days: 1, label: 'დღეს' },
              { days: 3, label: 'ბოლო 3 დღე' },
              { days: 7, label: 'ბოლო 7 დღე' },
            ].map(({ days, label }) => {
              const from = new Date(Date.parse(today) - (days - 1) * 86_400_000)
                .toISOString()
                .slice(0, 10)
              const selected = search.from === from && search.to === today
              return (
                <Button
                  key={days}
                  variant={selected ? 'secondary' : 'outline'}
                  depth="raised"
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedPoint(null)
                    onRangeChange({ from, to: today })
                  }}
                >
                  {label}
                </Button>
              )
            })}
            <GpsHistoryRange
              value={search}
              onChange={(range) => {
                setSelectedPoint(null)
                onRangeChange(range)
              }}
            />
          </section>
        )}
      </div>

      {query.isPending ? (
        <HistoryLoadingSkeleton />
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            მდებარეობის ისტორია ვერ ჩაიტვირთა. განაახლეთ გვერდი.
          </AlertDescription>
        </Alert>
      ) : history ? (
        <>
          <div className="grid min-w-0 items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
            <Card className="flex min-w-0 flex-col overflow-hidden pb-0">
              <CardHeader>
                <CardTitle>
                  <h2>მარშრუტი</h2>
                </CardTitle>
                {history.total > 0 && (
                  <CardAction className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="tabular-nums">
                      {formatDistanceKm(trackDistanceKm)}
                    </Badge>
                    <Badge variant="secondary" className="tabular-nums">
                      {history.total.toLocaleString('ka-GE')} ჩანაწერი
                    </Badge>
                  </CardAction>
                )}
              </CardHeader>

              {history.total > history.trackLimit && (
                <div className="px-4">
                  <Alert>
                    <AlertDescription>
                      რუკაზე დამუშავებულია მხოლოდ ბოლო {history.trackLimit}{' '}
                      ჩანაწერი. სრული ისტორია ხელმისაწვდომია ცხრილში.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {history.total === 0 ? (
                <CardContent className="flex min-h-[24rem] flex-1 items-center justify-center pb-6">
                  <Empty className="border-0 p-0">
                    <EmptyHeader>
                      <EmptyMedia aria-hidden="true">
                        <IconRoute />
                      </EmptyMedia>
                      <EmptyTitle>
                        ამ პერიოდში მდებარეობა არ დაფიქსირებულა.
                      </EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </CardContent>
              ) : (
                <GpsHistoryMap
                  key={rangeKey}
                  fixes={history.track}
                  selectedPoint={activePoint}
                />
              )}
            </Card>

            <aside
              aria-label="მოწყობილობის სტატუსი და დიაგნოსტიკა"
              className="flex min-w-0 flex-col gap-4"
            >
              <GpsDeviceSummary
                device={history.device}
                latestFix={history.latestFix}
                battery={history.battery}
              />
              <GpsDeviceDiagnostics
                actorId={actorId}
                deviceId={deviceId}
                deviceName={history.device.name}
              />
            </aside>
          </div>

          {history.total > 0 && (
            <Card className="overflow-hidden pb-0">
              <CardHeader>
                <CardTitle>
                  <h2>მდებარეობის ჩანაწერები</h2>
                </CardTitle>
                <CardAction>
                  <Badge variant="secondary" className="tabular-nums">
                    {history.total.toLocaleString('ka-GE')} ჩანაწერი
                  </Badge>
                </CardAction>
              </CardHeader>
              <div>
                <HistoryTable
                  rows={history.rows}
                  pending={query.isPlaceholderData}
                  selectedId={activePoint?.id ?? null}
                  onSelectPoint={setSelectedPoint}
                />
                {history.total > gpsPageSize && (
                  <div className="border-t p-4">
                    <DataPagination
                      page={
                        query.isPlaceholderData ? search.page : history.page
                      }
                      pageSize={gpsPageSize}
                      total={history.total}
                      renderLink={(page) => (
                        <Link
                          to="/manage/gps/$deviceId"
                          params={{ deviceId }}
                          search={{ ...search, page }}
                          resetScroll={false}
                        />
                      )}
                    />
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      ) : (
        <Empty className="rounded-xl border bg-card">
          <EmptyHeader>
            <EmptyMedia aria-hidden="true">
              <IconGps />
            </EmptyMedia>
            <EmptyTitle>GPS მოწყობილობა ვერ მოიძებნა.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
