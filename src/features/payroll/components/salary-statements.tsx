import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
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
import { PaymentBreakdown } from './payment-breakdown'

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
          ? 'whitespace-nowrap text-destructive tabular-nums'
          : 'whitespace-nowrap tabular-nums'
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
      <strong className="text-base font-semibold tracking-tight whitespace-nowrap tabular-nums">
        {formatSalary({ amountMinor: statement.totalMinor })}
      </strong>
      {statement.amountBasis === 'gross' ? (
        <span className="text-xs text-muted-foreground">
          {salaryBasisLabels.gross}
        </span>
      ) : null}
    </div>
  )
}

const features = tableFeatures({})
const column = createColumnHelper<typeof features, SalaryStatement>()
const statementColumns = (recentAfter: number) =>
  column.columns([
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
    column.display({
      id: 'payments',
      header: 'გადახდები',
      cell: ({ row }) =>
        row.original.payments?.length ? (
          <PaymentBreakdown
            payments={row.original.payments}
            recentAfter={recentAfter}
          />
        ) : (
          <Badge variant="secondary">არქივი</Badge>
        ),
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
  const [recentAfter, setRecentAfter] = useState(0)
  let nextExpiry = Infinity
  for (const record of records) {
    for (const payment of record.payments ?? []) {
      const expires = payment.recentUntil ?? 0
      if (expires > recentAfter) nextExpiry = Math.min(nextExpiry, expires)
    }
  }
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return
    // Expire server-provided indicators even when the page stays open offline.
    const timer = window.setTimeout(
      () => setRecentAfter(Math.max(nextExpiry, Date.now())),
      Math.max(0, nextExpiry - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [nextExpiry])
  const columns = useMemo(() => statementColumns(recentAfter), [recentAfter])
  const table = useTable({ features, columns, data: records, getRowId })
  return (
    <Card className="@container gap-0 rounded-2xl pb-0 sm:[--card-spacing:--spacing(5)]">
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <IconCalendarDollar className="size-5" aria-hidden="true" />
            </span>
            <h2>გაცემული ხელფასები</h2>
          </CardTitle>
          {filter}
        </div>
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
            <ul className="divide-y border-t @3xl:hidden">
              {records.map((record) => (
                <li
                  key={record.month}
                  className="flex flex-col gap-4 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <time dateTime={record.month} className="font-semibold">
                      {formatGeorgianMonth(record.month)}
                    </time>
                    {record.payments?.length ? null : (
                      <Badge variant="secondary">არქივი</Badge>
                    )}
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
                      <dd className="text-right">
                        <StatementTotal statement={record} />
                      </dd>
                    </div>
                  </dl>
                  {record.payments?.length ? (
                    <PaymentBreakdown
                      payments={record.payments}
                      recentAfter={recentAfter}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="hidden @3xl:block">
              <Table>
                <TableCaption className="sr-only">
                  სახელფასო გადახდების ისტორია
                </TableCaption>
                <TableHeader className="border-t bg-muted/35">
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id}>
                      {group.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          scope="col"
                          className="px-3 whitespace-normal sm:px-4"
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
                          className="px-3 py-4 align-top whitespace-normal sm:px-4"
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
                  ? 'ამ თვეში გაცემული თანხები არ არის'
                  : 'გაცემული თანხები ჯერ არ არის'}
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
