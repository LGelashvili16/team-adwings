import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import {
  IconCalendarCheck,
  IconCalendarOff,
  IconAlertTriangle,
} from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { DataPagination } from '#/components/common/data-pagination'
import { hasPermission } from '#/lib/authorization/permissions'
import { payrollCalendarQuery } from '../payroll-calendar.queries'
import { PayrollNavigation } from '../components/payroll-navigation'
import { CalendarPersonPicker } from '../components/calendar-person-picker'
import { CalendarMonthControl } from '../components/calendar-month-control'
import { CalendarHistorySearch } from '../components/calendar-history-search'
import { CalendarExceptionEditor } from '../components/calendar-exception-editor'
import {
  CalendarHistoryTable,
  PayrollCalendarTable,
} from '../components/payroll-calendar-tables'
import type { CalendarDraft } from '../components/calendar-exception-editor'
import type { PayrollCalendarDay } from '../payroll-calendar.types'

const route = getRouteApi('/_authenticated/manage/payroll/calendar')
export function PayrollCalendarPage() {
  const { actor } = route.useRouteContext(),
    search = route.useSearch(),
    navigate = route.useNavigate()
  const query = useQuery(payrollCalendarQuery(actor.id, search))
  const view = query.data?.ok ? query.data.value : null
  const [draft, setDraft] = useState<CalendarDraft | null>(null),
    [open, setOpen] = useState(false)
  const edit = useCallback(
    (day: PayrollCalendarDay) => {
      if (!view) return
      setDraft((previous) => ({
        key: (previous?.key ?? 0) + 1,
        revision: view.revision,
        userId: view.person?.userId ?? null,
        scopeName: view.person?.name ?? 'კომპანიის კალენდარი',
        day,
      }))
      setOpen(true)
    },
    [view],
  )
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        სახელფასო კალენდარი
      </h1>
      <PayrollNavigation actor={actor} active="calendar" />
      {query.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="სახელფასო კალენდარი იტვირთება"
        >
          <div aria-hidden="true" className="flex flex-col gap-4">
            <Skeleton className="h-12 rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((id) => (
                <Skeleton key={id} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </div>
      ) : !view ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : 'კალენდარი ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {hasPermission(actor, 'payroll.read.all') ? (
              <CalendarPersonPicker
                actorId={actor.id}
                person={view.person}
                onChange={(userId) => {
                  void navigate({
                    search: { ...search, userId, historyPage: 1 },
                    resetScroll: false,
                  })
                }}
              />
            ) : (
              <p className="text-sm font-medium">კომპანიის კალენდარი</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <CalendarMonthControl
                key={view.month}
                month={view.month}
                onChange={(month) => {
                  void navigate({
                    search: { ...search, month, historyPage: 1 },
                    resetScroll: false,
                  })
                }}
              />
              <Button
                variant="outline"
                onClick={() => {
                  void navigate({
                    search: {
                      ...search,
                      month: view.today.slice(0, 7),
                      historyPage: 1,
                    },
                    resetScroll: false,
                  })
                }}
              >
                მიმდინარე თვე
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: 'სამუშაო დღე',
                count: view.days.filter((day) => day.kind === 'scheduled')
                  .length,
                icon: IconCalendarCheck,
              },
              {
                label: 'დასვენების დღე',
                count: view.days.filter((day) => day.kind === 'day_off').length,
                icon: IconCalendarOff,
              },
              {
                label: 'დასაზუსტებელი დღეები',
                count: view.days.filter(
                  (day) =>
                    day.kind === 'unknown_history' ||
                    day.kind === 'unconfigured',
                ).length,
                icon: IconAlertTriangle,
              },
            ].map(({ label, count, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {count}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Alert variant="info">
            <AlertDescription>
              კალენდარი განსაზღვრავს სახელფასო მომზადების საცნობარო დღეებს.
              კანონით უქმეები ავტომატურად არის მონიშნული; დამატებითი ან
              გადატანილი თარიღები საჭიროებს დადასტურებულ გამონაკლისს. აქ გაცდენა
              და თანხის დაქვითვა არ დგინდება.
            </AlertDescription>
          </Alert>
          {view.person?.userId === actor.id ? (
            <Alert>
              <AlertDescription>
                საკუთარი გამონაკლისის შესაცვლელად მიმართეთ სხვა უფლებამოსილ
                პირს.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
            <PayrollCalendarTable
              days={view.days}
              canEdit={view.person?.userId !== actor.id}
              onEdit={edit}
            />
          </div>
        </>
      )}
      {view || query.isPending ? (
        <Card aria-busy={query.isPlaceholderData}>
          <CardHeader>
            <CardTitle>
              <h2>კალენდრის ცვლილებების ისტორია</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CalendarHistorySearch
              q={search.historyQ}
              scope={`${search.userId ?? 'company'}:${search.month ?? 'current'}`}
              onChange={(historyQ) => {
                void navigate({
                  search: { ...search, historyQ, historyPage: 1 },
                  replace: true,
                  resetScroll: false,
                })
              }}
            />
            {query.isPending || query.isPlaceholderData ? (
              <Skeleton className="h-24" aria-hidden="true" />
            ) : view?.history.length ? (
              <div className="min-w-0 overflow-hidden rounded-xl border">
                <CalendarHistoryTable
                  records={view.history}
                  timezone={view.timezone}
                />
              </div>
            ) : (
              <Empty className="rounded-xl border border-dashed py-8 md:py-8">
                <EmptyHeader>
                  <EmptyTitle>
                    {search.historyQ
                      ? 'ძიებას შესაბამისი ცვლილებები არ მოიძებნა'
                      : 'ამ გვერდზე ცვლილებები არ არის'}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
            {view &&
            !query.isPlaceholderData &&
            (view.historyTotal > view.historyPageSize ||
              search.historyPage > 1) ? (
              <DataPagination
                page={search.historyPage}
                total={view.historyTotal}
                pageSize={view.historyPageSize}
                renderLink={(historyPage) => (
                  <Link
                    to="/manage/payroll/calendar"
                    search={{ ...search, historyPage }}
                    resetScroll={false}
                  />
                )}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {draft ? (
        <CalendarExceptionEditor
          key={draft.key}
          actorId={actor.id}
          draft={draft}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}
