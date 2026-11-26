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
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '#/components/ui/dropdown-menu'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '#/components/ui/table'
import { formatGeorgianDate } from '#/lib/date-format'
import type { EmploymentPeriod } from '../employment.types'

export function EmploymentDates({
  period,
}: {
  period: { startDate: string; endDate: string | null }
}) {
  return (
    <span className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-2">
      <span>{formatGeorgianDate(period.startDate)}</span>
      <span className="text-muted-foreground">
        {period.endDate
          ? `${formatGeorgianDate(period.endDate)} ჩათვლით`
          : 'დასრულების გარეშე'}
      </span>
    </span>
  )
}
const features = tableFeatures({})
const helper = createColumnHelper<typeof features, EmploymentPeriod>()

export function EmploymentPeriodsTable({
  periods,
  today,
  canEdit,
  onEdit,
}: {
  periods: EmploymentPeriod[]
  today: string
  canEdit: boolean
  onEdit: (period: EmploymentPeriod, mode: 'edit' | 'void') => void
}) {
  const columns = helper.columns([
    helper.display({
      id: 'dates',
      header: 'დასაქმების პერიოდი',
      cell: ({ row }) => (
        <div className="space-y-2 py-1">
          <EmploymentDates period={row.original} />
          <Badge
            variant={
              row.original.startDate > today
                ? 'blue'
                : row.original.endDate && row.original.endDate < today
                  ? 'secondary'
                  : 'green'
            }
          >
            {row.original.startDate > today
              ? 'დაგეგმილი'
              : row.original.endDate && row.original.endDate < today
                ? 'დასრულებული'
                : 'მიმდინარე'}
          </Badge>
        </div>
      ),
    }),
    ...(canEdit
      ? [
          helper.display({
            id: 'actions',
            header: () => <span className="sr-only">მოქმედებები</span>,
            cell: ({ row }) => (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${formatGeorgianDate(row.original.startDate)}: მოქმედებები`}
                    />
                  }
                >
                  <IconDots aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-max min-w-44 whitespace-nowrap"
                >
                  <DropdownMenuItem
                    onClick={() => onEdit(row.original, 'edit')}
                  >
                    <IconEdit aria-hidden="true" />
                    შეცვლა
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onEdit(row.original, 'void')}
                  >
                    <IconTrash aria-hidden="true" />
                    პერიოდის გაუქმება
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          }),
        ]
      : []),
  ])
  const table = useTable({
    features,
    columns,
    data: periods,
    getRowId: (row) => row.id,
  })
  return (
    <Table aria-label="დასაქმების პერიოდები">
      <TableHeader className="bg-muted/30">
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead
                key={header.id}
                className={
                  header.column.id === 'actions' ? 'w-14 px-4' : 'px-4'
                }
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
