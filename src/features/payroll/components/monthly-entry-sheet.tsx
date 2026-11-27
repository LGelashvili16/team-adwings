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
  IconTrash,
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
import type { PayStageWindow } from '../monthly.types'
import {
  formatSalary,
  salaryBasisLabels,
  salaryKindLabels,
} from '../salary.presentation'
import { MonthlyEntryForm } from './monthly-entry-form'
import { MonthlyRemoveDialog } from './monthly-remove-dialog'
import { PaymentBreakdown } from './payment-breakdown'
import { MonthlyEntryHistory } from './monthly-entry-history'
import { MonthlyPaymentDialog } from './monthly-payment-dialog'

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
  const paymentButton = useRef<HTMLButtonElement>(null)
  const salaryTab = useRef<HTMLButtonElement>(null)
  const [paymentDialog, setPaymentDialog] = useState<{
    key: number
    open: boolean
    windows: [PayStageWindow, ...PayStageWindow[]]
    firstPaymentEnabled: boolean
  } | null>(null)
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
  const paidStages = new Set(view?.payments.map(({ stage }) => stage))
  const unpaidWindows =
    view?.paymentWindows.filter(
      ({ stage }) =>
        stage !== 'adjustments' &&
        !paidStages.has(stage) &&
        !(stage === 'first' && paidStages.has('salary')),
    ) ?? []
  const firstUnpaidWindow = unpaidWindows.at(0)
  const changeTab = (value: EntryTab) => {
    if (value === tab) return
    setTab(value)
    if (body.current) body.current.scrollTop = 0
  }
  const revision = view?.current
  const attendanceSummary = view?.attendanceSummary
  const mixedCalculatedBaseMinor = attendanceSummary?.fixedProrationComplete
    ? attendanceSummary.proratedFixedMinor +
      attendanceSummary.hourlyCalculatedMinor
    : null
  const attendanceCard =
    attendanceSummary &&
    (attendanceSummary.hasMixedSalaryKinds ||
      attendanceSummary.autoBonusMinor > 0 ||
      attendanceSummary.hourlyCalculatedMinor > 0 ||
      attendanceSummary.salaryNeedsReviewCount > 0 ||
      attendanceSummary.adjustmentsNeedsReviewCount > 0) ? (
      <section className="flex flex-col gap-2.5 rounded-xl border bg-muted/25 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">დასწრებით გამოთვლილი მონაცემები</h3>
          <Link
            to="/manage/payroll/review"
            search={{ month, q: employeeName, onlyFlagged: false, page: 1 }}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            გადამოწმებაზე გადასვლა
          </Link>
        </div>
        {attendanceSummary.hasMixedSalaryKinds ? (
          attendanceSummary.fixedProrationComplete ? (
            <>
              {attendanceSummary.fixedProrationSegments.map((segment) => (
                <div
                  key={`${segment.version}-${segment.startDate}`}
                  className="flex items-center justify-between gap-2 tabular-nums"
                >
                  <span className="text-muted-foreground">
                    ფიქსირებული ნაწილი ({segment.startDate} - {segment.endDate} ·{' '}
                    {segment.coveredWorkingDays} / {segment.totalWorkingDays}{' '}
                    სამუშაო დღე)
                  </span>
                  <strong>
                    {formatSalary({ amountMinor: segment.amountMinor })}
                  </strong>
                </div>
              ))}
            </>
          ) : (
            <Alert variant="warning" role="status">
              <AlertDescription>
                ამ თვეში ფიქსირებული და საათობრივი ტარიფი იცვლება, თუმცა
                სამუშაო განრიგი არასრულია. დაადასტურეთ თვის ხელფასი ხელით.
              </AlertDescription>
            </Alert>
          )
        ) : null}
        {attendanceSummary.autoBonusMinor > 0 ? (
          <div className="flex items-center justify-between gap-2 tabular-nums">
            <span className="text-muted-foreground">
              დასვენების დღის ავტომატური ბონუსი
            </span>
            <strong>
              {formatSalary({ amountMinor: attendanceSummary.autoBonusMinor })}
            </strong>
          </div>
        ) : null}
        {attendanceSummary.hourlyCalculatedMinor > 0 ? (
          <div className="flex items-center justify-between gap-2 tabular-nums">
            <span className="text-muted-foreground">
              საათობრივი დარიცხვა (
              {formatWorkedTime(attendanceSummary.hourlyPayableSeconds)})
            </span>
            <strong>
              {formatSalary({
                amountMinor: attendanceSummary.hourlyCalculatedMinor,
              })}
            </strong>
          </div>
        ) : null}
        {mixedCalculatedBaseMinor !== null ? (
          <div className="flex items-center justify-between gap-2 border-t pt-2 font-medium tabular-nums">
            <span>ჯამური გამოთვლილი საბაზო ხელფასი</span>
            <strong>
              {formatSalary({ amountMinor: mixedCalculatedBaseMinor })}
            </strong>
          </div>
        ) : null}
        {attendanceSummary.salaryNeedsReviewCount +
          attendanceSummary.adjustmentsNeedsReviewCount >
        0 ? (
          <Alert variant="warning" role="status">
            <AlertDescription>
              გაცემამდე საჭიროა HR-ის ან ადმინისტრატორის გადამოწმება (
              {attendanceSummary.salaryNeedsReviewCount +
                attendanceSummary.adjustmentsNeedsReviewCount}{' '}
              ჩანაწერი).
            </AlertDescription>
          </Alert>
        ) : null}
      </section>
    ) : null
  const salaryFooter =
    view?.payments.length || attendanceCard ? (
      <div className="flex flex-col gap-3">
        {attendanceCard}
        {view?.payments.length ? (
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <h3 className="text-sm font-medium">გაცემული თანხები</h3>
            <PaymentBreakdown
              payments={view.payments}
              twice={view.firstPaymentEnabled}
            />
          </section>
        ) : null}
      </div>
    ) : null
  const removeAction =
    view &&
    canEdit &&
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
        <IconTrash data-icon="inline-start" aria-hidden="true" />
        ჩანაწერის ამოღება
      </Button>
    ) : null
  return (
    <DraftSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending && !paymentDialog?.open) onClose()
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
                  ref={value === 'salary' ? salaryTab : undefined}
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
                    suggestedBaseMinor={mixedCalculatedBaseMinor}
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
                    tabs={{
                      onInvalid: changeTab,
                      salaryAction:
                        firstUnpaidWindow || removeAction
                          ? (hasUnsavedChanges) => (
                              <div className="flex flex-col items-start gap-2">
                                <div className="flex w-full flex-wrap items-center gap-2">
                                  {firstUnpaidWindow ? (
                                    <Button
                                      ref={paymentButton}
                                      type="button"
                                      variant="outline"
                                      className="max-sm:only:w-full"
                                      disabled={pending || hasUnsavedChanges}
                                      onClick={() =>
                                        setPaymentDialog((previous) => ({
                                          key: (previous?.key ?? 0) + 1,
                                          open: true,
                                          windows: [
                                            firstUnpaidWindow,
                                            ...unpaidWindows.slice(1),
                                          ],
                                          firstPaymentEnabled:
                                            view.firstPaymentEnabled,
                                        }))
                                      }
                                    >
                                      <IconWallet
                                        aria-hidden="true"
                                        data-icon="inline-start"
                                      />
                                      ხელფასის გაცემა
                                    </Button>
                                  ) : null}
                                  {removeAction}
                                </div>
                                {firstUnpaidWindow && hasUnsavedChanges ? (
                                  <p className="text-sm text-muted-foreground">
                                    ხელფასის გაცემამდე შეინახეთ ცვლილებები.
                                  </p>
                                ) : null}
                              </div>
                            )
                          : undefined,
                      salaryFooter,
                    }}
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
                      {removeAction}
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
      {paymentDialog ? (
        <MonthlyPaymentDialog
          key={paymentDialog.key}
          actorId={actorId}
          month={month}
          employee={{ userId, name: employeeName }}
          windows={paymentDialog.windows}
          firstPaymentEnabled={paymentDialog.firstPaymentEnabled}
          returnFocus={(issued) =>
            issued
              ? salaryTab.current
              : (paymentButton.current ?? salaryTab.current)
          }
          open={paymentDialog.open}
          onClose={() => setPaymentDialog({ ...paymentDialog, open: false })}
        />
      ) : null}
    </DraftSheet>
  )
}
