import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconDeviceFloppy, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { DatePicker } from '#/components/common/date-picker'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import {
  bonusCalculationSchema,
  bonusKindSchema,
  bonusRuleFormSchema,
} from '../bonus-rules.schemas'
import {
  bonusCalculationLabels,
  bonusKindLabels,
} from '../bonus-rules.presentation'
import {
  salaryAmountInput,
  salaryBasisSchema,
  salaryToMinor,
} from '../salary.schemas'
import { salaryBasisLabels } from '../salary.presentation'
import { updateBonusRule } from '../bonus-rules.functions'
import { bonusRulesKey } from '../bonus-rules.queries'
import type { BonusRuleSummary } from '../bonus-rules.types'

function RuleSelect({
  id,
  value,
  labels,
  onChange,
  invalid = false,
}: {
  id: string
  value: string
  labels: Record<string, string>
  onChange: (value: string | null) => void
  invalid?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        className="w-full"
        aria-required="true"
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
      >
        <SelectValue>{labels[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {Object.entries(labels).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
export function BonusRuleEditor({
  actorId,
  existing,
  today,
  open,
  onClose,
}: {
  actorId: string
  existing: BonusRuleSummary | null
  today: string
  open: boolean
  onClose: () => void
}) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const [initial] = useState(() => {
    const row = existing?.latest
    return {
      name: row?.name ?? '',
      kind: row?.kind ?? ('bonus' as const),
      calculation: row?.calculation ?? ('fixed' as const),
      unitLabel: row?.unitLabel ?? '',
      qualification: row?.qualification ?? '',
      amount: row ? salaryAmountInput(row.amountMinor) : '',
      amountBasis: row?.amountBasis ?? ('gross' as const),
      enabled: row?.enabled ?? true,
      effectiveFrom:
        row && row.effectiveFrom > today ? row.effectiveFrom : today,
      reason: '',
    }
  })
  const [target] = useState(() => ({
    ruleId: existing?.ruleId ?? null,
    expectedVersion: existing?.latest.version ?? 0,
  }))
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof updateBonusRule>[0]) =>
      updateBonusRule(input),
    retry: false,
  })
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: bonusRuleFormSchema },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('#bonus-rule-form [aria-invalid="true"]')
          ?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const { amount, ...parsed } = bonusRuleFormSchema.parse(value)
        const result = await mutation.mutateAsync({
          data: {
            ...parsed,
            ...target,
            requestId,
            amountMinor: salaryToMinor(amount),
            currency: 'GEL',
          },
        })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success('წახალისების წესი შენახულია.')
        void client.invalidateQueries({ queryKey: bonusRulesKey(actorId) })
        onClose()
      } catch {
        const message =
          'წესი ვერ შეინახა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
  const labels = {
    name: 'დასახელება',
    amount: 'თანხა ლარში',
    qualification: 'მინიჭების პირობა',
    unitLabel: 'დამატებითი სამუშაოს ერთეული',
    reason: 'ცვლილების საფუძველი',
  }
  return (
    <form.Subscribe selector={(s) => s.isSubmitting}>
      {(pending) => (
        <Sheet
          open={open}
          onOpenChange={(next) => {
            if (!next && !pending) onClose()
          }}
        >
          <SheetContent
            showCloseButton={false}
            className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
          >
            <SheetHeader className="shrink-0 border-b p-5 pr-16 sm:p-6 sm:pr-16">
              <SheetTitle>
                {target.ruleId
                  ? 'წახალისების წესის ცვლილება'
                  : 'ახალი წახალისების წესი'}
              </SheetTitle>
              <SheetDescription className="sr-only">
                კომპანიის ბონუსისა და პრემიის დათარიღებული პირობები
              </SheetDescription>
              <Button
                variant="ghost"
                size="icon"
                aria-label="დახურვა"
                className="absolute top-4 right-4"
                disabled={pending}
                onClick={onClose}
              >
                <IconX aria-hidden="true" />
              </Button>
            </SheetHeader>
            <form
              id="bonus-rule-form"
              noValidate
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit()
              }}
            >
              <fieldset
                disabled={pending}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
                  <Alert variant="info">
                    <AlertDescription>
                      წესი არ ნიშნავს თანამშრომლისთვის თანხის მინიჭებას.
                      რაოდენობის მიღება და თანხის დამტკიცება ცალკე ეტაპებია.
                    </AlertDescription>
                  </Alert>
                  {existing?.next ? (
                    <Alert variant="warning">
                      <AlertDescription>
                        მომავალი ცვლილებები შენარჩუნდება. იმავე თარიღზე ახალი
                        ვერსია წინა პირობას ჩაანაცვლებს.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <FieldGroup>
                    <form.Field name="kind">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor="bonus-rule-kind">
                            წახალისების ტიპი <span aria-hidden="true">*</span>
                          </FieldLabel>
                          <RuleSelect
                            id="bonus-rule-kind"
                            value={field.state.value}
                            labels={bonusKindLabels}
                            onChange={(value) => {
                              const parsed = bonusKindSchema.safeParse(value)
                              if (parsed.success) {
                                field.handleChange(parsed.data)
                                if (parsed.data === 'premium') {
                                  form.setFieldValue('calculation', 'fixed')
                                  form.setFieldValue('unitLabel', '')
                                }
                              }
                            }}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="calculation">
                      {(field) => {
                        const invalid =
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid
                        return (
                          <Field data-invalid={invalid}>
                            <FieldLabel htmlFor="bonus-rule-calculation">
                              გამოთვლის წესი <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <RuleSelect
                              id="bonus-rule-calculation"
                              value={field.state.value}
                              labels={bonusCalculationLabels}
                              invalid={invalid}
                              onChange={(value) => {
                                const parsed =
                                  bonusCalculationSchema.safeParse(value)
                                if (parsed.success) {
                                  field.handleChange(parsed.data)
                                  if (parsed.data !== 'additional_work')
                                    form.setFieldValue('unitLabel', '')
                                }
                              }}
                            />
                            <FieldError
                              id="bonus-rule-calculation-error"
                              errors={field.state.meta.errors}
                            />
                          </Field>
                        )
                      }}
                    </form.Field>
                    {(
                      ['name', 'amount', 'qualification', 'unitLabel'] as const
                    ).map((name) => (
                      <form.Subscribe
                        key={name}
                        selector={(s) => s.values.calculation}
                      >
                        {(calculation) =>
                          name === 'unitLabel' &&
                          calculation !== 'additional_work' ? null : (
                            <form.Field name={name}>
                              {(field) => {
                                const invalid =
                                  field.state.meta.isTouched &&
                                  !field.state.meta.isValid
                                const props = {
                                  id: `bonus-rule-${name}`,
                                  name: field.name,
                                  required: true,
                                  value: field.state.value,
                                  onBlur: field.handleBlur,
                                  onChange: (
                                    event: React.ChangeEvent<
                                      HTMLInputElement | HTMLTextAreaElement
                                    >,
                                  ) => field.handleChange(event.target.value),
                                  'aria-invalid': invalid,
                                  'aria-describedby': invalid
                                    ? `bonus-rule-${name}-error`
                                    : undefined,
                                }
                                return (
                                  <Field data-invalid={invalid}>
                                    <FieldLabel htmlFor={props.id}>
                                      {labels[name]}{' '}
                                      <span aria-hidden="true">*</span>
                                    </FieldLabel>
                                    {name === 'qualification' ? (
                                      <Textarea
                                        {...props}
                                        maxLength={1000}
                                        rows={3}
                                      />
                                    ) : (
                                      <Input
                                        {...props}
                                        maxLength={
                                          name === 'amount'
                                            ? 10
                                            : name === 'name'
                                              ? 120
                                              : 60
                                        }
                                        inputMode={
                                          name === 'amount' ? 'decimal' : 'text'
                                        }
                                        autoComplete="off"
                                      />
                                    )}
                                    {name === 'unitLabel' ? (
                                      <FieldDescription>
                                        მაგალითად: საათი, მეტრი ან დამუშავებული
                                        ერთეული. ეს ავტომატურ ზეგანაკვეთურ
                                        ანაზღაურებას არ ადგენს.
                                      </FieldDescription>
                                    ) : null}
                                    <FieldError
                                      id={`${props.id}-error`}
                                      errors={field.state.meta.errors}
                                    />
                                  </Field>
                                )
                              }}
                            </form.Field>
                          )
                        }
                      </form.Subscribe>
                    ))}
                    <form.Field name="amountBasis">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor="bonus-rule-basis">
                            თანხის საფუძველი <span aria-hidden="true">*</span>
                          </FieldLabel>
                          <RuleSelect
                            id="bonus-rule-basis"
                            value={field.state.value}
                            labels={salaryBasisLabels}
                            onChange={(value) => {
                              const parsed = salaryBasisSchema.safeParse(value)
                              if (parsed.success)
                                field.handleChange(parsed.data)
                            }}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="effectiveFrom">
                      {(field) => {
                        const invalid =
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid
                        return (
                          <Field data-invalid={invalid}>
                            <FieldLabel htmlFor="bonus-rule-date">
                              ძალაში შესვლის თარიღი{' '}
                              <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <DatePicker
                              id="bonus-rule-date"
                              required
                              value={field.state.value}
                              today={today}
                              invalid={invalid}
                              onChange={field.handleChange}
                              onBlur={field.handleBlur}
                            />
                            <FieldDescription>
                              აირჩიეთ მიმდინარე ან მომავალი თარიღი.
                            </FieldDescription>
                            <FieldError
                              id="bonus-rule-date-error"
                              errors={field.state.meta.errors}
                            />
                          </Field>
                        )
                      }}
                    </form.Field>
                    <form.Field name="enabled">
                      {(field) => (
                        <Field
                          orientation="horizontal"
                          className="rounded-xl border p-4"
                        >
                          <FieldLabel htmlFor="bonus-rule-enabled">
                            წესი მოქმედებს ამ თარიღიდან
                          </FieldLabel>
                          <Switch
                            id="bonus-rule-enabled"
                            checked={field.state.value}
                            onCheckedChange={field.handleChange}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="reason">
                      {(field) => {
                        const invalid =
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid
                        return (
                          <Field data-invalid={invalid}>
                            <FieldLabel htmlFor="bonus-rule-reason">
                              ცვლილების საფუძველი{' '}
                              <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <Textarea
                              id="bonus-rule-reason"
                              required
                              maxLength={500}
                              rows={3}
                              value={field.state.value}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                              onBlur={field.handleBlur}
                              aria-invalid={invalid}
                              aria-describedby={
                                invalid ? 'bonus-rule-reason-error' : undefined
                              }
                            />
                            <FieldError
                              id="bonus-rule-reason-error"
                              errors={field.state.meta.errors}
                            />
                          </Field>
                        )
                      }}
                    </form.Field>
                  </FieldGroup>
                  {error ? (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}
                </div>
                <SheetFooter className="shrink-0 border-t p-5 sm:flex-row sm:p-6">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={onClose}
                  >
                    გაუქმება
                  </Button>
                  <Button type="submit" disabled={pending} aria-busy={pending}>
                    <span
                      className="flex size-4 items-center justify-center"
                      aria-hidden="true"
                    >
                      {pending ? <Spinner /> : <IconDeviceFloppy />}
                    </span>
                    წესის შენახვა
                  </Button>
                </SheetFooter>
              </fieldset>
            </form>
          </SheetContent>
        </Sheet>
      )}
    </form.Subscribe>
  )
}
