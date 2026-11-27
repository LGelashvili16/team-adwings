import { useState } from 'react'
import type { RefObject } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconDeviceFloppy,
  IconHistory,
  IconX,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import { Textarea } from '#/components/ui/textarea'
import { DraftSheet } from '#/components/common/draft-sheet'
import { accountInitials } from '#/features/access/access.presentation'
import { formatWorkedTime } from '#/features/attendance/attendance.rules'
import { formatGeorgianDateTime, formatGeorgianMonth } from '#/lib/date-format'
import { formatSalary, salaryKindLabels } from '../salary.presentation'
import { salaryAmountInput, salaryToMinor } from '../salary.schemas'
import { attendancePayrollDecisionFormSchema } from '../attendance-payroll.schemas'
import {
  attendancePayrollActionLabels,
  attendancePayrollFlagLabels,
  attendancePayrollKindLabels,
  attendancePayrollStatusPresentation,
  hourlyBandLabels,
} from '../attendance-payroll.presentation'
import { decideAttendancePayrollItem } from '../attendance-payroll.functions'
import {
  attendancePayrollKey,
  employeeAttendancePayrollQuery,
} from '../attendance-payroll.queries'
import { monthlyKey } from '../monthly.queries'
import type {
  AttendancePayrollDecisionRecord,
  AttendancePayrollItem,
} from '../attendance-payroll.types'
import type { PayrollAttendanceDecisionAction } from '#/db/schema/payroll/payroll-attendance.schema'

