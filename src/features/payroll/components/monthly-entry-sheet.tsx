import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  IconX,
  IconAlertCircle,
  IconInfoCircle,
  IconDeviceFloppy,
  IconHistory,
  IconWallet,
  IconAdjustmentsHorizontal,
} from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Skeleton } from '#/components/ui/skeleton'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Spinner } from '#/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { DraftSheet } from '#/components/common/draft-sheet'
import { formatGeorgianMonth } from '#/lib/date-format'
import { accountInitials } from '#/features/access/access.presentation'
import { formatWorkedTime } from '#/features/attendance/attendance.rules'
import { monthlyEmployeeQuery } from '../monthly.queries'
import { monthlyAdjustmentLabels, monthlySalaryLabels } from '../monthly.rules'
import {
  formatSalary,
  salaryBasisLabels,
  salaryKindLabels,
} from '../salary.presentation'
import { MonthlyEntryForm } from './monthly-entry-form'
import { MonthlyRemoveDialog } from './monthly-remove-dialog'
import { PaymentBreakdown } from './payment-breakdown'
import { MonthlyEntryHistory } from './monthly-entry-history'

const entryTabs = [
  { value: 'salary', label: 'ხელფასი', icon: IconWallet },
  {
    value: 'adjustments',
    label: 'ბონუსები და ჯარიმები',
    icon: IconAdjustmentsHorizontal,
  },
  { value: 'history', label: 'ისტორია', icon: IconHistory },
] as const
type EntryTab = (typeof entryTabs)[number]['value']

