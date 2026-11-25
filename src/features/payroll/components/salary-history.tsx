import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { useMemo } from 'react'
import { IconHistory } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '#/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { formatGeorgianDate, formatGeorgianDateTime } from '#/lib/date-format'
import {
  formatSalary,
  salaryBasisLabels,
  salaryKindLabels,
} from '../salary.presentation'
import type { SalaryHistoryEntry } from '../salary.types'
import type { ReactNode } from 'react'

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, SalaryHistoryEntry>()

function HistoryRate({ entry }: { entry: SalaryHistoryEntry }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium tabular-nums">
        {formatSalary(entry)} {entry.kind === 'hourly' ? '/ საათში' : '/ თვეში'}
      </span>
      <span className="text-xs text-muted-foreground">
        {salaryKindLabels[entry.kind]} · {salaryBasisLabels[entry.amountBasis]}
      </span>
    </div>
  )
}

function HistoryAudit({
  entry,
  timezone,
}: {
  entry: SalaryHistoryEntry
  timezone: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <time
        className="text-xs text-muted-foreground"
        dateTime={entry.recordedAt}
      >
        {formatGeorgianDateTime(entry.recordedAt, timezone)}
      </time>
      {entry.audit ? (
        <>
          <span className="font-medium">{entry.audit.actorName}</span>
          <p className="max-w-prose whitespace-pre-wrap text-muted-foreground">
            {entry.audit.reason}
          </p>
        </>
      ) : null}
    </div>
  )
}
export function SalaryHistory({
  history,
  timezone,
  pagination,
  heading = 'ხელფასის ისტორია',
}: {
  history: SalaryHistoryEntry[]
  timezone: string
  pagination?: ReactNode
  heading?: string
}) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('effectiveFrom', {
          header: 'ამოქმედება',
          cell: ({ row }) => (
            <div className="flex flex-col gap-1">
              <time
                className="font-medium tabular-nums"
                dateTime={row.original.effectiveFrom}
              >
                {formatGeorgianDate(row.original.effectiveFrom)}
              </time>
              <span className="text-xs text-muted-foreground">
                ვერსია {row.original.version}
              </span>
            </div>
          ),
        }),
        helper.display({
          id: 'salary',
          header: 'ხელფასი',
          cell: ({ row }) => <HistoryRate entry={row.original} />,
        }),
        helper.display({
          id: 'recorded',
          header: 'ჩანაწერი',
          cell: ({ row }) => (
            <HistoryAudit entry={row.original} timezone={timezone} />
          ),
        }),
      ]),
    [timezone],
  )
  const table = useTable({
    features,
    columns,
    data: history,
    getRowId: (row) => String(row.version),
  })
  return (
    <Card className="gap-0 rounded-2xl pb-0 sm:[--card-spacing:--spacing(5)]">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <IconHistory className="size-5" aria-hidden="true" />
          </span>
          <h2>{heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {history.length ? (
          <>
            <ul className="divide-y border-t sm:hidden">
              {history.map((entry) => (
                <li
                  key={entry.version}
                  className="flex flex-col gap-3 px-4 py-4 wrap-anywhere"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <time
                      className="text-xs text-muted-foreground tabular-nums"
                      dateTime={entry.effectiveFrom}
                    >
                      {formatGeorgianDate(entry.effectiveFrom)} თარიღიდან
                    </time>
                    <Badge variant="outline">ვერსია {entry.version}</Badge>
                  </div>
                  <HistoryRate entry={entry} />
                  <div className="rounded-lg bg-muted/40 p-3">
                    <HistoryAudit entry={entry} timezone={timezone} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table
                tabIndex={0}
                className="table-fixed outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <TableCaption className="sr-only">
                  ხელფასის შეთანხმებების ვერსიები, უახლესი ჩანაწერი პირველად
                </TableCaption>
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[32%]" />
                  <col className="w-[42%]" />
                </colgroup>
                <TableHeader className="border-t bg-muted/30">
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id}>
                      {group.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          scope="col"
                          className="px-3 whitespace-normal sm:px-5"
                        >
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
                        <TableCell
                          key={cell.id}
                          className="px-3 py-4 align-top wrap-anywhere whitespace-normal sm:px-5"
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <Empty className="mx-4 mb-4 rounded-xl border border-dashed py-8 md:py-8">
            <EmptyHeader>
              <EmptyTitle>ჩანაწერები არ არის</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {pagination ? (
          <div className="border-t p-4 sm:px-5">{pagination}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}