export function AttendancePayrollReviewSheet({
  actorId,
  month,
  userId,
  employeeName,
  open,
  onClose,
  finalFocus,
}: {
  actorId: string
  month: string
  userId: string
  employeeName: string
  open: boolean
  onClose: () => void
  finalFocus?: RefObject<HTMLButtonElement | null>
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const query = useQuery({
    ...employeeAttendancePayrollQuery(actorId, month, userId),
    enabled: open,
  })
  const view = query.data?.ok ? query.data.value : null

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
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {query.isPending ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="დასწრებით გამოთვლები იტვირთება"
            >
              <Skeleton className="h-96 rounded-xl" aria-hidden="true" />
            </div>
          ) : !view ? (
            <Alert variant="destructive">
              <IconAlertCircle aria-hidden="true" />
              <AlertDescription>
                {query.data && !query.data.ok
                  ? query.data.message
                  : 'გამოთვლები ვერ ჩაიტვირთა. სცადეთ ხელახლა.'}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-5">
              <section className="grid gap-3 rounded-xl border bg-muted/25 p-4 sm:grid-cols-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    ტარიფი
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {view.hasMixedSalaryKinds
                      ? 'შერეული (ფიქს. + საათ.)'
                      : view.salary
                        ? `${salaryKindLabels[view.salary.kind]} · ${formatSalary(view.salary)}`
                        : 'განსაზღვრული არ არის'}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    {view.hasMixedSalaryKinds
                      ? 'ფიქსირებული ნაწილი'
                      : 'ავტომატური ბონუსი'}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatSalary({
                      amountMinor: view.hasMixedSalaryKinds
                        ? view.proratedFixedMinor
                        : view.autoBonusMinor,
                    })}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    საათობრივი დარიცხვა
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatSalary({ amountMinor: view.hourlyCalculatedMinor })}
                  </span>
                </div>
              </section>
              {view.hasMixedSalaryKinds ? (
                <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">
                      თვეში ტარიფის ცვლილება (ფიქსირებული + საათობრივი)
                    </h3>
                    {view.fixedProrationComplete ? (
                      <Badge variant="green">ავტომატურად გამოთვლილი</Badge>
                    ) : (
                      <Badge variant="yellow">საჭიროებს დადასტურებას</Badge>
                    )}
                  </div>
                  {view.fixedProrationComplete ? (
                    <div className="flex flex-col gap-2">
                      {view.fixedProrationSegments.map((segment) => (
                        <div
                          key={`${segment.version}-${segment.startDate}`}
                          className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2 text-xs tabular-nums"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 font-medium text-foreground">
                            <span>
                              ფიქსირებული პერიოდი: {segment.startDate} -{' '}
                              {segment.endDate}
                            </span>
                            <span>
                              {formatSalary({
                                amountMinor: segment.amountMinor,
                              })}
                            </span>
                          </div>
                          <span className="text-muted-foreground">
                            ფორმულა: (
                            {formatSalary({
                              amountMinor: segment.monthlySalaryMinor,
                            })}{' '}
                            ÷ {segment.totalWorkingDays} სამუშაო დღე) ×{' '}
                            {segment.coveredWorkingDays} დღე ={' '}
                            {formatSalary({ amountMinor: segment.amountMinor })}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-2 border-t pt-2 text-sm font-semibold tabular-nums">
                        <span>ჯამური საბაზო ხელფასი</span>
                        <span>
                          {formatSalary({
                            amountMinor:
                              view.proratedFixedMinor +
                              view.hourlyCalculatedMinor,
                          })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <Alert variant="warning" role="status">
                      <AlertDescription>
                        სამუშაო განრიგში არსებული ხარვეზის გამო პროპორციული
                        ფიქსირებული ნაწილი ავტომატურად ვერ გამოითვალა.
                      </AlertDescription>
                    </Alert>
                  )}
                </section>
              ) : null}
              {view.canEditSelf ? (
                <Alert variant="info" role="status">
                  <AlertDescription>
                    საკუთარი გამოთვლების გადამოწმება ან შეცვლა დაუშვებელია.
                  </AlertDescription>
                </Alert>
              ) : null}
              {view.items.length === 0 ? (
                <Empty className="rounded-xl border border-dashed py-10">
                  <EmptyHeader>
                    <EmptyTitle>
                      ამ თვეში დასწრებით გამოთვლილი ან გადასამოწმებელი ჩანაწერები
                      არ არის
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  {view.items.map((item) => (
                    <ReviewItemCard
                      key={item.itemKey}
                      actorId={actorId}
                      month={month}
                      userId={userId}
                      timezone={view.timezone}
                      item={item}
                      history={view.history[item.itemKey] ?? []}
                      canReview={view.canReview}
                      editing={editingKey === item.itemKey}
                      onToggleEdit={() =>
                        setEditingKey((prev) =>
                          prev === item.itemKey ? null : item.itemKey,
                        )
                      }
                      onSaved={() => setEditingKey(null)}
                      onPending={setPending}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </DraftSheet>
  )
}

function ReviewItemCard({
  actorId,
  month,
  userId,
  timezone,
  item,
  history,
  canReview,
  editing,
  onToggleEdit,
  onSaved,
  onPending,
}: {
  actorId: string
  month: string
  userId: string
  timezone: string
  item: AttendancePayrollItem
  history: AttendancePayrollDecisionRecord[]
  canReview: boolean
  editing: boolean
  onToggleEdit: () => void
  onSaved: () => void
  onPending: (pending: boolean) => void
}) {
  const status = attendancePayrollStatusPresentation[item.reviewStatus]
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              {attendancePayrollKindLabels[item.itemKind]}
            </Badge>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <h3 className="mt-1.5 text-sm font-semibold">{item.title}</h3>
          <p className="text-xs text-muted-foreground">{item.note}</p>
        </div>
        <div className="text-right tabular-nums">
          {item.effectiveAmountMinor !== null ? (
            <p className="text-base font-semibold">
              {formatSalary({ amountMinor: item.effectiveAmountMinor })}
            </p>
          ) : null}
          {item.effectiveSeconds !== null && item.effectiveSeconds > 0 ? (
            <p className="text-xs text-muted-foreground">
              {formatWorkedTime(item.effectiveSeconds)}
            </p>
          ) : null}
        </div>
      </div>

      {item.flags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {item.flags.map((flag) => (
            <Badge key={flag} variant="orange">
              {attendancePayrollFlagLabels[flag]}
            </Badge>
          ))}
        </div>
      ) : null}

      {item.formula.monthlySalaryMinor !== undefined &&
      item.formula.workingDays !== undefined ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground tabular-nums">
          ფორმულა: ({formatSalary({ amountMinor: item.formula.monthlySalaryMinor })}{' '}
          ÷ {item.formula.workingDays} სამუშაო დღე) × 1.30
          {item.calculatedAmountMinor !== null
            ? ` = ${formatSalary({ amountMinor: item.calculatedAmountMinor })}`
            : ''}
        </p>
      ) : null}

      {item.formula.allowanceMinutes !== undefined &&
      item.formula.hourlyRateMinor !== undefined ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground tabular-nums">
          ტარიფი: {formatSalary({ amountMinor: item.formula.hourlyRateMinor })}{' '}
          / სთ · კოეფიციენტი 1.30 · დანამატი +{item.formula.allowanceMinutes}{' '}
          წთ
        </p>
      ) : null}

      {item.formula.segments?.length ? (
        <ul className="divide-y rounded-lg border bg-muted/20 text-xs">
          {item.formula.segments.map((seg, idx) => (
            <li
              key={`${seg.band}-${idx}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span>{hourlyBandLabels[seg.band]}</span>
              <span className="tabular-nums">
                {formatWorkedTime(seg.seconds)} ·{' '}
                <strong>{formatSalary({ amountMinor: seg.amountMinor })}</strong>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {canReview ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            variant={editing ? 'secondary' : 'outline'}
            depth="raised"
            size="sm"
            onClick={onToggleEdit}
          >
            <IconCheck data-icon="inline-start" aria-hidden="true" />
            {editing ? 'დახურვა' : 'გადამოწმება / კორექტირება'}
          </Button>
          {history.length > 0 ? (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger
                render={<Button type="button" variant="ghost" size="sm" />}
              >
                <IconHistory data-icon="inline-start" aria-hidden="true" />
                ისტორია ({history.length})
                <IconChevronDown
                  className={`size-3.5 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 w-full">
                <ul className="divide-y rounded-lg border bg-muted/20 text-xs">
                  {history.map((entry) => (
                    <li key={entry.version} className="flex flex-col gap-1 p-2.5">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">
                          {attendancePayrollActionLabels[entry.action]}
                        </span>
                        <span className="text-muted-foreground">
                          {entry.actorName} ·{' '}
                          {formatGeorgianDateTime(entry.recordedAt, timezone)}
                        </span>
                      </div>
                      {entry.overrideAmountMinor !== null ? (
                        <span className="tabular-nums">
                          შესწორებული თანხა:{' '}
                          {formatSalary({
                            amountMinor: entry.overrideAmountMinor,
                          })}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground">
                        {entry.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ) : null}

      {canReview && editing ? (
        <ReviewDecisionForm
          actorId={actorId}
          month={month}
          userId={userId}
          item={item}
          onSaved={onSaved}
          onPending={onPending}
        />
      ) : null}
    </article>
  )
}

function ReviewDecisionForm({
  actorId,
  month,
  userId,
  item,
  onSaved,
  onPending,
}: {
  actorId: string
  month: string
  userId: string
  item: AttendancePayrollItem
  onSaved: () => void
  onPending: (pending: boolean) => void
}) {
  const client = useQueryClient()
  const [requestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState('')
  const isMonetary = item.itemKind !== 'missing_scheduled_day'
  const allowedActions: PayrollAttendanceDecisionAction[] = isMonetary
    ? ['approved', 'overridden', 'voided']
    : ['resolved']

  const mutation = useMutation({
    mutationFn: (values: {
      action: PayrollAttendanceDecisionAction
      overrideAmount: string
      overrideHours: string
      note: string
      reason: string
    }) =>
      decideAttendancePayrollItem({
        data: {
          month,
          userId,
          itemKey: item.itemKey,
          itemKind: item.itemKind,
          expectedVersion: item.decision?.version ?? 0,
          sourceHash: item.sourceHash,
          action: values.action,
          overrideAmountMinor:
            values.action === 'overridden' && values.overrideAmount
              ? salaryToMinor(values.overrideAmount)
              : null,
          overrideSeconds:
            values.action === 'overridden' && values.overrideHours
              ? salaryToMinor(values.overrideHours) * 36
              : null,
          note: values.note,
          reason: values.reason,
          requestId,
        },
      }),
    retry: false,
  })

  const form = useForm({
    defaultValues: {
      action: allowedActions[0],
      overrideAmount:
        item.effectiveAmountMinor !== null
          ? salaryAmountInput(item.effectiveAmountMinor)
          : '',
      overrideHours:
        item.effectiveSeconds !== null
          ? String(Math.round((item.effectiveSeconds / 3600) * 100) / 100)
          : '',
      note: item.note,
      reason: '',
    },
    validators: { onSubmit: attendancePayrollDecisionFormSchema },
    onSubmit: async ({ value }) => {
      setError('')
      onPending(true)
      try {
        const parsed = attendancePayrollDecisionFormSchema.parse(value)
        const result = await mutation.mutateAsync(parsed)
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success('გადაწყვეტილება შენახულია.')
        await Promise.all([
          client.invalidateQueries({ queryKey: attendancePayrollKey(actorId) }),
          client.invalidateQueries({ queryKey: monthlyKey(actorId) }),
        ])
        onSaved()
      } catch {
        const msg = 'გადაწყვეტილების შენახვა ვერ მოხერხდა.'
        setError(msg)
        toast.error(msg)
      } finally {
        onPending(false)
      }
    },
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3.5"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={mutation.isPending} className="flex flex-col gap-3">
        <FieldGroup className="gap-3">
          <form.Field name="action">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={`decision-action-${item.itemKey}`}>
                  ქმედება <span aria-hidden="true">*</span>
                </FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(val) => {
                    if (
                      val === 'approved' ||
                      val === 'overridden' ||
                      val === 'voided' ||
                      val === 'resolved'
                    )
                      field.handleChange(val)
                  }}
                >
                  <SelectTrigger
                    id={`decision-action-${item.itemKey}`}
                    className="w-full"
                  >
                    <SelectValue>
                      {attendancePayrollActionLabels[field.state.value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {allowedActions.map((act) => (
                        <SelectItem key={act} value={act}>
                          {attendancePayrollActionLabels[act]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          <form.Subscribe selector={(s) => s.values.action}>
            {(action) =>
              action === 'overridden' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <form.Field name="overrideAmount">
                    {(field) => (
                      <Field data-invalid={!field.state.meta.isValid}>
                        <FieldLabel htmlFor={`decision-amount-${item.itemKey}`}>
                          ახალი თანხა ლარში <span aria-hidden="true">*</span>
                        </FieldLabel>
                        <Input
                          id={`decision-amount-${item.itemKey}`}
                          inputMode="decimal"
                          className="tabular-nums"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={!field.state.meta.isValid}
                        />
                        <FieldError errors={field.state.meta.errors} />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="overrideHours">
                    {(field) => (
                      <Field data-invalid={!field.state.meta.isValid}>
                        <FieldLabel htmlFor={`decision-hours-${item.itemKey}`}>
                          შესწორებული საათები
                        </FieldLabel>
                        <Input
                          id={`decision-hours-${item.itemKey}`}
                          inputMode="decimal"
                          className="tabular-nums"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={!field.state.meta.isValid}
                        />
                        <FieldError errors={field.state.meta.errors} />
                      </Field>
                    )}
                  </form.Field>
                </div>
              ) : null
            }
          </form.Subscribe>
          <form.Field name="reason">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor={`decision-reason-${item.itemKey}`}>
                  მიზეზი <span aria-hidden="true">*</span>
                </FieldLabel>
                <Textarea
                  id={`decision-reason-${item.itemKey}`}
                  required
                  className="min-h-14"
                  maxLength={500}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={!field.state.meta.isValid}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
        </FieldGroup>
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? (
              <Spinner />
            ) : (
              <IconDeviceFloppy data-icon="inline-start" aria-hidden="true" />
            )}
            გადაწყვეტილების შენახვა
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
