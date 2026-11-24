import { useMemo } from 'react'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { IconEdit } from '@tabler/icons-react'
import { format } from 'date-fns'
import { ka } from 'date-fns/locale'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Table,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '#/components/ui/table'
import { formatGeorgianDate, formatGeorgianDateTime } from '#/lib/date-format'
import {
  calendarDayStatus,
  calendarKindLabels,
  calendarLeaveLabels,
  calendarSourceLabels,
} from '../payroll-calendar.presentation'
import type {
  CalendarHistoryEntry,
  PayrollCalendarDay,
} from '../payroll-calendar.types'

const features = tableFeatures({})
const dayHelper = createColumnHelper<typeof features, PayrollCalendarDay>()
const historyHelper = createColumnHelper<
  typeof features,
  CalendarHistoryEntry
>()
export function PayrollCalendarTable({
  days,
  canEdit,
  onEdit,
}: {
  days: PayrollCalendarDay[]
  canEdit: boolean
  onEdit: (day: PayrollCalendarDay) => void
}) {
  const columns = useMemo(
    () =>
      dayHelper.columns([
        dayHelper.accessor('date', {
          header: 'თარიღი',
          cell: ({ row }) => (
            <div className="flex min-w-44 flex-col gap-1">
              <span>{formatGeorgianDate(row.original.date)}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(`${row.original.date}T12:00:00`), 'EEEE', {
                  locale: ka,
                })}
              </span>
            </div>
          ),
        }),
        dayHelper.display({
          id: 'rule',
          header: 'კალენდრის წესი',
          cell: ({ row }) => {
            const day = row.original,
              status = calendarDayStatus(day)
            return (
              <div className="flex min-w-52 flex-col items-start gap-2">
                <Badge variant={status.variant}>{status.label}</Badge>
                <p className="text-sm tabular-nums">
                  {day.hours
                    ? `${day.hours.start} - ${day.hours.end}`
                    : day.kind === 'unconfigured' ||
                        day.kind === 'unknown_history'
                      ? 'საათები დასაზუსტებელია'
                      : 'საათები არ გამოიყენება'}
                </p>
                <span className="text-xs text-muted-foreground">
                  {day.source
                    ? calendarSourceLabels[day.source]
                    : 'ისტორია დასაზუსტებელია'}
                </span>
              </div>
            )
          },
        }),
        dayHelper.display({
          id: 'context',
          header: 'გასათვალისწინებელი',
          cell: ({ row }) => (
            <div className="flex min-w-52 max-w-sm flex-wrap gap-2">
              {row.original.statutoryHoliday ? (
                <Badge variant="blue">კანონით უქმე</Badge>
              ) : null}
              {row.original.holidayWorkReview ? (
                <Badge variant="orange">
                  უქმე დღეს მუშაობა გადასამოწმებელია
                </Badge>
              ) : null}
              {row.original.leaves.map((leave) => (
                <Badge
                  key={leave.id}
                  variant={leave.status === 'approved' ? 'sky' : 'yellow'}
                >
                  {calendarLeaveLabels[leave.kind]}:{' '}
                  {leave.status === 'approved' ? 'დამტკიცებული' : 'განხილვაშია'}
                </Badge>
              ))}
              {!row.original.statutoryHoliday && !row.original.leaves.length ? (
                <span className="text-sm text-muted-foreground">
                  დამატებითი გარემოება არ არის
                </span>
              ) : null}
            </div>
          ),
        }),
        ...(canEdit
          ? [
              dayHelper.display({
                id: 'actions',
                header: () => <span className="sr-only">გამონაკლისი</span>,
                cell: ({ row }) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${formatGeorgianDate(row.original.date)}: გამონაკლისი`}
                    onClick={() => onEdit(row.original)}
                  >
                    <IconEdit aria-hidden="true" />
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [canEdit, onEdit],
  )
  const table = useTable({
    features,
    columns,
    data: days,
    getRowId: (row) => row.date,
  })
  return (
    <Table
      tabIndex={0}
      className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <TableCaption className="sr-only">
        თვიური სახელფასო კალენდრის ცნობები
      </TableCaption>
      <TableHeader className="bg-muted/30">
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead scope="col" key={header.id} className="px-4">
                <table.FlexRender header={header} />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className="px-4 py-3">
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
export function CalendarHistoryTable({
  records,
  timezone,
}: {
  records: CalendarHistoryEntry[]
  timezone: string
}) {
  const columns = useMemo(
    () =>
      historyHelper.columns([
        historyHelper.accessor('date', {
          header: 'თარიღი',
          cell: ({ row }) => (
            <div className="flex flex-col gap-1">
              <span>{formatGeorgianDate(row.original.date)}</span>
              <span className="text-xs text-muted-foreground">
                ვერსია {row.original.revision}
                {row.original.previousRevision
                  ? ` · წინა: ${row.original.previousRevision}`
                  : ''}
              </span>
            </div>
          ),
        }),
        historyHelper.display({
          id: 'rule',
          header: 'შენახული წესი',
          cell: ({ row }) => (
            <div className="flex flex-col gap-1">
              <span>{calendarKindLabels[row.original.kind]}</span>
              {row.original.hours ? (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {row.original.hours.start} - {row.original.hours.end}
                </span>
              ) : null}
            </div>
          ),
        }),
        historyHelper.display({
          id: 'audit',
          header: 'ცვლილების საფუძველი',
          cell: ({ row }) => (
            <div className="flex max-w-md min-w-52 flex-col gap-1 whitespace-normal">
              <span>{row.original.actorName}</span>
              <time
                dateTime={row.original.recordedAt}
                className="text-xs text-muted-foreground"
              >
                {formatGeorgianDateTime(row.original.recordedAt, timezone)}
              </time>
              <p className="whitespace-pre-wrap wrap-anywhere text-muted-foreground">
                {row.original.reason}
              </p>
            </div>
          ),
        }),
      ]),
    [timezone],
  )
  const table = useTable({
    features,
    columns,
    data: records,
    getRowId: (row) => String(row.revision),
  })
  return (
    <Table
      tabIndex={0}
      className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <TableCaption className="sr-only">
        არჩეული კალენდრის ცვლილებების ისტორია
      </TableCaption>
      <TableHeader className="bg-muted/30">
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead scope="col" key={header.id} className="px-4">
                <table.FlexRender header={header} />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className="px-4 py-3">
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
