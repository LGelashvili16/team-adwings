import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  IconPlus,
  IconTrash,
  IconDeviceFloppy,
  IconAlertTriangle,
  IconAlertCircle,
  IconWallet,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Switch } from '#/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Spinner } from '#/components/ui/spinner'
import { TabsContent } from '#/components/ui/tabs'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { DatePicker } from '#/components/common/date-picker'
import { formatGeorgianDate } from '#/lib/date-format'
import { monthlyFormSchema } from '../monthly.schemas'
import { payStageLabel } from '../payroll-settings.schemas'
import {
  hourlyBase,
  monthlyAdjustmentLabels,
  monthlySalaryLabels,
  monthlyTotals,
  paymentDateIssue,
} from '../monthly.rules'
import {
  formatSalary,
  salaryBasisLabels,
  salaryKindLabels,
} from '../salary.presentation'
import { salaryAmountInput, salaryToMinor } from '../salary.schemas'
import { setMonthlyAdjustments, setMonthlyEmployee } from '../monthly.functions'
import { monthlyKey } from '../monthly.queries'
import type { MonthlyDetail, MonthlySource } from '../monthly.types'
import type { z } from 'zod'

export function MonthlyEntryForm({
  actorId,
  month,
  userId,
  source: initialSource,
  current: initialCurrent,
  baseNeedsReview = false,
  onSaved,
  onPending,
  showSubmit = true,
  firstPaymentEnabled = false,
  firstAlreadyPaid = false,
  defaultFineStage = 'salary',
  paymentWindows = [],
  payments = [],
  tabs,
}: {
  actorId: string
  month: string
  userId: string
  source: MonthlySource | null
  current: MonthlyDetail['current']
  baseNeedsReview?: boolean
  onSaved: () => void
  onPending: (value: boolean) => void
  showSubmit?: boolean
  firstPaymentEnabled?: boolean
  firstAlreadyPaid?: boolean
  defaultFineStage?: MonthlyDetail['defaultFineStage']
  paymentWindows?: MonthlyDetail['paymentWindows']
  payments?: MonthlyDetail['payments']
  tabs?: {
    onInvalid: (section: 'salary' | 'adjustments') => void
    salaryFooter?: ReactNode
  }
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [{ source, current }] = useState(() => ({
    source: initialSource,
    current: initialCurrent,
  }))
  const adjustmentsOnly = !source
  const salaryPayment = payments.find((payment) => payment.stage === 'salary')
  const salaryPaid = !!salaryPayment
  const paidBase = salaryPayment
    ? salaryPayment.baseMinor +
      (payments.find((payment) => payment.stage === 'first')?.baseMinor ?? 0)
    : null
  const formSchema = monthlyFormSchema.superRefine(
    ({ paymentDates }, context) => {
      for (const stage of ['salary', 'adjustments'] as const) {
        const date = paymentDates[stage]
        if (!date || date === current?.paymentDates?.[stage]) continue
        const opening = paymentWindows.find(
          (window) => window.stage === stage,
        )?.start
        const issue = paymentDateIssue(month, date, opening)
        if (issue)
          context.addIssue({
            code: 'custom',
            path: ['paymentDates', stage],
            message: issue,
          })
      }
    },
  )
  const canSetFirstPayment =
    firstPaymentEnabled && source?.salary.kind === 'monthly'
  const client = useQueryClient(),
    [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof monthlyFormSchema>) => {
      const paymentDates = {
        ...(values.paymentDates.salary
          ? { salary: values.paymentDates.salary }
          : {}),
        ...(values.paymentDates.adjustments
          ? { adjustments: values.paymentDates.adjustments }
          : {}),
      }
      const data = {
        month,
        userId,
        expectedVersion: current?.version ?? 0,
        requestId,
        ...(current?.paymentDates || Object.keys(paymentDates).length
          ? { paymentDates }
          : {}),
        ...(values.adjustments.some((item) => item.kind === 'fine')
          ? { fineStage: values.fineStage }
          : {}),
        adjustments: values.adjustments.map((a) => ({
          kind: a.kind,
          amountMinor: salaryToMinor(a.amount),
          reason: a.reason,
        })),
      }
      if (!source) return setMonthlyAdjustments({ data })
      return setMonthlyEmployee({
        data: {
          ...data,
          sourceToken: source.sourceToken,
          workedSeconds:
            source.salary.kind === 'hourly'
              ? salaryToMinor(values.hours) * 36
              : 0,
          baseOverrideMinor: values.manualBase
            ? salaryToMinor(values.base)
            : null,
          ...(!firstAlreadyPaid && canSetFirstPayment
            ? {
                firstPaymentMinor: values.firstPayment
                  ? salaryToMinor(values.firstPayment)
                  : null,
              }
            : {}),
        },
      })
    },
    retry: false,
  })
  const existingAdjustments =
    current && (!adjustmentsOnly || current.status !== 'voided')
      ? current.adjustments
      : []
  const replacedAgreementAmount =
    !salaryPaid &&
    source?.salary.kind === 'monthly' &&
    current?.salary?.kind === 'monthly' &&
    source.salary.version !== current.salary.version &&
    current.baseMinor === current.salary.amountMinor
  const savedBase =
    current?.salary &&
    !replacedAgreementAmount &&
    (!source?.requiresBaseConfirmation || current.manualBase || salaryPaid)
      ? current.baseMinor
      : null
  const defaultBase =
    paidBase ??
    savedBase ??
    (source?.salary.kind === 'monthly' ? source.salary.amountMinor : null)
  const form = useForm({
    defaultValues: {
      hours: source && current ? String(current.workedSeconds / 3600) : '0',
      base: defaultBase === null ? '' : salaryAmountInput(defaultBase),
      manualBase:
        !!source &&
        (source.requiresBaseConfirmation || (current?.manualBase ?? false)),
      firstPayment:
        current?.firstPaymentMinor != null
          ? salaryAmountInput(current.firstPaymentMinor)
          : '',
      fineStage: current?.fineStage ?? null,
      paymentDates: {
        salary: current?.paymentDates?.salary ?? '',
        adjustments: current?.paymentDates?.adjustments ?? '',
      },
      adjustments:
        adjustmentsOnly && !existingAdjustments.length
          ? [{ kind: 'bonus' as const, amount: '', reason: '' }]
          : existingAdjustments.map((a) => ({
              kind: a.kind,
              amount: salaryAmountInput(a.amountMinor),
              reason: a.reason,
            })),
    },
    validators: { onSubmit: formSchema },
    onSubmitInvalid: ({ value }) => {
      if (tabs) {
        const issue = formSchema.safeParse(value).error?.issues[0]
        if (issue) {
          const field = issue.path[0]
          tabs.onInvalid(
            field === 'adjustments' ||
              field === 'fineStage' ||
              field === 'paymentDates'
              ? 'adjustments'
              : 'salary',
          )
        }
      }
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>(
            tabs
              ? '[role="tabpanel"]:not([hidden]) [aria-invalid="true"]'
              : '[aria-invalid="true"]',
          )
          ?.focus(),
      )
    },
    onSubmit: async ({ value }) => {
      setError('')
      onPending(true)
      try {
        const values = formSchema.parse(value)
        const result = await mutation.mutateAsync(values)
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success('თვის ჩანაწერი შენახულია.')
        void client.invalidateQueries({ queryKey: monthlyKey(actorId) })
        onSaved()
      } catch {
        const message =
          'ჩანაწერი ვერ შეინახა. გადაამოწმეთ მონაცემები და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      } finally {
        onPending(false)
      }
    },
  })
  const panel = (section: 'salary' | 'adjustments', content: ReactNode) =>
    tabs ? (
      <TabsContent
        value={section}
        keepMounted
        className="flex flex-col gap-4 data-hidden:hidden"
      >
        {content}
      </TabsContent>
    ) : (
      content
    )
  return (
    <form
      id="monthly-entry-form"
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col gap-5"
    >
      {error ? (
        <Alert variant="destructive">
          <IconAlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset
        disabled={mutation.isPending}
        className="flex min-w-0 flex-col gap-5"
      >
        {panel(
          'salary',
          <>
            {source ? (
              <Card className="bg-muted/30">
                <CardContent className="flex min-w-0 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <IconWallet className="size-5" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-2">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-2xl font-semibold tracking-tight tabular-nums">
                        {formatSalary(source.salary)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {source.salary.kind === 'monthly' ? 'თვეში' : 'საათში'}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge variant="secondary">
                        {salaryKindLabels[source.salary.kind]}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {salaryBasisLabels[source.salary.amountBasis]}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {source && (baseNeedsReview || source.requiresBaseConfirmation) ? (
              <Alert variant="warning" role="status">
                <IconAlertTriangle aria-hidden="true" />
                <AlertDescription>
                  {baseNeedsReview
                    ? 'ხელფასის შეთანხმება ან დასაქმების თარიღები შეიცვალა. გადაამოწმეთ და შეინახეთ თვის ხელფასი.'
                    : 'დასაქმება ან ხელფასის შეთანხმება მთელ თვეს არ მოიცავს, ან თვეში ტარიფი იცვლება. შენახვამდე გადაამოწმეთ თვის ხელფასი.'}
                </AlertDescription>
              </Alert>
            ) : null}
            {source ? (
              <FieldGroup className="gap-4 rounded-xl border bg-card p-4">
                {source.salary.kind === 'hourly' ? (
                  <form.Field name="hours">
                    {(field) => (
                      <Field data-invalid={!field.state.meta.isValid}>
                        <FieldLabel htmlFor="monthly-hours">
                          დადასტურებული საათები{' '}
                          <span aria-hidden="true">*</span>
                        </FieldLabel>
                        <Input
                          id="monthly-hours"
                          required
                          inputMode="decimal"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={!field.state.meta.isValid}
                          aria-describedby={
                            !field.state.meta.isValid
                              ? 'monthly-hours-help monthly-hours-error'
                              : 'monthly-hours-help'
                          }
                        />
                        <FieldDescription id="monthly-hours-help">
                          {firstPaymentEnabled
                            ? 'შეიყვანეთ თვის დასაწყისიდან დადასტურებული საათები. მეორე ნაწილის გამოთვლისას უკვე გაცემული თანხა გამოაკლდება.'
                            : 'შეიყვანეთ ბუღალტრის მიერ გადამოწმებული საათები.'}
                        </FieldDescription>
                        <FieldError
                          id="monthly-hours-error"
                          errors={field.state.meta.errors}
                        />
                      </Field>
                    )}
                  </form.Field>
                ) : null}
                <form.Field name="manualBase">
                  {(field) => (
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="monthly-manual">
                        {source.requiresBaseConfirmation
                          ? 'თვის ხელფასის დადასტურება'
                          : 'თვის ხელფასის შეცვლა'}
                      </FieldLabel>
                      <Switch
                        id="monthly-manual"
                        checked={field.state.value}
                        disabled={
                          source.requiresBaseConfirmation ||
                          mutation.isPending ||
                          salaryPaid
                        }
                        onCheckedChange={field.handleChange}
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Subscribe selector={(s) => s.values.manualBase}>
                  {(manual) =>
                    manual ? (
                      <form.Field name="base">
                        {(field) => (
                          <Field data-invalid={!field.state.meta.isValid}>
                            <FieldLabel htmlFor="monthly-base">
                              {monthlySalaryLabels.all} ლარში{' '}
                              <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <Input
                              id="monthly-base"
                              className="font-medium tabular-nums"
                              required
                              readOnly={salaryPaid}
                              inputMode="decimal"
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                              aria-invalid={!field.state.meta.isValid}
                              aria-describedby={
                                !field.state.meta.isValid
                                  ? 'monthly-base-error'
                                  : undefined
                              }
                            />
                            <FieldError
                              id="monthly-base-error"
                              errors={field.state.meta.errors}
                            />
                          </Field>
                        )}
                      </form.Field>
                    ) : null
                  }
                </form.Subscribe>
                {canSetFirstPayment && !firstAlreadyPaid ? (
                  <form.Field name="firstPayment">
                    {(field) => (
                      <Field data-invalid={!field.state.meta.isValid}>
                        <FieldLabel htmlFor="monthly-first-payment">
                          {monthlySalaryLabels.first} ლარში
                        </FieldLabel>
                        <Input
                          id="monthly-first-payment"
                          inputMode="decimal"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={!field.state.meta.isValid}
                          aria-describedby="monthly-first-payment-help monthly-first-payment-error"
                        />
                        <FieldDescription id="monthly-first-payment-help">
                          ცარიელი ველის შემთხვევაში გაიცემა თვის ხელფასის
                          ნახევარი.
                        </FieldDescription>
                        <FieldError
                          id="monthly-first-payment-error"
                          errors={field.state.meta.errors}
                        />
                      </Field>
                    )}
                  </form.Field>
                ) : null}
              </FieldGroup>
            ) : null}
            {source ? (
              <form.Subscribe selector={(s) => s.values}>
                {(values) => {
                  const parsed = monthlyFormSchema.safeParse(values)
                  if (!parsed.success) return null
                  const base =
                    paidBase ??
                    (values.manualBase
                      ? salaryToMinor(values.base)
                      : source.salary.kind === 'monthly'
                        ? source.salary.amountMinor
                        : hourlyBase(
                            source.salary.amountMinor,
                            salaryToMinor(values.hours) * 36,
                          ))
                  const total = monthlyTotals(
                    base,
                    values.adjustments.map((a) => ({
                      ...a,
                      amountMinor: salaryToMinor(a.amount),
                    })),
                  ).totalMinor
                  return (
                    <div
                      className="flex flex-col gap-1 rounded-xl border bg-muted/30 p-4"
                      aria-live="polite"
                    >
                      <span className="text-sm text-muted-foreground">
                        თვის ჯამი
                      </span>
                      <strong className="text-2xl tabular-nums">
                        {total >= 0 && total <= 100000000
                          ? formatSalary({ amountMinor: total })
                          : 'გადაამოწმეთ თანხები'}
                      </strong>
                    </div>
                  )
                }}
              </form.Subscribe>
            ) : null}
            {tabs?.salaryFooter}
          </>,
        )}
        {panel(
          'adjustments',
          <>
            <form.Field name="adjustments" mode="array">
              {(field) => (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">
                      ბონუსები, პრემიები და ჯარიმები
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        field.state.value.length >= 20 || mutation.isPending
                      }
                      onClick={() =>
                        field.pushValue({
                          kind: 'bonus',
                          amount: '',
                          reason: '',
                        })
                      }
                    >
                      <IconPlus data-icon="inline-start" aria-hidden="true" />
                      ჩანაწერის დამატება
                    </Button>
                  </div>
                  <form.Subscribe selector={(state) => state.values}>
                    {({ fineStage: selectedStage, adjustments }) => {
                      const fineStage = selectedStage ?? defaultFineStage
                      return (['adjustments', 'salary'] as const).map(
                        (stage) => {
                          const hasItems = adjustments.some(({ kind }) =>
                            kind === 'fine'
                              ? fineStage === stage
                              : stage === 'adjustments',
                          )
                          if (!hasItems) return null
                          const paid = payments.find(
                            (payment) => payment.stage === stage,
                          )
                          const start = paymentWindows.find(
                            (window) => window.stage === stage,
                          )?.start
                          const label =
                            stage === 'salary'
                              ? 'ჯარიმის დაქვითვის თარიღი'
                              : 'გაცემის თარიღი'
                          const id = `monthly-${stage}-payment-date`
                          return paid ? (
                            <div
                              key={stage}
                              className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3"
                            >
                              <span className="text-sm font-medium">
                                {label}
                              </span>
                              <time
                                className="text-sm text-muted-foreground"
                                dateTime={paid.paidOn}
                              >
                                {formatGeorgianDate(paid.paidOn)}
                              </time>
                            </div>
                          ) : (
                            <form.Field
                              name={`paymentDates.${stage}`}
                              key={stage}
                            >
                              {(date) => (
                                <Field data-invalid={!date.state.meta.isValid}>
                                  <FieldLabel htmlFor={id}>{label}</FieldLabel>
                                  <DatePicker
                                    id={id}
                                    value={date.state.value}
                                    today={start ?? `${month}-01`}
                                    invalid={!date.state.meta.isValid}
                                    clearLabel="გადახდის თარიღის გასუფთავება"
                                    onBlur={date.handleBlur}
                                    onChange={date.handleChange}
                                  />
                                  {start &&
                                  (!date.state.value ||
                                    date.state.value < start) ? (
                                    <FieldDescription>
                                      გრაფიკით {formatGeorgianDate(start)}-დან
                                    </FieldDescription>
                                  ) : null}
                                  <FieldError
                                    id={`${id}-error`}
                                    errors={date.state.meta.errors}
                                  />
                                </Field>
                              )}
                            </form.Field>
                          )
                        },
                      )
                    }}
                  </form.Subscribe>
                  {!field.state.value.length ? (
                    <Empty className="rounded-xl border border-dashed md:p-8">
                      <EmptyHeader>
                        <EmptyTitle>დამატებითი ჩანაწერები არ არის</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  ) : null}
                  {field.state.value.map((_, index) => (
                    <FieldGroup
                      key={index}
                      className="gap-4 rounded-xl border bg-muted/20 p-4"
                    >
                      <div className="flex items-end gap-3">
                        <form.Field name={`adjustments[${index}].kind`}>
                          {(item) => (
                            <Field className="min-w-0 flex-1">
                              <FieldLabel htmlFor={`monthly-kind-${index}`}>
                                ტიპი <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <Select
                                value={item.state.value}
                                onValueChange={(v) => {
                                  if (
                                    v === 'bonus' ||
                                    v === 'premium' ||
                                    v === 'fine'
                                  )
                                    item.handleChange(v)
                                }}
                              >
                                <SelectTrigger
                                  id={`monthly-kind-${index}`}
                                  aria-required="true"
                                  className="w-full"
                                >
                                  <SelectValue>
                                    {monthlyAdjustmentLabels[item.state.value]}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {(
                                      ['bonus', 'premium', 'fine'] as const
                                    ).map((kind) => (
                                      <SelectItem key={kind} value={kind}>
                                        {monthlyAdjustmentLabels[kind]}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </Field>
                          )}
                        </form.Field>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`ჩანაწერის წაშლა ${index + 1}`}
                          onClick={() => field.removeValue(index)}
                        >
                          <IconTrash aria-hidden="true" />
                        </Button>
                      </div>
                      <form.Field name={`adjustments[${index}].amount`}>
                        {(item) => (
                          <Field data-invalid={!item.state.meta.isValid}>
                            <FieldLabel htmlFor={`monthly-amount-${index}`}>
                              თანხა ლარში <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <Input
                              id={`monthly-amount-${index}`}
                              required
                              inputMode="decimal"
                              value={item.state.value}
                              onBlur={item.handleBlur}
                              onChange={(e) =>
                                item.handleChange(e.target.value)
                              }
                              aria-invalid={!item.state.meta.isValid}
                              aria-describedby={
                                !item.state.meta.isValid
                                  ? `monthly-amount-${index}-error`
                                  : undefined
                              }
                            />
                            <FieldError
                              id={`monthly-amount-${index}-error`}
                              errors={item.state.meta.errors}
                            />
                          </Field>
                        )}
                      </form.Field>
                      <form.Subscribe
                        selector={(s) =>
                          s.values.adjustments[index]?.kind === 'fine'
                        }
                      >
                        {(fine) => (
                          <form.Field name={`adjustments[${index}].reason`}>
                            {(item) => (
                              <Field data-invalid={!item.state.meta.isValid}>
                                <FieldLabel htmlFor={`monthly-reason-${index}`}>
                                  შენიშვნა{' '}
                                  {fine ? (
                                    <span aria-hidden="true">*</span>
                                  ) : null}
                                </FieldLabel>
                                <Textarea
                                  id={`monthly-reason-${index}`}
                                  required={fine}
                                  maxLength={500}
                                  value={item.state.value}
                                  onBlur={item.handleBlur}
                                  onChange={(e) =>
                                    item.handleChange(e.target.value)
                                  }
                                  aria-invalid={!item.state.meta.isValid}
                                  aria-describedby={
                                    !item.state.meta.isValid
                                      ? `monthly-reason-${index}-error`
                                      : undefined
                                  }
                                />
                                <FieldError
                                  id={`monthly-reason-${index}-error`}
                                  errors={item.state.meta.errors}
                                />
                              </Field>
                            )}
                          </form.Field>
                        )}
                      </form.Subscribe>
                    </FieldGroup>
                  ))}
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
            <form.Subscribe
              selector={(s) =>
                s.values.adjustments.some((item) => item.kind === 'fine')
              }
            >
              {(hasFine) =>
                hasFine ? (
                  <form.Field name="fineStage">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="monthly-fine-stage">
                          ჯარიმის დაქვითვის ეტაპი
                        </FieldLabel>
                        <Select
                          value={field.state.value ?? 'default'}
                          onValueChange={(value) => {
                            if (
                              value === 'default' ||
                              value === 'salary' ||
                              value === 'adjustments'
                            )
                              field.handleChange(
                                value === 'default' ? null : value,
                              )
                          }}
                        >
                          <SelectTrigger
                            id="monthly-fine-stage"
                            className="w-full"
                          >
                            <SelectValue>
                              {field.state.value
                                ? payStageLabel(
                                    field.state.value,
                                    firstPaymentEnabled,
                                  )
                                : `გრაფიკის მიხედვით (${payStageLabel(defaultFineStage, firstPaymentEnabled)})`}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="default">
                                გრაფიკის მიხედვით
                              </SelectItem>
                              <SelectItem value="salary">
                                {payStageLabel('salary', firstPaymentEnabled)}
                              </SelectItem>
                              <SelectItem value="adjustments">
                                {payStageLabel(
                                  'adjustments',
                                  firstPaymentEnabled,
                                )}
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </form.Field>
                ) : null
              }
            </form.Subscribe>
          </>,
        )}
      </fieldset>
      {showSubmit ? (
        <Button
          type="submit"
          disabled={mutation.isPending}
          aria-busy={mutation.isPending}
        >
          {mutation.isPending ? (
            <Spinner />
          ) : (
            <IconDeviceFloppy aria-hidden="true" data-icon="inline-start" />
          )}
          ჩანაწერის შენახვა
        </Button>
      ) : null}
    </form>
  )
}
