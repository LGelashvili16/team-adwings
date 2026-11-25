import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { IconCalendarDollar, IconReceipt } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { formatGeorgianMonth } from '#/lib/date-format'
import { formatSalary, salaryBasisLabels } from '../salary.presentation'
import type { ReactNode } from 'react'
import type { SalaryStatement } from '../salary.types'

const components = [
  { key: 'baseMinor', label: 'საბაზო ხელფასი' },
  { key: 'bonusMinor', label: 'ბონუსები' },
  { key: 'premiumMinor', label: 'პრემიები' },
  { key: 'fineMinor', label: 'ჯარიმები' },
] as const
type AmountKey = (typeof components)[number]['key']

function StatementAmount({
  field,
  amount,
}: {
  field: AmountKey
  amount: number
}) {
  return (
    <span
      className={
        field === 'fineMinor' && amount > 0
          ? 'text-destructive tabular-nums'
          : 'tabular-nums'
      }
    >
      {field === 'fineMinor' && amount > 0 ? '−' : ''}
      {formatSalary({ amountMinor: amount })}
    </span>
  )
}

function StatementTotal({ statement }: { statement: SalaryStatement }) {
  return (
    <div className="flex flex-col gap-1">
      <strong className="text-base font-semibold tracking-tight tabular-nums">
        {formatSalary({ amountMinor: statement.totalMinor })}
      </strong>
      <span className="text-xs text-muted-foreground">
        {salaryBasisLabels[statement.amountBasis]}
      </span>
    </div>
  )
}

const features = tableFeatures({})
const column = createColumnHelper<typeof features, SalaryStatement>()
const columns = column.columns([
  column.accessor('month', {
    header: 'თვე',
    cell: ({ getValue }) => (
      <time className="font-medium" dateTime={getValue()}>
        {formatGeorgianMonth(getValue())}
      </time>
    ),
  }),
  ...components.map(({ key, label }) =>
    column.accessor(key, {
      header: label,
      cell: ({ getValue }) => (
        <StatementAmount field={key} amount={getValue()} />
      ),
    }),
  ),
  column.display({
    id: 'total',
    header: 'ჯამი',
    cell: ({ row }) => <StatementTotal statement={row.original} />,
  }),
])
const getRowId = (record: SalaryStatement) => record.month

export function SalaryStatements({
  records,
  filter,
  pagination,
  loading,
  filtered,
}: {
  records: SalaryStatement[]
  filter: ReactNode
  pagination?: ReactNode
  loading: boolean
  filtered: boolean
}) {
  const table = useTable({ features, columns, data: records, getRowId })
  return (
    <Card className="gap-0 rounded-2xl pb-0 sm:[--card-spacing:--spacing(5)]">
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <IconCalendarDollar className="size-5" aria-hidden="true" />
            </span>
            <h2>თვის უწყისები</h2>
          </CardTitle>
          {filter}
        </div>
        <p className="text-sm text-muted-foreground">
          აქ ჩანს დასრულებული უწყისები. გადარიცხვის სტატუსი აქ არ აისახება.
        </p>
      </CardHeader>
      <CardContent className="px-0">
        {loading ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="უწყისები იტვირთება"
            className="border-t p-4 sm:p-5"
          >
            <Skeleton className="h-36 rounded-xl" aria-hidden="true" />
          </div>
        ) : records.length ? (
          <>
            <ul className="divide-y border-t md:hidden">
              {records.map((record) => (
                <li
                  key={record.month}
                  className="flex flex-col gap-4 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <time dateTime={record.month} className="font-semibold">
                      {formatGeorgianMonth(record.month)}
                    </time>
                    <Badge variant="green">დასრულებული</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
                    {components.map(({ key, label }) => (
                      <div key={key} className="flex min-w-0 flex-col gap-1">
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd>
                          <StatementAmount field={key} amount={record[key]} />
                        </dd>
                      </div>
                    ))}
                    <div className="col-span-2 flex flex-wrap items-start justify-between gap-2 rounded-xl bg-muted/45 p-3">
                      <dt className="font-medium">ჯამი</dt>
                      <dd>
                        <StatementTotal statement={record} />
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableCaption className="sr-only">
                  დასრულებული სახელფასო უწყისები
                </TableCaption>
                <TableHeader className="border-t bg-muted/35">
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id}>
                      {group.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          scope="col"
                          className="px-4 whitespace-normal"
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
                          className="px-4 py-4 align-top last:bg-muted/20"
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
          <Empty className="mx-4 mb-4 rounded-xl border border-dashed bg-muted/15 py-8 sm:mx-5 md:py-8">
            <EmptyHeader>
              <EmptyMedia>
                <IconReceipt aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {filtered
                  ? 'ამ თვეში დასრულებული უწყისი არ არის'
                  : 'დასრულებული უწყისები ჯერ არ არის'}
              </EmptyTitle>
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
