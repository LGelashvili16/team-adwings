import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { IconChevronRight } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '#/components/ui/table'
import { formatGeorgianDate } from '#/lib/date-format'
import {
  salaryBasisLabels,
  salaryKindLabels,
  formatSalary,
} from '../salary.presentation'
import type { SalaryEmployee } from '../salary.types'

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, SalaryEmployee>()
export function SalaryDirectoryTable({
  records,
  actorId,
  canEdit,
  selected,
  onSelect,
}: {
  records: SalaryEmployee[]
  actorId: string
  canEdit: boolean
  selected: ReadonlySet<string>
  onSelect: (ids: string[], checked: boolean) => void
}) {
  const columns = useMemo(
    () =>
      helper.columns([
        ...(canEdit
          ? [
              helper.display({
                id: 'select',
                header: () => (
                  <Checkbox
                    aria-label="ამ გვერდის თანამშრომლების არჩევა"
                    checked={
                      records.filter((row) => row.userId !== actorId).length >
                        0 &&
                      records
                        .filter((row) => row.userId !== actorId)
                        .every((row) => selected.has(row.userId))
                    }
                    onCheckedChange={(checked) =>
                      onSelect(
                        records
                          .filter((row) => row.userId !== actorId)
                          .map((row) => row.userId),
                        checked === true,
                      )
                    }
                  />
                ),
                cell: ({ row }) => (
                  <Checkbox
                    aria-label={`${row.original.name}: არჩევა`}
                    disabled={row.original.userId === actorId}
                    checked={selected.has(row.original.userId)}
                    onCheckedChange={(checked) =>
                      onSelect([row.original.userId], checked === true)
                    }
                  />
                ),
              }),
            ]
          : []),
        helper.accessor('name', {
          header: 'თანამშრომელი',
          cell: ({ row }) => (
            <div className="flex min-w-48 flex-col gap-1 whitespace-normal">
              <Link
                className="font-medium hover:underline"
                to="/manage/payroll/$userId"
                params={{ userId: row.original.userId }}
              >
                {row.original.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {row.original.username
                  ? `@${row.original.username}`
                  : 'მომხმარებლის სახელი არ არის მითითებული'}
              </span>
              {row.original.jobTitle ? (
                <span className="text-xs text-muted-foreground">
                  {row.original.jobTitle}
                </span>
              ) : null}
              {row.original.status === 'inactive' ? (
                <Badge variant="secondary">არააქტიური</Badge>
              ) : null}
            </div>
          ),
        }),
        helper.display({
          id: 'salary',
          header: 'მოქმედი ხელფასი',
          cell: ({ row }) =>
            row.original.current ? (
              <div className="flex flex-col gap-1">
                <span className="font-medium tabular-nums">
                  {formatSalary(row.original.current)}{' '}
                  {row.original.current.kind === 'hourly'
                    ? '/ საათში'
                    : '/ თვეში'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {salaryBasisLabels[row.original.current.amountBasis]}
                </span>
                <Badge variant="secondary">
                  {salaryKindLabels[row.original.current.kind]}
                </Badge>
              </div>
            ) : (
              <Badge variant="yellow">განსასაზღვრი</Badge>
            ),
        }),
        helper.display({
          id: 'next',
          header: 'შემდეგი ცვლილება',
          cell: ({ row }) =>
            row.original.next ? (
              <div className="flex flex-col gap-1">
                <span className="tabular-nums">
                  {formatSalary(row.original.next)}{' '}
                  {row.original.next.kind === 'hourly' ? '/ საათში' : '/ თვეში'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatGeorgianDate(row.original.next.effectiveFrom)}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">არ არის დაგეგმილი</span>
            ),
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">დეტალები</span>,
          cell: ({ row }) => (
            <Button
              variant="ghost"
              size="icon"
              nativeButton={false}
              role="link"
              aria-label={`${row.original.name}: ხელფასის ნახვა`}
              render={
                <Link
                  to="/manage/payroll/$userId"
                  params={{ userId: row.original.userId }}
                />
              }
            >
              <IconChevronRight aria-hidden="true" />
            </Button>
          ),
        }),
      ]),
    [actorId, canEdit, records, selected, onSelect],
  )
  const table = useTable({
    features,
    columns,
    data: records,
    getRowId: (row) => row.userId,
  })
  return (
    <Table>
      <TableCaption className="sr-only">
        თანამშრომლების მოქმედი და დაგეგმილი ხელფასები
      </TableCaption>
      <TableHeader className="bg-muted/30">
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
          <TableRow
            key={row.id}
            data-state={selected.has(row.id) ? 'selected' : undefined}
          >
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className="px-4 py-4">
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
