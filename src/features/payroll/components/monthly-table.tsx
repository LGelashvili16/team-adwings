import { useMemo } from 'react'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
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

const features = tableFeatures({}),
  helper = createColumnHelper<typeof features, MonthlyDirectoryRow>()
const amounts = {
  baseMinor: 'საბაზო თანხა',
  bonusMinor: 'ბონუსები',
  premiumMinor: 'პრემიები',
  fineMinor: 'ჯარიმები',
  totalMinor: 'ჯამი',
} as const
export function MonthlyTable({
  records,
  onOpen,
  adjustmentsOnly = false,
  adjustmentActions,
}: {
  records: MonthlyDirectoryRow[]
  onOpen: (entry: MonthlyDirectoryRow, trigger?: HTMLButtonElement) => void
  adjustmentsOnly?: boolean
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
              {!adjustmentsOnly ? (
                <span className="text-xs text-muted-foreground">
                  {r.status === null
                    ? 'ჩანაწერი ჯერ არ არის'
                    : r.salary
                      ? salaryKindLabels[r.salary.kind]
                      : 'საბაზო თანხა დასადასტურებელია'}
                </span>
              ) : null}
              {r.status === 'finalized' ? (
                <Badge variant="green">დასრულებული</Badge>
              ) : null}
            </div>
          ),
        }),
        ...(adjustmentsOnly
          ? (['bonusMinor', 'premiumMinor', 'fineMinor'] as const)
          : ([
              'baseMinor',
              'bonusMinor',
              'premiumMinor',
              'fineMinor',
              'totalMinor',
            ] as const)
        ).map((key) =>
          helper.accessor(key, {
            header: amounts[key],
            cell: ({ getValue, row }) => {
              const amount = getValue()
              const salary = row.original.salary
              if (
                amount === null ||
                (!salary && (key === 'baseMinor' || key === 'totalMinor'))
              )
                return '—'
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
                <span className="tabular-nums">{formatted}</span>
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
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => adjustmentActions.onRemove(record)}
                          >
                            <IconTrash aria-hidden="true" />
                            ჩანაწერების ამოღება
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null,
              }),
            ]
          : []),
      ]),
    [onOpen, adjustmentsOnly, adjustmentActions],
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
