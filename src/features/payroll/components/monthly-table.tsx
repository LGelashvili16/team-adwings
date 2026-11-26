import { useMemo } from 'react'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { formatGeorgianDate } from '#/lib/date-format'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
  TableCaption,
} from '#/components/ui/table'
import {
  formatSalary,
  salaryKindLabels,
  salaryBasisLabels,
} from '../salary.presentation'
import type { MonthlyDirectoryRow } from '../monthly.types'
import {
  monthlyAdjustmentColumns,
  monthlyPayrollColumns,
} from '../monthly.rules'

const features = tableFeatures({}),
  helper = createColumnHelper<typeof features, MonthlyDirectoryRow>()
export function MonthlyTable({
  records,
  onOpen,
  adjustmentsOnly = false,
  period = 'all',
  adjustmentActions,
}: {
  records: MonthlyDirectoryRow[]
  onOpen: (entry: MonthlyDirectoryRow, trigger?: HTMLButtonElement) => void
  adjustmentsOnly?: boolean
  period?: 'all' | 'first' | 'salary'
  adjustmentActions?: {
    actorId: string
    onRemove: (entry: MonthlyDirectoryRow) => void
  }
}) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'employee',
          header: 'თანამშრომელი',
          cell: ({ row: { original: r } }) => (
            <div className="flex min-w-48 flex-col items-start gap-1 whitespace-normal">
              <Button
                variant="link"
                className="h-auto justify-start p-0 whitespace-normal text-left"
                aria-haspopup="dialog"
                onClick={(event) => onOpen(r, event.currentTarget)}
              >
                {r.employeeName}
              </Button>
              {!adjustmentsOnly && r.paidMinor !== null ? (
                <span className="text-xs font-medium tabular-nums">
                  გაცემულია {formatSalary({ amountMinor: r.paidMinor })}
                </span>
              ) : !adjustmentsOnly ? (
                <span className="text-xs text-muted-foreground">
                  {r.baseNeedsConfirmation ||
                  (!r.salary && r.status === 'draft')
                    ? 'თვის ხელფასი დასადასტურებელია'
                    : r.salary
                      ? salaryKindLabels[r.salary.kind]
                      : 'ჩანაწერი ჯერ არ არის'}
                </span>
              ) : null}
              {r.status === 'finalized' ? (
                <Badge variant="green">დასრულებული</Badge>
              ) : null}
            </div>
          ),
        }),
        ...(adjustmentsOnly
          ? monthlyAdjustmentColumns
          : monthlyPayrollColumns(period)
        ).map(([key, label]) =>
          helper.accessor(key, {
            header: label,
            cell: ({ getValue, row }) => {
              const amount = getValue()
              const salary = row.original.salary
              if (
                period === 'all' &&
                key === 'baseMinor' &&
                amount === null &&
                salary
              ) {
                return (
                  <div className="flex flex-col gap-1">
                    <span className="tabular-nums">{formatSalary(salary)}</span>
                    <span className="text-xs text-muted-foreground">
                      {salary.kind === 'hourly' ? 'საათში' : 'შეთანხმებული'}
                    </span>
                  </div>
                )
              }
              if (amount === null) return '—'
              const formatted = formatSalary({ amountMinor: amount })
              return key === 'totalMinor' && salary ? (
                <div className="flex flex-col gap-1">
                  <span className="font-semibold tabular-nums">
                    {formatted}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {salaryBasisLabels[salary.amountBasis]}
                  </span>
                </div>
              ) : (
                <span
                  className={
                    key === 'fineMinor' && amount > 0
                      ? 'font-medium text-badge-red-foreground tabular-nums'
                      : 'tabular-nums'
                  }
                >
                  {formatted}
                </span>
              )
            },
          }),
        ),
        ...(adjustmentsOnly
          ? [
              helper.accessor(
                (row) =>
                  (row.bonusMinor ?? 0) +
                  (row.premiumMinor ?? 0) -
                  (row.fineMinor ?? 0),
                {
                  id: 'adjustmentTotal',
                  header: 'დამატებების ჯამი',
                  cell: ({ getValue }) => (
                    <strong className="tabular-nums">
                      {formatSalary({ amountMinor: getValue() })}
                    </strong>
                  ),
                },
              ),
              helper.display({
                id: 'adjustmentDates',
                header: 'გაცემის თარიღი',
                cell: ({ row: { original } }) =>
                  original.adjustmentDates.length ? (
                    <ul className="flex min-w-36 flex-col gap-2">
                      {original.adjustmentDates.map(
                        ({ stage, start, end, paid }) => (
                          <li
                            key={stage}
                            className="flex flex-col gap-0.5 whitespace-normal"
                          >
                            <span>
                              <time dateTime={start}>
                                {formatGeorgianDate(start)}
                              </time>
                              {end ? (
                                <>
                                  {' '}
                                  -{' '}
                                  <time dateTime={end}>
                                    {formatGeorgianDate(end)}
                                  </time>
                                </>
                              ) : null}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {stage === 'salary'
                                ? paid
                                  ? 'ჯარიმა დაქვითულია'
                                  : 'ჯარიმის დაქვითვა'
                                : paid
                                  ? 'გაცემულია'
                                  : 'დაგეგმილია'}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    '—'
                  ),
              }),
            ]
          : []),
        ...(adjustmentActions
          ? [
              helper.display({
                id: 'actions',
                header: () => <span className="sr-only">მოქმედებები</span>,
                cell: ({ row: { original: record } }) =>
                  record.status === 'draft' &&
                  record.userId !== adjustmentActions.actorId ? (
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${record.employeeName}: მოქმედებები`}
                            />
                          }
                        >
                          <IconDots aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-max whitespace-nowrap"
                        >
                          <DropdownMenuItem onClick={() => onOpen(record)}>
                            <IconEdit aria-hidden="true" />
                            რედაქტირება
                          </DropdownMenuItem>
                          {!record.paidAdjustments ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => adjustmentActions.onRemove(record)}
                            >
                              <IconTrash aria-hidden="true" />
                              ჩანაწერების ამოღება
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null,
              }),
            ]
          : []),
      ]),
    [onOpen, adjustmentsOnly, adjustmentActions, period],
  )
  const table = useTable({
    features,
    columns,
    data: records,
    getRowId: (record) => record.userId,
  })
  return (
    <Table
      tabIndex={0}
      className="focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TableCaption className="sr-only">
        თანამშრომლების თვის სახელფასო ჩანაწერები
      </TableCaption>
      <TableHeader>
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
          <TableRow
            key={row.id}
            className={
              adjustmentsOnly
                ? undefined
                : 'cursor-pointer focus-within:bg-muted/50'
            }
            onClick={
              adjustmentsOnly
                ? undefined
                : (event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest('button')
                    )
                      return
                    onOpen(
                      row.original,
                      event.currentTarget.querySelector('button') ?? undefined,
                    )
                  }
            }
          >
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className="px-4 py-3 align-top">
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
