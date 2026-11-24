import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { useMemo } from 'react'
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
export function SalaryHistory({
  history,
  timezone,
  pagination,
}: {
  history: SalaryHistoryEntry[]
  timezone: string
  pagination?: ReactNode
}) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('effectiveFrom', {
          header: 'ამოქმედება',
          cell: ({ row }) => (
            <div className="flex flex-col gap-1">
              <span>{formatGeorgianDate(row.original.effectiveFrom)}</span>
              <span className="text-xs text-muted-foreground">
                ვერსია {row.original.version}
              </span>
            </div>
          ),
        }),
        helper.display({
          id: 'salary',
          header: 'ხელფასი',
          cell: ({ row }) => (
            <div className="flex flex-col gap-1">
              <span className="font-medium tabular-nums">
                {formatSalary(row.original)}{' '}
                {row.original.kind === 'hourly' ? '/ საათში' : '/ თვეში'}
              </span>
              <span className="text-xs text-muted-foreground">
                {salaryKindLabels[row.original.kind]} ·{' '}
                {salaryBasisLabels[row.original.amountBasis]}
              </span>
            </div>
          ),
        }),
        helper.display({
          id: 'recorded',
          header: 'ჩანაწერი',
          cell: ({ row }) => (
            <div className="flex max-w-sm flex-col gap-1 whitespace-normal">
              <time
                className="text-xs text-muted-foreground"
                dateTime={row.original.recordedAt}
              >
                {formatGeorgianDateTime(row.original.recordedAt, timezone)}
              </time>
              {row.original.audit ? (
                <>
                  <span>{row.original.audit.actorName}</span>
                  <p className="whitespace-pre-wrap wrap-anywhere text-muted-foreground">
                    {row.original.audit.reason}
                  </p>
                </>
              ) : null}
            </div>
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>ხელფასის ისტორია</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {history.length ? (
          <div className="overflow-hidden rounded-xl border">
            <Table
              tabIndex={0}
              className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <TableCaption className="sr-only">
                ხელფასის შეთანხმებების ვერსიები, უახლესი ჩანაწერი პირველად
              </TableCaption>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id} scope="col" className="px-4">
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
                      <TableCell key={cell.id} className="px-4 py-4">
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty className="rounded-xl border border-dashed py-8 md:py-8">
            <EmptyHeader>
              <EmptyTitle>ჩანაწერები არ არის</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {pagination}
      </CardContent>
    </Card>
  )
}
