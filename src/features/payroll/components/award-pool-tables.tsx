import { useMemo } from 'react'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { formatSalary } from '../salary.presentation'
import {
  awardStatusLabels,
  awardStatusVariants,
} from '../award-proposals.presentation'
import { formatGeorgianDateTime } from '#/lib/date-format'
import type { ReactNode } from 'react'
import type { PoolVersion } from '../award-pools.types'

const features = tableFeatures({})
type Share = PoolVersion['allocations'][number]
type ShareRow = Share & { amountCell?: ReactNode; actionCell?: ReactNode }
const helper = createColumnHelper<typeof features, ShareRow>(),
  historyHelper = createColumnHelper<typeof features, PoolVersion>()
// Stable cell component identities preserve input focus and field registration while typing.
const allocationColumns = helper.columns([
  helper.display({
    id: 'name',
    header: 'ბენეფიციარი',
    cell: ({ row }) => (
      <span className="block min-w-36 whitespace-normal wrap-anywhere">
        {row.original.name}
      </span>
    ),
  }),
  helper.display({
    id: 'amount',
    header: 'წილი ლარში',
    cell: ({ row }) =>
      row.original.amountCell ?? (
        <span className="font-medium tabular-nums">
          {formatSalary(row.original)}
        </span>
      ),
  }),
  helper.display({
    id: 'actions',
    header: () => <span className="sr-only">მოქმედებები</span>,
    cell: ({ row }) => row.original.actionCell,
  }),
])
export function PoolAllocationTable({
  rows,
  renderAmount,
  renderAction,
}: {
  rows: Share[]
  renderAmount?: (row: Share, index: number) => ReactNode
  renderAction?: (row: Share, index: number) => ReactNode
}) {
  const table = useTable({
    features,
    columns: allocationColumns,
    data: rows.map((row, index) => ({
      ...row,
      amountCell: renderAmount?.(row, index),
      actionCell: renderAction?.(row, index),
    })),
    getRowId: (r) => r.userId,
  })
  return (
    <Table
      tabIndex={0}
      className="focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TableCaption className="sr-only">
        საერთო ფონდის ბენეფიციარები და წილები
      </TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((g) => (
          <TableRow key={g.id}>
            {g.headers.map((h) => (
              <TableHead scope="col" key={h.id} className="px-4">
                <table.FlexRender header={h} />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((r) => (
          <TableRow key={r.id}>
            {r.getAllCells().map((c) => (
              <TableCell key={c.id} className="px-4 py-3 align-top">
                <table.FlexRender cell={c} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
export function PoolHistoryTable({
  records,
  timezone,
}: {
  records: PoolVersion[]
  timezone: string
}) {
  const columns = useMemo(
    () =>
      historyHelper.columns([
        historyHelper.display({
          id: 'version',
          header: 'ვერსია და თანხა',
          cell: ({ row }) => (
            <div className="flex min-w-48 flex-col gap-2">
              <span className="font-medium">ვერსია {row.original.version}</span>
              <Badge variant={awardStatusVariants[row.original.status]}>
                {awardStatusLabels[row.original.status]}
              </Badge>
              <span className="font-semibold tabular-nums">
                {formatSalary({ amountMinor: row.original.totalMinor })}
              </span>
              <p className="max-w-sm text-sm whitespace-normal wrap-anywhere">
                {row.original.evidence}
              </p>
            </div>
          ),
        }),
        historyHelper.display({
          id: 'allocations',
          header: 'შენახული განაწილება',
          cell: ({ row }) => (
            <dl className="flex min-w-64 flex-col gap-2">
              {row.original.allocations.map((a) => (
                <div key={a.userId} className="flex justify-between gap-4">
                  <dt className="max-w-56 whitespace-normal wrap-anywhere">
                    {a.name}
                  </dt>
                  <dd className="tabular-nums">{formatSalary(a)}</dd>
                </div>
              ))}
            </dl>
          ),
        }),
        historyHelper.display({
          id: 'reason',
          header: 'გადაწყვეტილების საფუძველი',
          cell: ({ row }) => (
            <div className="flex min-w-52 max-w-sm flex-col gap-2 whitespace-normal wrap-anywhere">
              <span>{row.original.actorName}</span>
              <time
                dateTime={row.original.recordedAt}
                className="text-xs text-muted-foreground"
              >
                {formatGeorgianDateTime(row.original.recordedAt, timezone)}
              </time>
              <p>{row.original.reason}</p>
              {row.original.evidenceVerified ? (
                <Badge variant="green">მტკიცებულება გადამოწმებულია</Badge>
              ) : null}
            </div>
          ),
        }),
      ]),
    [timezone],
  )
  const table = useTable({ features, columns, data: records })
  return (
    <Table
      tabIndex={0}
      className="focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TableCaption className="sr-only">
        საერთო ფონდის განაწილებისა და გადაწყვეტილებების ისტორია
      </TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((g) => (
          <TableRow key={g.id}>
            {g.headers.map((h) => (
              <TableHead scope="col" key={h.id} className="px-4">
                <table.FlexRender header={h} />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((r) => (
          <TableRow key={r.id}>
            {r.getAllCells().map((c) => (
              <TableCell key={c.id} className="px-4 py-4 align-top">
                <table.FlexRender cell={c} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
