import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, getRouteApi } from '@tanstack/react-router'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { IconAlertCircle, IconSearch } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { DataPagination } from '#/components/common/data-pagination'
import { formatWorkedTime } from '#/features/attendance/attendance.rules'
import { PayrollPageHeader } from '../components/payroll-page-header'
import { PayrollMonthControl } from '../components/payroll-month-control'
import { AttendancePayrollReviewSheet } from '../components/attendance-payroll-review-sheet'
import { attendancePayrollReviewQuery } from '../attendance-payroll.queries'
import { formatSalary, salaryKindLabels } from '../salary.presentation'
import type { AttendancePayrollReviewRow } from '../attendance-payroll.types'

const route = getRouteApi('/_authenticated/manage/payroll/review')
const features = tableFeatures({})
const helper = createColumnHelper<typeof features, AttendancePayrollReviewRow>()

export function AttendancePayrollReviewPage() {
  const { actor } = route.useRouteContext()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [searchDraft, setSearchDraft] = useState(search.q)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [selected, setSelected] = useState<{
    key: number
    month: string
    userId: string
    employeeName: string
  } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    // Sync URL back/forward query state into the local debounced search input.
    setSearchDraft(search.q)
  }, [search.q])

  useEffect(() => {
    // Debounce search text into validated URL search parameters without flooding history.
    if (searchDraft === search.q) return
    const timer = window.setTimeout(() => {
      void navigate({
        search: { ...search, q: searchDraft, page: 1 },
        replace: true,
        resetScroll: false,
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchDraft, search, navigate])

  const query = useQuery(attendancePayrollReviewQuery(actor.id, search))
  const view = query.data?.ok ? query.data.value : null
  const displayedMonth = view?.month ?? search.month

  const openEmployee = useCallback(
    (row: AttendancePayrollReviewRow, trigger?: HTMLButtonElement) => {
      if (!view) return
      triggerRef.current = trigger ?? null
      setSelected((prev) => ({
        key: (prev?.key ?? 0) + 1,
        month: view.month,
        userId: row.userId,
        employeeName: row.employeeName,
      }))
      setSheetOpen(true)
    },
    [view],
  )

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'employee',
          header: 'თანამშრომელი',
          cell: ({ row: { original: r } }) => (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="link"
                className="h-auto justify-start p-0 text-left"
                aria-haspopup="dialog"
                onClick={(event) => openEmployee(r, event.currentTarget)}
              >
                {r.employeeName}
              </Button>
              {r.hasMixedSalaryKinds ? (
                <Badge variant="outline">შერეული (ფიქს. + საათ.)</Badge>
              ) : r.salaryKind ? (
                <Badge variant="outline">{salaryKindLabels[r.salaryKind]}</Badge>
              ) : null}
            </div>
          ),
        }),
        helper.display({
          id: 'status',
          header: 'სტატუსი',
          cell: ({ row: { original: r } }) =>
            r.needsReviewCount > 0 ? (
              <Badge variant="yellow">
                გადასამოწმებელია ({r.needsReviewCount})
              </Badge>
            ) : r.totalItems > 0 ? (
              <Badge variant="green">მზადაა ({r.totalItems})</Badge>
            ) : (
              <Badge variant="secondary">ჩანაწერები არ არის</Badge>
            ),
        }),
        helper.display({
          id: 'restDay',
          header: 'დასვენების დღის წესები',
          cell: ({ row: { original: r } }) => (
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={r.restDayClockInAllowed ? 'secondary' : 'orange'}>
                შესვლა: {r.restDayClockInAllowed ? 'ჩართ.' : 'გამორთ.'}
              </Badge>
              {r.salaryKind === 'monthly' ? (
                <Badge
                  variant={r.autoRestDayBonusEnabled ? 'green' : 'secondary'}
                >
                  ბონუსი: {r.autoRestDayBonusEnabled ? 'ჩართ.' : 'გამორთ.'}
                </Badge>
              ) : r.salaryKind === 'hourly' ? (
                <Badge variant="green">დასვენების დღე: +30%</Badge>
              ) : null}
            </div>
          ),
        }),
        helper.accessor('autoBonusMinor', {
          header: 'ავტომატური ბონუსი',
          cell: ({ getValue }) => (
            <span className="tabular-nums">
              {formatSalary({ amountMinor: getValue() })}
            </span>
          ),
        }),
        helper.accessor('hourlyCalculatedMinor', {
          header: 'საათობრივი დარიცხვა',
          cell: ({ getValue, row: { original: r } }) => (
            <div className="flex flex-col tabular-nums">
              <span>{formatSalary({ amountMinor: getValue() })}</span>
              {r.hourlyPayableSeconds > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {formatWorkedTime(r.hourlyPayableSeconds)}
                </span>
              ) : null}
            </div>
          ),
        }),
      ]),
    [openEmployee],
  )

  const data: AttendancePayrollReviewRow[] = view?.records ?? []
  const table = useTable({
    features,
    data,
    columns,
    getRowId: (record) => record.userId,
  })

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PayrollPageHeader
        actor={actor}
        active="review"
        month={displayedMonth}
        title="დასწრებით გამოთვლები"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {displayedMonth ? (
            <PayrollMonthControl
              month={displayedMonth}
              onChange={(month) =>
                void navigate({
                  search: { ...search, month, page: 1 },
                  resetScroll: false,
                })
              }
            />
          ) : (
            <Skeleton className="h-9 w-36 rounded-full" aria-hidden="true" />
          )}
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <IconSearch
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="თანამშრომლის ძიება"
              placeholder="ძიება სახელით ან მომხმარებლით"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="only-flagged-filter"
              checked={search.onlyFlagged}
              onCheckedChange={(checked) =>
                void navigate({
                  search: { ...search, onlyFlagged: checked, page: 1 },
                  resetScroll: false,
                })
              }
            />
            <Label htmlFor="only-flagged-filter" className="text-sm">
              მხოლოდ გადასამოწმებელი
            </Label>
          </div>
        </div>
        {query.isPending ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="დასწრებით გამოთვლები იტვირთება"
          >
            <Skeleton className="h-80 rounded-xl" aria-hidden="true" />
          </div>
        ) : !view ? (
          <Alert variant="destructive">
            <IconAlertCircle aria-hidden="true" />
            <AlertDescription>
              {query.data && !query.data.ok
                ? query.data.message
                : 'გამოთვლები ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            {view.records.length > 0 ? (
              <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
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
                        className="cursor-pointer focus-within:bg-muted/50"
                        onClick={(event) => {
                          if (
                            (event.target as HTMLElement).closest(
                              'button,a,input',
                            )
                          )
                            return
                          openEmployee(row.original)
                        }}
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
              </div>
            ) : (
              <Empty className="rounded-xl border border-dashed py-12">
                <EmptyHeader>
                  <EmptyTitle>
                    {search.onlyFlagged
                      ? 'გადასამოწმებელი ჩანაწერები არ არის'
                      : search.q
                        ? 'შესაბამისი თანამშრომელი არ მოიძებნა'
                        : 'ამ თვეში გამოთვლები ჯერ არ არის'}
                  </EmptyTitle>
                  {search.q || search.onlyFlagged ? (
                    <EmptyContent>შეცვალეთ ფილტრის პირობები.</EmptyContent>
                  ) : null}
                </EmptyHeader>
              </Empty>
            )}
            <DataPagination
              page={search.page}
              total={view.total}
              pageSize={view.pageSize}
              renderLink={(page) => (
                <Link
                  to="/manage/payroll/review"
                  search={{ ...search, page }}
                  resetScroll={false}
                />
              )}
            />
          </div>
        )}
      </div>
      {selected ? (
        <AttendancePayrollReviewSheet
          key={selected.key}
          actorId={actor.id}
          month={selected.month}
          userId={selected.userId}
          employeeName={selected.employeeName}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          finalFocus={triggerRef}
        />
      ) : null}
    </div>
  )
}
