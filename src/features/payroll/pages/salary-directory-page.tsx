import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import {
  IconWallet,
  IconUsers,
  IconClock,
  IconAlertCircle,
} from '@tabler/icons-react'
import { Card, CardContent } from '#/components/ui/card'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { cn } from '#/lib/utils'
import { salaryDirectoryQuery } from '../salary.queries'
import { PayrollPageHeader } from '../components/payroll-page-header'
import { SalaryDirectoryFilters } from '../components/salary-directory-filters'
import { SalaryDirectoryTable } from '../components/salary-directory-table'
import type { Actor } from '#/lib/authorization/actor'
import type { SalaryDirectorySearch } from '../salary.schemas'

const route = getRouteApi('/_authenticated/manage/payroll/')
export function SalaryDirectoryPage() {
  const { actor } = route.useRouteContext()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PayrollPageHeader actor={actor} active="employees" title="ხელფასები" />
      <SalaryDirectoryResults
        key={JSON.stringify(search)}
        actor={actor}
        search={search}
        onFilterChange={(next) => {
          void navigate({ search: next, replace: true, resetScroll: false })
        }}
      />
    </div>
  )
}
function SalaryDirectoryResults({
  actor,
  search,
  onFilterChange,
}: {
  actor: Actor
  search: SalaryDirectorySearch
  onFilterChange: (search: SalaryDirectorySearch) => void
}) {
  const query = useQuery(salaryDirectoryQuery(actor.id, search))
  const view = query.data?.ok ? query.data.value : null
  const filters = (
    <SalaryDirectoryFilters search={search} onChange={onFilterChange} />
  )
  if (query.isPending)
    return (
      <>
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {filters}
          <div role="status" aria-busy="true" aria-label="ხელფასები იტვირთება">
            <Skeleton aria-hidden="true" className="h-80 rounded-xl" />
          </div>
        </div>
      </>
    )
  if (!view)
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {filters}
        <Alert variant="destructive">
          <IconAlertCircle aria-hidden="true" />
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : 'ხელფასები ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
          </AlertDescription>
        </Alert>
      </div>
    )
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: 'ყოველთვიური ხელფასი',
            value: view.counts.monthly,
            icon: IconWallet,
          },
          {
            label: 'საათობრივი ხელფასი',
            value: view.counts.hourly,
            icon: IconClock,
          },
          {
            label: 'განსასაზღვრი ხელფასი',
            value: view.counts.unconfigured,
            icon: IconUsers,
            attention: view.counts.unconfigured > 0,
          },
        ].map(({ label, value, icon: Icon, attention }) => (
          <Card
            key={label}
            className={
              attention
                ? 'bg-badge-red/45 text-badge-red-foreground ring-badge-red-foreground/20'
                : undefined
            }
          >
            <CardContent className="flex items-center gap-4">
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-xl border',
                  attention
                    ? 'border-badge-red-foreground/20 bg-badge-red text-badge-red-foreground'
                    : 'bg-muted/40 text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {filters}
        {view.records.length ? (
          <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
            <SalaryDirectoryTable records={view.records} />
          </div>
        ) : (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyTitle>თანამშრომლები ვერ მოიძებნა</EmptyTitle>
              <p className="text-sm text-muted-foreground">
                შეცვალეთ ძიება ან ფილტრები.
              </p>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <DataPagination
        page={search.page}
        total={view.total}
        pageSize={view.pageSize}
        renderLink={(page) => (
          <Link
            to="/manage/payroll"
            search={{ ...search, page }}
            resetScroll={false}
          />
        )}
      />
    </>
  )
}
