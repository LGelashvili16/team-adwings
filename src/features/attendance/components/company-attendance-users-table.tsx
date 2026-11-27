import { formatGeorgianDateTime } from '#/lib/date-format'
import { useMemo } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  IconArrowsSort,
  IconChevronRight,
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { workLocationLabel } from '#/features/scheduling/scheduling.content'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import type {
  CompanyAttendanceAccount,
  CompanyAttendanceSearch,
} from '../company-attendance.types'

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, CompanyAttendanceAccount>()
export function CompanyAttendanceUsersTable({
  items,
  search,
  timezone,
}: {
  items: Array<CompanyAttendanceAccount>
  timezone: string
  search: CompanyAttendanceSearch
}) {
  const navigate = useNavigate()
  const sort = (search.sort ?? 'name-asc').replace('code-', 'username-')
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('name', {
          header: () => (
            <Button
              variant="link"
              size="sm"
              nativeButton={false}
              role="link"
              render={
                <Link
                  to="/manage/attendance"
                  search={{
                    ...search,
                    page: 1,
                    sort: sort === 'name-asc' ? 'name-desc' : 'name-asc',
                  }}
                />
              }
            >
              თანამშრომელი
              {sort.startsWith('name') ? (
                sort.endsWith('desc') ? (
                  <IconArrowDown data-icon="inline-end" aria-hidden="true" />
                ) : (
                  <IconArrowUp data-icon="inline-end" aria-hidden="true" />
                )
              ) : (
                <IconArrowsSort data-icon="inline-end" aria-hidden="true" />
              )}
            </Button>
          ),
          cell: ({ row }) => (
            <div className="flex min-w-48 items-center gap-3">
              <Avatar aria-hidden="true">
                <AvatarFallback>
                  {row.original.name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')
                    .toLocaleUpperCase('ka-GE')}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <Link
                  className="group w-fit rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  to="/manage/attendance/$userId"
                  params={{ userId: row.original.userId }}
                >
                  <span className="group-hover:underline group-hover:underline-offset-4">
                    {row.original.name}
                  </span>
                </Link>
                {row.original.username ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    @{row.original.username}
                  </span>
                ) : null}
              </div>
            </div>
          ),
        }),
        helper.accessor('jobTitle', {
          header: 'თანამდებობა',
          cell: ({ row }) => (
            <span className="text-sm text-muted-foreground">
              {row.original.jobTitle || 'არ არის მითითებული'}
            </span>
          ),
        }),
        helper.accessor('salaryKind', {
          header: 'ხელფასის ტიპი',
          cell: ({ row }) => {
            const kind = row.original.salaryKind
            if (kind === 'hourly')
              return <Badge variant="blue">საათობრივი</Badge>
            if (kind === 'monthly')
              return <Badge variant="outline">ყოველთვიური</Badge>
            return (
              <span className="text-sm text-muted-foreground">
                არ არის მითითებული
              </span>
            )
          },
        }),
        helper.accessor('attendanceStatus', {
          header: 'დღევანდელი დასწრება',
          cell: ({ row }) => {
            const status = row.original.attendanceStatus
            return (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status === 'working' ? 'green' : 'secondary'}>
                  {status === 'working'
                    ? 'სამუშაოზეა'
                    : status === 'recorded'
                      ? 'დაფიქსირებულია'
                      : status === 'unavailable'
                        ? 'წვდომა შეზღუდულია'
                        : status === 'former'
                          ? 'ყოფილი თანამშრომელი'
                          : 'არ დაფიქსირებულა'}
                </Badge>
                {row.original.remoteWorkday ? (
                  <Badge variant="blue">{workLocationLabel(true)}</Badge>
                ) : null}
              </div>
            )
          },
        }),
        helper.accessor('latestCheckIn', {
          header: 'ბოლო შემოსვლა',
          cell: ({ row }) =>
            row.original.latestCheckIn ? (
              <time dateTime={row.original.latestCheckIn}>
                {formatGeorgianDateTime(row.original.latestCheckIn, timezone)}
              </time>
            ) : (
              <span className="text-muted-foreground">
                {row.original.attendanceStatus === 'unavailable'
                  ? 'წვდომა შეზღუდულია'
                  : 'არ დაფიქსირებულა'}
              </span>
            ),
        }),
        helper.display({
          id: 'details',
          header: 'დასწრება',
          cell: ({ row }) => (
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              role="link"
              render={
                <Link
                  to="/manage/attendance/$userId"
                  params={{ userId: row.original.userId }}
                  aria-label={`სესიების ნახვა: ${row.original.name}`}
                />
              }
            >
              <IconChevronRight aria-hidden="true" />
            </Button>
          ),
        }),
      ]),
    [search, sort, timezone],
  )
  const table = useTable({
    features,
    columns,
    data: items,
    getRowId: (row) => row.userId,
  })
  return (
    <Table className="min-w-[56rem]">
      <TableHeader className="bg-muted/40">
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead
                key={header.id}
                className={
                  header.column.id === 'details'
                    ? 'h-12 px-4 text-right'
                    : 'h-12 px-4'
                }
                aria-sort={
                  sort.startsWith(header.column.id)
                    ? sort.endsWith('desc')
                      ? 'descending'
                      : 'ascending'
                    : undefined
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
          <TableRow
            key={row.id}
            className="cursor-pointer focus-within:bg-muted/50"
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                window.getSelection()?.toString() ||
                (event.target instanceof Element &&
                  event.target.closest(
                    'a, button, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]',
                  ))
              )
                return
              void navigate({
                to: '/manage/attendance/$userId',
                params: { userId: row.original.userId },
              })
            }}
          >
            {row.getAllCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={
                  cell.column.id === 'details'
                    ? 'px-4 py-4 text-right'
                    : 'px-4 py-4'
                }
              >
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
