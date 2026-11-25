import { useState } from 'react'
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
import { monthlyFormSchema } from '../monthly.schemas'
import {
  hourlyBase,
  monthlyAdjustmentLabels,
  monthlyTotals,
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
  onSaved,
  onPending,
  showSubmit = true,
}: {
  actorId: string
  month: string
  userId: string
  source: MonthlySource | null
  current: MonthlyDetail['current']
  onSaved: () => void
  onPending: (value: boolean) => void
  showSubmit?: boolean
}) {
  const [{ source, current }] = useState(() => ({
    source: initialSource,
    current: initialCurrent,
  }))
  const adjustmentsOnly = !source
  const client = useQueryClient(),
    [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof monthlyFormSchema>) => {
      const data = {
        month,
        userId,
        expectedVersion: current?.version ?? 0,
        requestId,
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
        },
      })
    },
    retry: false,
  })
  const existingAdjustments =
    current && (!adjustmentsOnly || current.status !== 'voided')
      ? current.adjustments
      : []
  const form = useForm({
    defaultValues: {
      hours: source && current ? String(current.workedSeconds / 3600) : '0',
      base:
        source?.requiresBaseConfirmation && !current?.manualBase
          ? ''
          : salaryAmountInput(
              source
                ? current?.salary
                  ? current.baseMinor
                  : source.salary.amountMinor
                : 0,
            ),
      manualBase:
        !!source &&
        (source.requiresBaseConfirmation || (current?.manualBase ?? false)),
      adjustments:
        adjustmentsOnly && !existingAdjustments.length
          ? [{ kind: 'bonus' as const, amount: '', reason: '' }]
          : existingAdjustments.map((a) => ({
              kind: a.kind,
              amount: salaryAmountInput(a.amountMinor),
              reason: a.reason,
            })),
    },
    validators: { onSubmit: monthlyFormSchema },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            '#monthly-entry-form [aria-invalid="true"]',
          )
          ?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      onPending(true)
      try {
        const values = monthlyFormSchema.parse(value)
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
  return (
    <form
      id="monthly-entry-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col gap-5"
    >
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
      {source?.requiresBaseConfirmation ? (
        <Alert variant="warning" role="status">
          <IconAlertTriangle aria-hidden="true" />
          <AlertDescription>
            თვე არასრულია ან ტარიფი იცვლება. გადაამოწმეთ და ცალკე დაადასტურეთ ამ
            თვის საბაზო თანხა.
          </AlertDescription>
        </Alert>
      ) : null}
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
        {source ? (
          <FieldGroup className="gap-4 rounded-xl border bg-card p-4">
            {source.salary.kind === 'hourly' ? (
              <form.Field name="hours">
                {(field) => (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <FieldLabel htmlFor="monthly-hours">
                      დადასტურებული საათები <span aria-hidden="true">*</span>
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
                      შეიყვანეთ ბუღალტრის მიერ გადამოწმებული საათები. დასწრების
                      ჩანაწერები ავტომატურად არ ითვლება ასანაზღაურებელ დროდ.
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
                    საბაზო თანხის ცალკე დადასტურება
                  </FieldLabel>
                  <Switch
                    id="monthly-manual"
                    checked={field.state.value}
                    disabled={
                      source.requiresBaseConfirmation || mutation.isPending
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
                          საბაზო თანხა ლარში <span aria-hidden="true">*</span>
                        </FieldLabel>
                        <Input
                          id="monthly-base"
                          className="font-medium tabular-nums"
                          required
                          inputMode="decimal"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
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
          </FieldGroup>
        ) : null}
        <form.Field name="adjustments" mode="array">
          {(field) => (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">ბონუსები, პრემიები და ჯარიმები</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    field.state.value.length >= 20 || mutation.isPending
                  }
                  onClick={() =>
                    field.pushValue({ kind: 'bonus', amount: '', reason: '' })
                  }
                >
                  <IconPlus data-icon="inline-start" aria-hidden="true" />
                  ჩანაწერის დამატება
                </Button>
              </div>
              {!field.state.value.length ? (
                <p className="text-sm text-muted-foreground">
                  დამატებითი ჩანაწერები არ არის.
                </p>
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
                                {(['bonus', 'premium', 'fine'] as const).map(
                                  (kind) => (
                                    <SelectItem key={kind} value={kind}>
                                      {monthlyAdjustmentLabels[kind]}
                                    </SelectItem>
                                  ),
                                )}
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
                          onChange={(e) => item.handleChange(e.target.value)}
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
                              {fine ? <span aria-hidden="true">*</span> : null}
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
        {source ? (
          <form.Subscribe selector={(s) => s.values}>
            {(values) => {
              const parsed = monthlyFormSchema.safeParse(values)
              if (!parsed.success) return null
              const base = values.manualBase
                ? salaryToMinor(values.base)
                : source.salary.kind === 'monthly'
                  ? source.salary.amountMinor
                  : hourlyBase(
                      source.salary.amountMinor,
                      salaryToMinor(values.hours) * 36,
                    )
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
                    შეთანხმების ჯამი
                  </span>
                  <strong className="text-2xl tabular-nums">
                    {total >= 0 && total <= 100000000
                      ? formatSalary({ amountMinor: total })
                      : 'გადაამოწმეთ თანხები'}
                  </strong>
                  <span className="text-sm text-muted-foreground">
                    გადასახადები და საპენსიო შენატანები აქ არ გამოითვლება.
                  </span>
                </div>
              )
            }}
          </form.Subscribe>
        ) : null}
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