export function MonthlyEntrySheet({
  actorId,
  month,
  userId,
  employeeName,
  finalFocus,
  canEdit,
  open,
  onClose,
}: {
  actorId: string
  month: string
  userId: string
  employeeName: string
  canEdit: boolean
  open: boolean
  onClose: () => void
  finalFocus?: RefObject<HTMLButtonElement | null>
}) {
  const [page, setPage] = useState(1),
    [tab, setTab] = useState<EntryTab>('salary'),
    [pending, setPending] = useState(false),
    [removeOpen, setRemoveOpen] = useState(false),
    [removeTarget, setRemoveTarget] = useState<{
      userId: string
      version: number
    } | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const query = useQuery({
    ...monthlyEmployeeQuery(actorId, month, userId, page),
    enabled: open,
  })
  const view = query.data?.ok ? query.data.value : null
  const legacySalary =
    !view?.closed && view?.source?.salary.amountBasis === 'gross'
  const editable =
    canEdit &&
    !view?.closed &&
    !legacySalary &&
    actorId !== userId &&
    view?.source
  const changeTab = (value: EntryTab) => {
    if (value === tab) return
    setTab(value)
    if (body.current) body.current.scrollTop = 0
  }
  const revision = view?.current
  const salaryFooter = view ? (
    <>
      {view.payments.length ? (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-medium">გაცემული თანხები</h3>
          <PaymentBreakdown
            payments={view.payments}
            twice={view.firstPaymentEnabled}
          />
        </section>
      ) : null}
      {canEdit &&
      !view.closed &&
      !view.payments.length &&
      actorId !== userId &&
      revision?.status === 'draft' ? (
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          className="self-start"
          onClick={() => {
            setRemoveTarget({ userId, version: revision.version })
            setRemoveOpen(true)
          }}
        >
          ჩანაწერის ამოღება
        </Button>
      ) : null}
    </>
  ) : null
  return (
    <DraftSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <SheetContent
        finalFocus={finalFocus}
        showCloseButton={false}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b p-5 pr-16 sm:p-6 sm:pr-16">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              aria-hidden="true"
              className="size-10 shrink-0 ring-1 ring-border"
            >
              <AvatarFallback className="bg-accent font-semibold text-accent-foreground">
                {accountInitials(employeeName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="wrap-anywhere sm:text-lg">
                {employeeName}
              </SheetTitle>
              <SheetDescription>{formatGeorgianMonth(month)}</SheetDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4"
            aria-label="დახურვა"
            disabled={pending}
            onClick={onClose}
          >
            <IconX aria-hidden="true" />
          </Button>
        </SheetHeader>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (
              value === 'salary' ||
              value === 'adjustments' ||
              value === 'history'
            )
              changeTab(value)
          }}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="shrink-0 overflow-x-auto border-b px-4 py-3 sm:px-6">
            <TabsList
              aria-label="თვის ჩანაწერის განყოფილებები"
              className="w-full min-w-max gap-0.5 group-data-horizontal/tabs:h-11 sm:group-data-horizontal/tabs:h-10"
              activateOnFocus
            >
              {entryTabs.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="min-w-max px-1 text-xs sm:px-2 sm:text-sm"
                >
                  <Icon className="hidden size-4 sm:block" aria-hidden="true" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div
            ref={body}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
          >
            {query.isPending ? (
              <div
                role="status"
                aria-busy="true"
                aria-label="თვის ჩანაწერი იტვირთება"
              >
                <Skeleton className="h-96" aria-hidden="true" />
              </div>
            ) : !view ? (
              <Alert variant="destructive">
                <IconAlertCircle aria-hidden="true" />
                <AlertDescription>
                  {query.data && !query.data.ok
                    ? query.data.message
                    : 'ჩანაწერი ვერ ჩაიტვირთა. ხელახლა გახსენით ფანჯარა.'}
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {editable ? (
                  <MonthlyEntryForm
                    actorId={actorId}
                    month={month}
                    userId={userId}
                    source={editable}
                    current={view.current}
                    baseNeedsReview={view.baseNeedsReview}
                    firstPaymentEnabled={view.firstPaymentEnabled}
                    firstAlreadyPaid={view.payments.some(
                      (payment) => payment.stage !== 'adjustments',
                    )}
                    defaultFineStage={view.defaultFineStage}
                    paymentWindows={view.paymentWindows}
                    payments={view.payments}
                    onSaved={onClose}
                    showSubmit={false}
                    onPending={setPending}
                    tabs={{ onInvalid: changeTab, salaryFooter }}
                  />
                ) : (
                  <>
                    <TabsContent value="salary" className="flex flex-col gap-4">
                      {view.sourceMessage || legacySalary ? (
                        <Alert variant="info" role="status">
                          <IconInfoCircle aria-hidden="true" />
                          <AlertDescription className="flex flex-col items-start gap-2">
                            {legacySalary
                              ? 'გაცემამდე განსაზღვრეთ თანამშრომლისთვის ხელზე ასაღები თანხა.'
                              : view.sourceMessage}
                            {view.employmentNeedsReview ? (
                              view.canOpenEmployeeProfile ? (
                                <Link
                                  className="rounded-sm font-medium focus-visible:ring-2 focus-visible:ring-ring"
                                  to="/manage/employees/$employeeId"
                                  params={{ employeeId: userId }}
                                  search={{
                                    employmentPage: 1,
                                    employmentHistoryPage: 1,
                                  }}
                                  hash="employment-periods"
                                >
                                  თანამშრომლის დასაქმების პერიოდებზე გადასვლა
                                </Link>
                              ) : (
                                <span>
                                  მიმართეთ თანამშრომლების მართვაზე უფლებამოსილ
                                  პირს.
                                </span>
                              )
                            ) : view.salaryMissing || legacySalary ? (
                              <Link
                                className="rounded-sm font-medium focus-visible:ring-2 focus-visible:ring-ring"
                                to="/manage/payroll/$userId"
                                params={{ userId }}
                              >
                                თანამშრომლის ხელფასზე გადასვლა
                              </Link>
                            ) : null}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                      {revision ? (
                        <section className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4">
                          <Badge variant={view.closed ? 'green' : 'secondary'}>
                            {view.closed ? 'დასრულებული' : 'მონახაზი'}
                          </Badge>
                          {revision.salary ? (
                            <>
                              <p className="text-muted-foreground">
                                {salaryKindLabels[revision.salary.kind]} ·{' '}
                                {formatSalary(revision.salary)}
                              </p>
                              {revision.salary.kind === 'hourly' ? (
                                <p>
                                  დადასტურებული დრო ·{' '}
                                  {formatWorkedTime(revision.workedSeconds)}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <p className="text-muted-foreground">
                              თვის ხელფასი დასადასტურებელია.
                            </p>
                          )}
                          <dl className="grid w-full grid-cols-[1fr_auto] gap-2 border-t pt-3">
                            {revision.salary ? (
                              <>
                                <dt>{monthlySalaryLabels.all}</dt>
                                <dd className="tabular-nums">
                                  {formatSalary({
                                    amountMinor: revision.baseMinor,
                                  })}
                                </dd>
                                <dt className="text-muted-foreground">
                                  თანხის ტიპი
                                </dt>
                                <dd>
                                  {
                                    salaryBasisLabels[
                                      revision.salary.amountBasis
                                    ]
                                  }
                                </dd>
                              </>
                            ) : null}
                            <dt className="font-semibold">
                              {revision.salary
                                ? 'თვის ჯამი'
                                : 'დამატებების ჯამი'}
                            </dt>
                            <dd className="font-semibold tabular-nums">
                              {formatSalary({
                                amountMinor: revision.totalMinor,
                              })}
                            </dd>
                          </dl>
                        </section>
                      ) : (
                        <Empty className="rounded-xl border border-dashed">
                          <EmptyHeader>
                            <EmptyTitle>
                              ამ თვის ჩანაწერი ჯერ არ არის
                            </EmptyTitle>
                          </EmptyHeader>
                        </Empty>
                      )}
                      {salaryFooter}
                    </TabsContent>
                    <TabsContent value="adjustments">
                      {revision?.adjustments.length ? (
                        <dl className="flex flex-col divide-y rounded-xl border bg-card">
                          {revision.adjustments.map((item, index) => (
                            <div
                              key={index}
                              className="flex justify-between gap-3 p-4"
                            >
                              <dt className="min-w-0 wrap-anywhere">
                                {monthlyAdjustmentLabels[item.kind]}
                                {item.reason ? (
                                  <span className="block text-muted-foreground">
                                    {item.reason}
                                  </span>
                                ) : null}
                              </dt>
                              <dd className="shrink-0 tabular-nums">
                                {formatSalary(item)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <Empty className="rounded-xl border border-dashed">
                          <EmptyHeader>
                            <EmptyTitle>
                              დამატებითი ჩანაწერები არ არის
                            </EmptyTitle>
                          </EmptyHeader>
                        </Empty>
                      )}
                    </TabsContent>
                  </>
                )}
                <TabsContent value="history">
                  <MonthlyEntryHistory
                    view={view}
                    page={page}
                    onPageChange={setPage}
                    busy={query.isPlaceholderData}
                    disabled={pending || query.isPlaceholderData}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
        {editable ? (
          <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t bg-card p-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              depth="raised"
              onClick={onClose}
              disabled={pending}
            >
              გაუქმება
            </Button>
            <Button
              type="submit"
              form="monthly-entry-form"
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? (
                <Spinner />
              ) : (
                <IconDeviceFloppy aria-hidden="true" data-icon="inline-start" />
              )}
              ჩანაწერის შენახვა
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
      {removeTarget ? (
        <MonthlyRemoveDialog
          key={removeTarget.version}
          actorId={actorId}
          month={month}
          open={removeOpen}
          onClose={() => setRemoveOpen(false)}
          employee={removeTarget}
          onRemoved={onClose}
        />
      ) : null}
    </DraftSheet>
  )
}
