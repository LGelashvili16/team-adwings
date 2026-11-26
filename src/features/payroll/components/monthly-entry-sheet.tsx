import { useState } from 'react'
import type { RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  IconX,
  IconAlertCircle,
  IconInfoCircle,
  IconDeviceFloppy,
  IconHistory,
} from '@tabler/icons-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Skeleton } from '#/components/ui/skeleton'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Spinner } from '#/components/ui/spinner'
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { DraftSheet } from '#/components/common/draft-sheet'
import { formatGeorgianDateTime, formatGeorgianMonth } from '#/lib/date-format'
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
import { DataPagination } from '#/components/common/data-pagination'

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
    [pending, setPending] = useState(false),
    [removeOpen, setRemoveOpen] = useState(false),
    [removeTarget, setRemoveTarget] = useState<{
      userId: string
      version: number
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
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
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
              {view.payments.length ? (
                <section className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
                  <h3 className="text-sm font-medium">გაცემული თანხები</h3>
                  <PaymentBreakdown
                    payments={view.payments}
                    twice={view.firstPaymentEnabled}
                  />
                </section>
              ) : null}
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
                />
              ) : view.current ? (
                <div className="flex flex-col gap-3">
                  <Badge variant={view.closed ? 'green' : 'secondary'}>
                    {view.closed ? 'დასრულებული' : 'მონახაზი'}
                  </Badge>
                  {view.current.salary ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {salaryBasisLabels[view.current.salary.amountBasis]}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {salaryKindLabels[view.current.salary.kind]}:{' '}
                        {formatSalary(view.current.salary)}
                        {view.current.salary.kind === 'hourly' ? (
                          <>
                            {' '}
                            · დადასტურებული დრო:{' '}
                            {formatWorkedTime(view.current.workedSeconds)}
                          </>
                        ) : null}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      თვის ხელფასი დასადასტურებელია.
                    </p>
                  )}
                  <dl className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                    {view.current.salary ? (
                      <>
                        <dt>{monthlySalaryLabels.all}</dt>
                        <dd className="tabular-nums">
                          {formatSalary({
                            amountMinor: view.current.baseMinor,
                          })}
                        </dd>
                      </>
                    ) : null}
                    {view.current.adjustments.map((a, i) => (
                      <div
                        key={i}
                        className="col-span-2 grid grid-cols-subgrid gap-3"
                      >
                        <dt>
                          {monthlyAdjustmentLabels[a.kind]}
                          {a.reason ? (
                            <span className="block text-muted-foreground wrap-anywhere">
                              {a.reason}
                            </span>
                          ) : null}
                        </dt>
                        <dd className="tabular-nums">
                          {formatSalary({ amountMinor: a.amountMinor })}
                        </dd>
                      </div>
                    ))}
                    <dt className="font-semibold">
                      {view.current.salary
                        ? 'შეთანხმების ჯამი'
                        : 'დამატებების ჯამი'}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {formatSalary({ amountMinor: view.current.totalMinor })}
                    </dd>
                  </dl>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  ამ თვის ჩანაწერი ჯერ არ არის.
                </p>
              )}
              {canEdit &&
              !view.closed &&
              !view.payments.length &&
              actorId !== userId &&
              view.current?.status === 'draft' ? (
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (view.current) {
                      setRemoveTarget({ userId, version: view.current.version })
                      setRemoveOpen(true)
                    }
                  }}
                >
                  ჩანაწერის ამოღება
                </Button>
              ) : null}
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
                          მიმართეთ თანამშრომლების მართვაზე უფლებამოსილ პირს.
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
              {view.history.length ? (
                <Accordion className="rounded-xl border bg-card px-4">
                  <AccordionItem value="history">
                    <AccordionTrigger className="items-center gap-3 py-3">
                      <IconHistory
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      ცვლილებების ისტორია
                      <Badge variant="secondary">{view.total}</Badge>
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-3 [&_p:not(:last-child)]:mb-0">
                      {view.history.map((item) => (
                        <div
                          key={item.version}
                          className="flex flex-col gap-2 rounded-xl border p-4 text-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge
                              variant={
                                item.status === 'finalized'
                                  ? 'green'
                                  : 'secondary'
                              }
                            >
                              {item.status === 'finalized'
                                ? 'დასრულებული'
                                : item.status === 'voided'
                                  ? 'ამოღებული'
                                  : 'მონახაზი'}{' '}
                              · {item.version}
                            </Badge>
                            <span className="font-medium tabular-nums">
                              {formatSalary({ amountMinor: item.totalMinor })}
                            </span>
                          </div>
                          <p>
                            {item.actorName} ·{' '}
                            {formatGeorgianDateTime(
                              item.recordedAt,
                              view.timezone,
                            )}
                          </p>
                          <p className="wrap-anywhere">{item.reason}</p>
                          {item.salary ? (
                            <p className="text-muted-foreground">
                              {salaryKindLabels[item.salary.kind]}:{' '}
                              {formatSalary(item.salary)}
                              {item.salary.kind === 'hourly' ? (
                                <>
                                  {' '}
                                  · დადასტურებული დრო:{' '}
                                  {formatWorkedTime(item.workedSeconds)}
                                </>
                              ) : null}
                            </p>
                          ) : (
                            <p className="text-muted-foreground">
                              თვის ხელფასი დასადასტურებელია.
                            </p>
                          )}
                          <p className="text-muted-foreground">
                            {item.salary
                              ? `${monthlySalaryLabels.all} ${formatSalary({ amountMinor: item.baseMinor })}, `
                              : null}
                            ბონუსი:{' '}
                            {formatSalary({ amountMinor: item.bonusMinor })},
                            პრემია:{' '}
                            {formatSalary({ amountMinor: item.premiumMinor })},
                            ჯარიმა:{' '}
                            {formatSalary({ amountMinor: item.fineMinor })}
                          </p>
                          {item.baseReason ? (
                            <p className="wrap-anywhere">{item.baseReason}</p>
                          ) : null}
                          {item.adjustments.map((a, i) => (
                            <p key={i} className="wrap-anywhere">
                              {monthlyAdjustmentLabels[a.kind]}:{' '}
                              {formatSalary({ amountMinor: a.amountMinor })}
                              {a.reason ? `. ${a.reason}` : null}
                            </p>
                          ))}
                        </div>
                      ))}
                      <DataPagination
                        page={page}
                        total={view.total}
                        pageSize={view.pageSize}
                        renderLink={(next) => (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => setPage(next)}
                          />
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
            </>
          )}
        </div>
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
