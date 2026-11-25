import { useCallback, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, getRouteApi } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  IconLock,
  IconLockOpen,
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
import { setMonthlyAdjustments } from '../monthly.functions'
import type { MonthlyDirectoryRow } from '../monthly.types'
import { PayrollPageHeader } from '../components/payroll-page-header'
import { PayrollMonthControl } from '../components/payroll-month-control'
import { MonthlyFilters } from '../components/monthly-filters'
import { MonthlyTable } from '../components/monthly-table'
import { MonthlyEntrySheet } from '../components/monthly-entry-sheet'
import { MonthlyAdjustmentsSheet } from '../components/monthly-adjustments-sheet'
import { MonthlyDecisionDialog } from '../components/monthly-decision-dialog'

const route = getRouteApi('/_authenticated/manage/payroll/monthly')
export function MonthlyPayrollPage() {
  const { actor } = route.useRouteContext(),
    search = route.useSearch(),
    navigate = route.useNavigate()
  const query = useQuery(monthlyPayrollQuery(actor.id, search)),
    view = query.data?.ok ? query.data.value : null
  const canEdit = hasPermission(actor, 'payroll.manage')
  const adjustmentsOnly = search.view === 'bonuses'
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
  const [decision, setDecision] = useState<{
      key: number
      month: string
      token: string
      closed: boolean
    } | null>(null),
    [decisionOpen, setDecisionOpen] = useState(false)
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
        {view && canEdit && !adjustmentsOnly ? (
          <Button
            variant={view.closed ? 'outline' : 'default'}
            disabled={!view.entryCount}
            onClick={() => {
              setDecision({
                key: (decision?.key ?? 0) + 1,
                month: view.month,
                token: view.token,
                closed: view.closed,
              })
              setDecisionOpen(true)
            }}
          >
            {view.closed ? (
              <IconLockOpen aria-hidden="true" data-icon="inline-start" />
            ) : (
              <IconLock aria-hidden="true" data-icon="inline-start" />
            )}
            {view.closed ? 'უწყისის გახსნა' : 'თვის დასრულება'}
          </Button>
        ) : null}
      </PayrollPageHeader>
      <MonthlyFilters
        search={search}
        onChange={(next) => {
          void navigate({ search: next, replace: true, resetScroll: false })
        }}
        monthPicker={
          view ? (
            <PayrollMonthControl
              month={view.month}
              onChange={(month) => {
                void navigate({
                  search: { ...search, month, page: 1 },
                  resetScroll: false,
                })
              }}
            />
          ) : null
        }
      >
        {view?.closed ? (
          <Badge className="md:self-center" variant="green">
            დასრულებული თვე
          </Badge>
        ) : null}
      </MonthlyFilters>
      {adjustmentsOnly ? null : (
        <Alert variant="info" role="status">
          <IconInfoCircle aria-hidden="true" />
          <AlertDescription>
            ჯამი ინარჩუნებს ხელფასის შეთანხმების საფუძველს. გადასახადები და
            საპენსიო შენატანები არ გამოითვლება.
          </AlertDescription>
        </Alert>
      )}
      {query.isPending ? (
        <div role="status" aria-label="თვის უწყისი იტვირთება" aria-busy="true">
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
      {decision ? (
        <MonthlyDecisionDialog
          key={decision.key}
          actorId={actor.id}
          month={decision.month}
          token={decision.token}
          closed={decision.closed}
          open={decisionOpen}
          onClose={() => setDecisionOpen(false)}
        />
      ) : null}
    </div>
  )
}
