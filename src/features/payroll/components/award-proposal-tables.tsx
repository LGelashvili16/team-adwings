import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
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
import { formatGeorgianDate, formatGeorgianDateTime } from '#/lib/date-format'
import { bonusKindLabels, bonusUnitLabel } from '../bonus-rules.presentation'
import {
  formatAwardQuantity,
  awardStatusLabels,
} from '../award-proposals.presentation'
import { formatSalary, salaryBasisLabels } from '../salary.presentation'
import type { AwardSummary, AwardVersion } from '../award-proposals.types'

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, AwardSummary>(),
  historyHelper = createColumnHelper<typeof features, AwardVersion>()
export function AwardAmount({ value }: { value: AwardVersion }) {
  return (
    <div className="flex min-w-48 flex-col gap-2 whitespace-normal">
      <span className="font-semibold tabular-nums">{formatSalary(value)}</span>
      <span className="text-xs text-muted-foreground">
        {salaryBasisLabels[value.rule.amountBasis]}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatAwardQuantity(value.quantityMilli)} × {formatSalary(value.rule)}{' '}
        · {bonusUnitLabel(value.rule)}
      </span>
      <span className="text-xs text-muted-foreground">
        წესის ვერსია {value.rule.version}
      </span>
    </div>
  )
}
export function AwardProposalsTable({ records }: { records: AwardSummary[] }) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'employee',
          header: 'თანამშრომელი და წესი',
          cell: ({ row }) => (
            <div className="flex min-w-52 max-w-sm flex-col gap-2 whitespace-normal wrap-anywhere">
              <Link
                to="/manage/payroll/awards/$proposalId"
                params={{ proposalId: row.original.proposalId }}
                search={{ page: 1 }}
                className="font-medium hover:underline"
              >
                {row.original.employeeName}
              </Link>
              <span className="text-sm">{row.original.current.rule.name}</span>
              <span className="text-xs text-muted-foreground">
                {bonusKindLabels[row.original.current.rule.kind]}
              </span>
            </div>
          ),
        }),
        helper.display({
          id: 'amount',
          header: 'შემოთავაზებული თანხა',
          cell: ({ row }) => <AwardAmount value={row.original.current} />,
        }),
        helper.display({
          id: 'source',
          header: 'შესრულება და წყარო',
          cell: ({ row }) => (
            <div className="flex min-w-48 max-w-sm flex-col gap-2 whitespace-normal wrap-anywhere">
              <span>{formatGeorgianDate(row.original.current.workDate)}</span>
              <span className="text-xs text-muted-foreground">
                {row.original.current.sourceSnapshot.jobTitle ??
                  row.original.current.reference}
              </span>
              <Badge
                variant={
                  row.original.current.status === 'proposed'
                    ? 'orange'
                    : 'secondary'
                }
              >
                {awardStatusLabels[row.original.current.status]}
              </Badge>
            </div>
          ),
        }),
      ]),
    [],
  )
  const table = useTable({ features, columns, data: records })
  return (
    <Table
      tabIndex={0}
      className="focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TableCaption className="sr-only">
        წახალისების ინდივიდუალური განაცხადები
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
export function AwardHistoryTable({ records }: { records: AwardVersion[] }) {
  const columns = useMemo(
    () =>
      historyHelper.columns([
        historyHelper.display({
          id: 'version',
          header: 'ვერსია',
          cell: ({ row }) => (
            <div className="flex min-w-44 flex-col gap-2">
              <span className="font-medium">ვერსია {row.original.version}</span>
              <span>{formatGeorgianDate(row.original.workDate)}</span>
              <Badge
                variant={
                  row.original.status === 'proposed' ? 'orange' : 'secondary'
                }
              >
                {awardStatusLabels[row.original.status]}
              </Badge>
            </div>
          ),
        }),
        historyHelper.display({
          id: 'amount',
          header: 'შენახული თანხა და მტკიცებულება',
          cell: ({ row }) => (
            <div className="flex max-w-sm flex-col gap-3 whitespace-normal wrap-anywhere">
              <AwardAmount value={row.original} />
              <p className="text-sm">{row.original.evidence}</p>
              {row.original.sourceSnapshot.completedAt ? (
                <time
                  dateTime={row.original.sourceSnapshot.completedAt}
                  className="text-xs text-muted-foreground"
                >
                  სამუშაო დასრულდა:{' '}
                  {formatGeorgianDateTime(
                    row.original.sourceSnapshot.completedAt,
                    row.original.sourceSnapshot.timezone,
                  )}
                </time>
              ) : null}
            </div>
          ),
        }),
        historyHelper.display({
          id: 'reason',
          header: 'ცვლილების საფუძველი',
          cell: ({ row }) => (
            <div className="flex min-w-52 max-w-sm flex-col gap-2 whitespace-normal wrap-anywhere">
              <span>{row.original.actorName}</span>
              <time
                className="text-xs text-muted-foreground"
                dateTime={row.original.recordedAt}
              >
                {formatGeorgianDateTime(
                  row.original.recordedAt,
                  row.original.sourceSnapshot.timezone,
                )}
              </time>
              <span className="text-sm">{row.original.reason}</span>
            </div>
          ),
        }),
      ]),
    [],
  )
  const table = useTable({ features, columns, data: records })
  return (
    <Table
      tabIndex={0}
      className="focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TableCaption className="sr-only">
        წახალისების განაცხადის ცვლილებების ისტორია
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
