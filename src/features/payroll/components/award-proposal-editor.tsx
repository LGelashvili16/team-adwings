import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconDeviceFloppy, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { DatePicker } from '#/components/common/date-picker'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldDescription,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { AwardInputPicker } from './award-input-picker'
import {
  awardFormSchema,
  awardQuantitySchema,
  quantityInput,
  quantityToMilli,
} from '../award-proposals.schemas'
import { proposedAwardAmount } from '../award-proposals.rules'
import { bonusUnitLabel } from '../bonus-rules.presentation'
import { formatSalary, salaryBasisLabels } from '../salary.presentation'
import { setAwardProposal } from '../award-proposals.functions'
import { awardKey } from '../award-proposals.queries'
import type { AwardChoice, AwardSummary } from '../award-proposals.types'

export function AwardProposalEditor({
  actorId,
  existing,
  today,
  open,
  onClose,
}: {
  actorId: string
  existing: AwardSummary | null
  today: string
  open: boolean
  onClose: () => void
}) {
  const client = useQueryClient(),
    [error, setError] = useState(''),
    [requestId] = useState(() => crypto.randomUUID())
  const [target] = useState(() => ({
    proposalId: existing?.proposalId ?? null,
    expectedVersion: existing?.current.version ?? 0,
  }))
  const [person, setPerson] = useState<AwardChoice | null>(() =>
    existing
      ? {
          id: existing.userId,
          label: existing.employeeName,
          description: '',
          rule: null,
        }
      : null,
  )
  const [rate, setRate] = useState<AwardChoice | null>(() =>
    existing
      ? {
          id: existing.ruleId,
          label: existing.current.rule.name,
          description: '',
          rule: existing.current.rule,
        }
      : null,
  )
  const [job, setJob] = useState<AwardChoice | null>(() =>
    existing?.jobId
      ? {
          id: existing.jobId,
          label: existing.current.sourceSnapshot.jobTitle ?? existing.jobId,
          description: '',
          rule: null,
        }
      : null,
  )
  const [initial] = useState(() => ({
    userId: existing?.userId ?? '',
    ruleId: existing?.ruleId ?? '',
    workDate: existing?.current.workDate ?? today,
    jobId: existing?.jobId ?? (null as string | null),
    reference: existing?.current.reference ?? '',
    calculation: existing?.current.rule.calculation ?? ('fixed' as const),
    quantity: existing ? quantityInput(existing.current.quantityMilli) : '1',
    evidence: existing?.current.evidence ?? '',
    reason: '',
  }))
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof setAwardProposal>[0]) =>
      setAwardProposal(input),
    retry: false,
  })
  const [validationSchema] = useState(() =>
    awardFormSchema.refine((value) => value.workDate <= today, {
      path: ['workDate'],
      message: 'შესრულების თარიღი მომავალში ვერ იქნება.',
    }),
  )
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: validationSchema },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            '#award-proposal-form [aria-invalid="true"]',
          )
          ?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const parsed = validationSchema.parse(value)
        const { quantity, calculation: _calculation, ...data } = parsed
        const result = await mutation.mutateAsync({
          data: {
            ...data,
            ...target,
            requestId,
            expectedRuleVersion: rate?.rule?.version ?? 0,
            quantityMilli: quantityToMilli(quantity),
          },
        })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success('წახალისების განაცხადი შენახულია.')
        void client.invalidateQueries({ queryKey: awardKey(actorId) })
        onClose()
      } catch {
        const message =
          'განაცხადი ვერ შეინახა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
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
                {existing
                  ? 'განაცხადის ცვლილება'
                  : 'წახალისების ახალი განაცხადი'}
              </SheetTitle>
              <SheetDescription className="sr-only">
                ინდივიდუალური წახალისება დამოუკიდებელი განხილვისთვის
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
              id="award-proposal-form"
              noValidate
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault()
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
                      განაცხადი ინახავს შემოთავაზებულ თანხას. ის ჯერ არ არის
                      დამტკიცებული, ხელფასზე დარიცხული ან გადახდილი.
                    </AlertDescription>
                  </Alert>
                  {existing ? (
                    <Alert>
                      <AlertDescription>
                        თანამშრომელი, წესი და წყაროს ნომერი უცვლელია. გაუქმებული
                        განაცხადის შენახვა მას ხელახლა წარადგენს.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <FieldGroup>
                    <form.Field name="userId">
                      {(field) => (
                        <form.Subscribe selector={(s) => s.values.workDate}>
                          {(workDate) => (
                            <Field data-invalid={!field.state.meta.isValid}>
                              <FieldLabel htmlFor="award-person">
                                თანამშრომელი <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <AwardInputPicker
                                id="award-person"
                                kind="employee"
                                actorId={actorId}
                                value={person}
                                workDate={workDate}
                                userId={field.state.value || null}
                                disabled={!!existing}
                                invalid={!field.state.meta.isValid}
                                onChange={(item) => {
                                  setPerson(item)
                                  field.handleChange(item.id)
                                  setJob(null)
                                  form.setFieldValue('jobId', null)
                                }}
                              />
                              <FieldError
                                id="award-person-error"
                                errors={field.state.meta.errors}
                              />
                            </Field>
                          )}
                        </form.Subscribe>
                      )}
                    </form.Field>
                    <form.Field name="workDate">
                      {(field) => {
                        const invalid =
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid
                        return (
                          <Field data-invalid={invalid}>
                            <FieldLabel htmlFor="award-date">
                              შესრულების თარიღი{' '}
                              <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <DatePicker
                              id="award-date"
                              value={field.state.value}
                              today={today}
                              required
                              invalid={invalid}
                              onBlur={field.handleBlur}
                              onChange={(value) => {
                                field.handleChange(value)
                                setRate(null)
                                form.setFieldValue('ruleId', '')
                                if (!existing) {
                                  setJob(null)
                                  form.setFieldValue('jobId', null)
                                }
                              }}
                            />
                            <FieldDescription>
                              სამუშაოს ბონუსისთვის აირჩიეთ სამუშაოს დასრულების
                              თარიღი.
                            </FieldDescription>
                            <FieldError
                              id="award-date-error"
                              errors={field.state.meta.errors}
                            />
                          </Field>
                        )
                      }}
                    </form.Field>
                    <form.Field name="ruleId">
                      {(field) => (
                        <form.Subscribe selector={(s) => s.values.workDate}>
                          {(workDate) => (
                            <Field data-invalid={!field.state.meta.isValid}>
                              <FieldLabel htmlFor="award-rule">
                                წახალისების წესი{' '}
                                <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <AwardInputPicker
                                id="award-rule"
                                kind="rule"
                                actorId={actorId}
                                value={rate}
                                workDate={workDate}
                                userId={person?.id ?? null}
                                ruleId={existing?.ruleId ?? null}
                                invalid={!field.state.meta.isValid}
                                onChange={(item) => {
                                  setRate(item)
                                  field.handleChange(item.id)
                                  form.setFieldValue(
                                    'calculation',
                                    item.rule!.calculation,
                                  )
                                  if (!existing) {
                                    form.setFieldValue('reference', '')
                                    form.setFieldValue('jobId', null)
                                    setJob(null)
                                  }
                                  if (
                                    item.rule?.calculation === 'fixed' ||
                                    item.rule?.calculation === 'job'
                                  )
                                    form.setFieldValue('quantity', '1')
                                }}
                              />
                              <FieldError
                                id="award-rule-error"
                                errors={field.state.meta.errors}
                              />
                            </Field>
                          )}
                        </form.Subscribe>
                      )}
                    </form.Field>
                    {rate?.rule ? (
                      <Card>
                        <CardHeader>
                          <CardTitle>{rate.rule.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                          <p className="font-semibold tabular-nums">
                            {formatSalary(rate.rule)} ·{' '}
                            {bonusUnitLabel(rate.rule)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {salaryBasisLabels[rate.rule.amountBasis]} · ვერსია{' '}
                            {rate.rule.version}
                          </p>
                          <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                            {rate.rule.qualification}
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}
                    {rate?.rule?.calculation === 'job' ? (
                      <form.Field name="jobId">
                        {(field) => (
                          <form.Subscribe
                            selector={(s) => ({
                              date: s.values.workDate,
                              userId: s.values.userId,
                            })}
                          >
                            {(values) => (
                              <Field data-invalid={!field.state.meta.isValid}>
                                <FieldLabel htmlFor="award-job">
                                  დასრულებული სამუშაო{' '}
                                  <span aria-hidden="true">*</span>
                                </FieldLabel>
                                <AwardInputPicker
                                  id="award-job"
                                  kind="job"
                                  actorId={actorId}
                                  value={job}
                                  workDate={values.date}
                                  userId={values.userId || null}
                                  disabled={!!existing || !values.userId}
                                  invalid={!field.state.meta.isValid}
                                  onChange={(item) => {
                                    setJob(item)
                                    field.handleChange(item.id)
                                    form.setFieldValue('reference', '')
                                  }}
                                />
                                <FieldError
                                  id="award-job-error"
                                  errors={field.state.meta.errors}
                                />
                              </Field>
                            )}
                          </form.Subscribe>
                        )}
                      </form.Field>
                    ) : (
                      <form.Field name="reference">
                        {(field) => {
                          const invalid =
                            field.state.meta.isTouched &&
                            !field.state.meta.isValid
                          return (
                            <Field data-invalid={invalid}>
                              <FieldLabel htmlFor="award-reference">
                                წყაროს ნომერი <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <Input
                                id="award-reference"
                                required
                                disabled={!!existing}
                                maxLength={160}
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                                aria-invalid={invalid}
                                aria-describedby={
                                  invalid
                                    ? 'award-reference-error'
                                    : 'award-reference-help'
                                }
                              />
                              <FieldDescription id="award-reference-help">
                                დავალების, მიღების აქტის ან წახალისების
                                გადაწყვეტილების უნიკალური ნომერი. ერთი წყაროს
                                შესწორება ხდება არსებული განაცხადით.
                              </FieldDescription>
                              <FieldError
                                id="award-reference-error"
                                errors={field.state.meta.errors}
                              />
                            </Field>
                          )
                        }}
                      </form.Field>
                    )}
                    <form.Field name="quantity">
                      {(field) => {
                        const invalid =
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid
                        return (
                          <Field data-invalid={invalid}>
                            <FieldLabel htmlFor="award-quantity">
                              მიღებული რაოდენობა{' '}
                              <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <Input
                              id="award-quantity"
                              required
                              inputMode="decimal"
                              autoComplete="off"
                              maxLength={10}
                              value={field.state.value}
                              readOnly={
                                rate?.rule?.calculation === 'fixed' ||
                                rate?.rule?.calculation === 'job'
                              }
                              onBlur={field.handleBlur}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                              aria-invalid={invalid}
                              aria-describedby={
                                invalid ? 'award-quantity-error' : undefined
                              }
                            />
                            <FieldError
                              id="award-quantity-error"
                              errors={field.state.meta.errors}
                            />
                          </Field>
                        )
                      }}
                    </form.Field>
                    {(['evidence', 'reason'] as const).map((name) => (
                      <form.Field key={name} name={name}>
                        {(field) => {
                          const invalid =
                            field.state.meta.isTouched &&
                            !field.state.meta.isValid
                          return (
                            <Field data-invalid={invalid}>
                              <FieldLabel htmlFor={`award-${name}`}>
                                {name === 'evidence'
                                  ? 'შესრულების მტკიცებულება'
                                  : 'ცვლილების საფუძველი'}{' '}
                                <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <Textarea
                                id={`award-${name}`}
                                required
                                rows={3}
                                maxLength={name === 'evidence' ? 1000 : 500}
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                                aria-invalid={invalid}
                                aria-describedby={
                                  invalid ? `award-${name}-error` : undefined
                                }
                              />
                              <FieldError
                                id={`award-${name}-error`}
                                errors={field.state.meta.errors}
                              />
                            </Field>
                          )
                        }}
                      </form.Field>
                    ))}
                  </FieldGroup>
                  <form.Subscribe selector={(s) => s.values.quantity}>
                    {(quantity) => {
                      let amount: string | null = null
                      try {
                        if (rate?.rule)
                          amount = formatSalary({
                            amountMinor: proposedAwardAmount(
                              rate.rule.amountMinor,
                              quantityToMilli(
                                awardQuantitySchema.parse(quantity),
                              ),
                              rate.rule.calculation,
                            ),
                          })
                      } catch {}
                      return amount ? (
                        <Card>
                          <CardContent className="flex flex-wrap items-center justify-between gap-3">
                            <span className="text-sm text-muted-foreground">
                              შემოთავაზებული თანხა
                            </span>
                            <span className="text-xl font-semibold tabular-nums">
                              {amount}
                            </span>
                          </CardContent>
                        </Card>
                      ) : null
                    }}
                  </form.Subscribe>
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
                    განაცხადის შენახვა
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
