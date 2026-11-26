import { useCallback, useId, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, getRouteApi } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  IconWallet,
  IconDownload,
  IconPlus,
  IconInfoCircle,
  IconAlertCircle,
} from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyContent,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { ConfirmModalContent } from '#/components/common/confirm-modal-content'
import { useModal } from '#/hooks/use-modal'
import { hasPermission } from '#/lib/authorization/permissions'
import { monthlyKey, monthlyPayrollQuery } from '../monthly.queries'
import {
  getMonthlyPayrollCsv,
  setMonthlyAdjustments,
} from '../monthly.functions'
import { Spinner } from '#/components/ui/spinner'
import type { MonthlyDirectoryRow } from '../monthly.types'
import { PayrollPageHeader } from '../components/payroll-page-header'
import { MonthlyFilters } from '../components/monthly-filters'
import { MonthlyTable } from '../components/monthly-table'
import { MonthlyEntrySheet } from '../components/monthly-entry-sheet'
import { MonthlyAdjustmentsSheet } from '../components/monthly-adjustments-sheet'
import { MonthlyPaymentDialog } from '../components/monthly-payment-dialog'

const route = getRouteApi('/_authenticated/manage/payroll/monthly')
export function MonthlyPayrollPage() {
  const { actor } = route.useRouteContext(),
    search = route.useSearch(),
    navigate = route.useNavigate()
  const query = useQuery(monthlyPayrollQuery(actor.id, search)),
    view = query.data?.ok ? query.data.value : null
  const canEdit = hasPermission(actor, 'payroll.manage')
  const adjustmentsOnly = search.view === 'bonuses'
  const resultsId = useId()
  const showPeriod =
    !adjustmentsOnly &&
    (view?.paymentWindows.some((window) => window.stage === 'first') ??
      Boolean(search.period))
  const exportPayroll = useMutation({
    mutationFn: () =>
      getMonthlyPayrollCsv({
        data: {
          page: 1,
          month: view?.month,
          period: view?.period,
          q: search.q,
          sort: search.sort,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      const url = URL.createObjectURL(
        new Blob([result.value.csv], { type: 'text/csv;charset=utf-8' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = result.value.filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    onError: () =>
      toast.error('უწყისის ექსპორტი ვერ შესრულდა. სცადეთ ხელახლა.'),
  })
  const { openModal } = useModal()
  const client = useQueryClient()
  const removing = useRef(false)
  const employeeTrigger = useRef<HTMLButtonElement>(null)
  const [draft, setDraft] = useState<{
      key: number
      month: string
      adjustmentsOnly: boolean
      employee: { id: string; label: string } | null
    } | null>(null),
    [open, setOpen] = useState(false)
  const [paymentDialog, setPaymentDialog] = useState({ key: 0, open: false })
  const firstWindow = view?.paymentWindows.at(0)
  const displayedMonth = view?.month
  const edit = useCallback(
    (employee: { id: string; label: string } | null) => {
      if (!displayedMonth) return
      setDraft((previous) => ({
        key: (previous?.key ?? 0) + 1,
        month: displayedMonth,
        adjustmentsOnly,
        employee,
      }))
      setOpen(true)
    },
    [displayedMonth, adjustmentsOnly],
  )
  const openEmployee = useCallback(
    (record: MonthlyDirectoryRow, trigger?: HTMLButtonElement) => {
      employeeTrigger.current = trigger ?? null
      edit({ id: record.userId, label: record.employeeName })
    },
    [edit],
  )
  const removeAdjustments = (record: MonthlyDirectoryRow, month: string) => {
    const expectedVersion = record.version
    if (expectedVersion === null) return
    const requestId = crypto.randomUUID()
    openModal(
      <ConfirmModalContent
        confirmLabel="ამოღება"
        confirmVariant="destructive"
        submitting={removing}
        onConfirm={async () => {
          const result = await setMonthlyAdjustments({
            data: {
              month,
              userId: record.userId,
              expectedVersion,
              adjustments: [],
              requestId,
            },
          }).catch(() => {
            throw new Error('ჩანაწერების ამოღება ვერ მოხერხდა. სცადეთ ხელახლა.')
          })
          if (!result.ok) throw new Error(result.message)
          toast.success('თვის დამატებითი ჩანაწერები ამოღებულია.')
          await client.invalidateQueries({ queryKey: monthlyKey(actor.id) })
          const fresh = client.getQueryData(
            monthlyPayrollQuery(actor.id, search).queryKey,
          )
          if (
            fresh?.ok &&
            search.page > 1 &&
            fresh.value.records.length === 0
          ) {
            void navigate({
              search: {
                ...search,
                page: Math.max(
                  1,
                  Math.ceil(fresh.value.total / fresh.value.pageSize),
                ),
              },
              replace: true,
              resetScroll: false,
            })
          }
          return true
        }}
      />,
      {
        title: 'თვის დამატებითი ჩანაწერების ამოღება',
        description: `ამოიღება თანამშრომლის (${record.employeeName}) არჩეული თვის ყველა ბონუსი, პრემია და ჯარიმა. ცვლილება დარჩება ისტორიაში, ხოლო საბაზო ხელფასი და საათები უცვლელი იქნება.`,
        canClose: () => !removing.current,
      },
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PayrollPageHeader
        actor={actor}
        active={adjustmentsOnly ? 'adjustments' : 'monthly'}
        month={search.month ?? view?.month}
        title={
          adjustmentsOnly ? 'ბონუსები, პრემიები და ჯარიმები' : 'თვის ხელფასები'
        }
      >
        {view && canEdit && adjustmentsOnly && !view.closed ? (
          <Button onClick={() => edit(null)}>
            <IconPlus aria-hidden="true" data-icon="inline-start" />
            დამატება
          </Button>
        ) : null}
        {view && canEdit && !adjustmentsOnly && !view.closed ? (
          <Button
            className="h-11 w-full md:h-10 md:w-auto"
            disabled={!firstWindow}
            onClick={() =>
              setPaymentDialog((previous) => ({
                key: previous.key + 1,
                open: true,
              }))
            }
          >
            <IconWallet aria-hidden="true" data-icon="inline-start" />
            ხელფასის გაცემა
          </Button>
        ) : null}
      </PayrollPageHeader>
      <div className="flex min-w-0 flex-col gap-2">
        <MonthlyFilters
          search={search}
          periodPanelId={showPeriod ? resultsId : undefined}
          onChange={(next) => {
            void navigate({ search: next, replace: true, resetScroll: false })
          }}
          payrollMonth={view?.month ?? search.month}
          payrollPeriod={view?.period}
          onMonthChange={(month) => {
            void navigate({
              search: { ...search, month, page: 1 },
              resetScroll: false,
            })
          }}
        >
          {view?.closed ? (
            <Badge className="md:self-center" variant="green">
              დასრულებული თვე
            </Badge>
          ) : null}
          {!adjustmentsOnly ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 w-full md:ml-auto md:h-9 md:w-auto"
              disabled={!view?.total || exportPayroll.isPending}
              onClick={() => exportPayroll.mutate()}
            >
              {exportPayroll.isPending ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <IconDownload data-icon="inline-start" aria-hidden="true" />
              )}
              CSV ექსპორტი
            </Button>
          ) : null}
        </MonthlyFilters>
        {!adjustmentsOnly && view && !view.closed && canEdit && !firstWindow ? (
          <Alert variant="info" role="status">
            <IconInfoCircle aria-hidden="true" />
            <AlertDescription>
              ხელფასის გასაცემად ჯერ შეინახეთ გაცემის გრაფიკი.
              {hasPermission(actor, 'payroll.configure') ? (
                <>
                  {' '}
                  <Link to="/manage/payroll/settings">პარამეტრები</Link>
                </>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <div
          id={showPeriod ? resultsId : undefined}
          role={showPeriod ? 'tabpanel' : undefined}
          aria-labelledby={
            showPeriod
              ? `${resultsId}-${view?.period ?? search.period ?? 'all'}`
              : undefined
          }
          className="flex min-w-0 flex-col gap-6"
        >
          {query.isPending ? (
            <div
              role="status"
              aria-label="თვის უწყისი იტვირთება"
              aria-busy="true"
            >
              <Skeleton className="h-80 rounded-xl" aria-hidden="true" />
            </div>
          ) : !view ? (
            <Alert variant="destructive">
              <IconAlertCircle aria-hidden="true" />
              <AlertDescription>
                {query.data && !query.data.ok
                  ? query.data.message
                  : 'უწყისი ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {view.records.length ? (
                <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
                  <MonthlyTable
                    records={view.records}
                    period={view.period}
                    adjustmentsOnly={adjustmentsOnly}
                    adjustmentActions={
                      adjustmentsOnly && canEdit && !view.closed
                        ? {
                            actorId: actor.id,
                            onRemove: (record) =>
                              removeAdjustments(record, view.month),
                          }
                        : undefined
                    }
                    onOpen={openEmployee}
                  />
                </div>
              ) : (
                <Empty className="rounded-xl border border-dashed py-12">
                  <EmptyHeader>
                    <EmptyTitle>
                      {search.q
                        ? 'შესაბამისი ჩანაწერი არ მოიძებნა'
                        : adjustmentsOnly
                          ? 'ამ თვეში დამატებითი ჩანაწერები ჯერ არ არის'
                          : 'ამ თვის უწყისი ჯერ ცარიელია'}
                    </EmptyTitle>
                    {search.q ? (
                      <EmptyContent>შეცვალეთ ძიების პირობა.</EmptyContent>
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
                    to="/manage/payroll/monthly"
                    search={{ ...search, page }}
                    resetScroll={false}
                  />
                )}
              />
            </>
          )}
        </div>
      </div>
      {draft?.adjustmentsOnly === true && adjustmentsOnly ? (
        <MonthlyAdjustmentsSheet
          key={draft.key}
          actorId={actor.id}
          month={draft.month}
          initialEmployee={draft.employee}
          canEdit={canEdit}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {draft?.adjustmentsOnly === false &&
      !adjustmentsOnly &&
      draft.employee ? (
        <MonthlyEntrySheet
          key={`${search.view ?? 'monthly'}-${draft.key}`}
          actorId={actor.id}
          month={draft.month}
          userId={draft.employee.id}
          employeeName={draft.employee.label}
          finalFocus={employeeTrigger}
          canEdit={canEdit}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {view && firstWindow && paymentDialog.key ? (
        <MonthlyPaymentDialog
          key={`${view.month}-${paymentDialog.key}`}
          actorId={actor.id}
          month={view.month}
          windows={[firstWindow, ...view.paymentWindows.slice(1)]}
          open={paymentDialog.open}
          onClose={() =>
            setPaymentDialog((previous) => ({ ...previous, open: false }))
          }
        />
      ) : null}
    </div>
  )
}
