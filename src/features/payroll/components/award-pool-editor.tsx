import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconDeviceFloppy, IconTrash, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { DatePicker } from '#/components/common/date-picker'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
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
import { PoolAllocationTable } from './award-pool-tables'
import { awardPoolFormSchema } from '../award-review.schemas'
import {
  awardQuantitySchema,
  quantityInput,
  quantityToMilli,
} from '../award-proposals.schemas'
import {
  salaryToMinor,
  salaryAmountInput,
  salaryFormSchema,
} from '../salary.schemas'
import { equalAwardShares, proposedAwardAmount } from '../award-proposals.rules'
import { formatSalary, salaryBasisLabels } from '../salary.presentation'
import { bonusUnitLabel } from '../bonus-rules.presentation'
import { setAwardPool } from '../award-pools.functions'
import { awardKey } from '../award-proposals.queries'
import type { AwardPoolDetail } from '../award-pools.types'
import type { AwardChoice } from '../award-proposals.types'

export function AwardPoolEditor({
  actorId,
  existing,
  today,
  open,
  onClose,
  onSaved,
}: {
  actorId: string
  existing: AwardPoolDetail | null
  today: string
  open: boolean
  onClose: () => void
  onSaved?: (poolId: string) => void
}) {
  const client = useQueryClient(),
    [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState('')
  const [target] = useState(() => ({
    poolId: existing?.poolId ?? null,
    expectedVersion: existing?.current.version ?? 0,
  }))
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
          label:
            existing.members[0]?.current.sourceSnapshot.jobTitle ??
            existing.jobId,
          description: '',
          rule: null,
        }
      : null,
  )
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      existing?.current.allocations.map((a) => [a.userId, a.name]) ?? [],
    ),
  )
  const [schema] = useState(() =>
    awardPoolFormSchema.refine((v) => v.workDate <= today, {
      path: ['workDate'],
      message: 'შესრულების თარიღი მომავალში ვერ იქნება.',
    }),
  )
  // The selected tariff is read at submit time, rather than frozen in a form validator.
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof setAwardPool>[0]) =>
      setAwardPool(input),
    retry: false,
  })
  const [initial] = useState(() => ({
    ruleId: existing?.ruleId ?? '',
    workDate: existing?.current.workDate ?? today,
    jobId: existing?.jobId ?? (null as string | null),
    reference: existing?.current.reference ?? '',
    calculation: existing?.current.rule.calculation ?? ('fixed' as const),
    quantity: existing ? quantityInput(existing.current.quantityMilli) : '1',
    evidence: existing?.current.evidence ?? '',
    reason: '',
    allocations:
      existing?.current.allocations.map((a) => ({
        userId: a.userId,
        amount: salaryAmountInput(a.amountMinor),
      })) ?? ([] as Array<{ userId: string; amount: string }>),
  }))
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: schema },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('#award-pool-form [aria-invalid="true"]')
          ?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      const parsed = awardPoolFormSchema.parse(value)
      let total: number
      try {
        if (!rate?.rule) throw new Error('ხელახლა აირჩიეთ წესი.')
        total = proposedAwardAmount(
          rate.rule.amountMinor,
          quantityToMilli(parsed.quantity),
          rate.rule.calculation,
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'ფონდის თანხა არასწორია.')
        return
      }
      const allocations = parsed.allocations.map((a) => ({
        userId: a.userId,
        amountMinor: salaryToMinor(a.amount),
      }))
      if (allocations.reduce((sum, a) => sum + a.amountMinor, 0) !== total) {
        setError('წილების ჯამი ფონდის თანხას ზუსტად უნდა უდრიდეს.')
        return
      }
      try {
        const {
          quantity,
          calculation: _calculation,
          allocations: _allocations,
          ...data
        } = parsed
        const result = await mutation.mutateAsync({
          data: {
            ...data,
            ...target,
            requestId,
            expectedRuleVersion: rate.rule.version,
            quantityMilli: quantityToMilli(quantity),
            allocations,
          },
        })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success('საერთო ფონდი შენახულია.')
        void client.invalidateQueries({ queryKey: awardKey(actorId) })
        onClose()
        onSaved?.(result.value.poolId)
      } catch {
        const message =
          'ფონდი ვერ შეინახა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
  return (
    // Keep the selected snapshot referentially stable while field metadata changes.
    <form.Subscribe selector={(s) => s.values}>
      {(values) => {
        const pending = mutation.isPending
        let total: number | null = null
        try {
          if (rate?.rule)
            total = proposedAwardAmount(
              rate.rule.amountMinor,
              quantityToMilli(awardQuantitySchema.parse(values.quantity)),
              rate.rule.calculation,
            )
        } catch {}
        const sharesValid = values.allocations.every(
          (a) => salaryFormSchema.shape.amount.safeParse(a.amount).success,
        )
        const assigned = sharesValid
          ? values.allocations.reduce(
              (sum, a) => sum + salaryToMinor(a.amount),
              0,
            )
          : null
        return (
          <Sheet
            open={open}
            onOpenChange={(next) => {
              if (!next && !pending) onClose()
            }}
          >
            <SheetContent
              showCloseButton={false}
              className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
            >
              <SheetHeader className="shrink-0 border-b p-5 pr-16 sm:p-6 sm:pr-16">
                <SheetTitle>
                  {existing ? 'საერთო ფონდის ცვლილება' : 'ახალი საერთო ფონდი'}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  ერთი თანხის განაწილება ბენეფიციარებს შორის
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
                id="award-pool-form"
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
                        რაოდენობა საერთო ფონდის თანხას ერთხელ განსაზღვრავს. ეს
                        თანხა ბენეფიციარებს შორის ნაწილდება. დამტკიცებამდე
                        დარიცხვა არ ხდება.
                      </AlertDescription>
                    </Alert>
                    <FieldGroup>
                      <form.Field name="workDate">
                        {(field) => (
                          <Field
                            data-invalid={
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            }
                          >
                            <FieldLabel htmlFor="pool-date">
                              შესრულების თარიღი{' '}
                              <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <DatePicker
                              id="pool-date"
                              required
                              value={field.state.value}
                              today={today}
                              invalid={
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid
                              }
                              onBlur={field.handleBlur}
                              onChange={(v) => {
                                field.handleChange(v)
                                setRate(null)
                                form.setFieldValue('ruleId', '')
                                if (!existing) {
                                  setJob(null)
                                  form.setFieldValue('jobId', null)
                                }
                              }}
                            />
                            <FieldError
                              id="pool-date-error"
                              errors={field.state.meta.errors}
                            />
                          </Field>
                        )}
                      </form.Field>
                      <form.Field name="ruleId">
                        {(field) => (
                          <Field
                            data-invalid={
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            }
                          >
                            <FieldLabel htmlFor="pool-rule">
                              წახალისების წესი <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <AwardInputPicker
                              id="pool-rule"
                              actorId={actorId}
                              kind="rule"
                              value={rate}
                              workDate={values.workDate}
                              userId={null}
                              ruleId={existing?.ruleId ?? null}
                              invalid={
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid
                              }
                              onChange={(item) => {
                                setRate(item)
                                field.handleChange(item.id)
                                form.setFieldValue(
                                  'calculation',
                                  item.rule!.calculation,
                                )
                                if (
                                  ['job', 'fixed'].includes(
                                    item.rule!.calculation,
                                  )
                                )
                                  form.setFieldValue('quantity', '1')
                                if (!existing) {
                                  setJob(null)
                                  form.setFieldValue('jobId', null)
                                  form.setFieldValue('reference', '')
                                }
                              }}
                            />
                            <FieldError
                              id="pool-rule-error"
                              errors={field.state.meta.errors}
                            />
                          </Field>
                        )}
                      </form.Field>
                      {rate?.rule ? (
                        <Card>
                          <CardHeader>
                            <CardTitle>{rate.rule.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-2">
                            <p className="font-medium tabular-nums">
                              {formatSalary(rate.rule)} ·{' '}
                              {bonusUnitLabel(rate.rule)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {salaryBasisLabels[rate.rule.amountBasis]} ·
                              ვერსია {rate.rule.version}
                            </p>
                            <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                              {rate.rule.qualification}
                            </p>
                          </CardContent>
                        </Card>
                      ) : null}
                      <form.Field name="quantity">
                        {(field) => (
                          <Field
                            data-invalid={
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            }
                          >
                            <FieldLabel htmlFor="pool-quantity">
                              საერთო მიღებული რაოდენობა{' '}
                              <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <Input
                              id="pool-quantity"
                              required
                              inputMode="decimal"
                              autoComplete="off"
                              maxLength={10}
                              value={field.state.value}
                              readOnly={
                                rate?.rule?.calculation === 'job' ||
                                rate?.rule?.calculation === 'fixed'
                              }
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                              onBlur={field.handleBlur}
                              aria-invalid={
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid
                              }
                              aria-describedby={
                                !field.state.meta.isValid
                                  ? 'pool-quantity-error'
                                  : undefined
                              }
                            />
                            <FieldError
                              id="pool-quantity-error"
                              errors={field.state.meta.errors}
                            />
                          </Field>
                        )}
                      </form.Field>
                      <form.Field name="allocations" mode="array">
                        {(field) => (
                          <Field
                            data-invalid={
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            }
                          >
                            <FieldLabel htmlFor="pool-person">
                              ბენეფიციარები და წილები{' '}
                              <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <AwardInputPicker
                              id="pool-person"
                              actorId={actorId}
                              kind="employee"
                              value={null}
                              workDate={values.workDate}
                              userId={null}
                              disabled={
                                pending || values.allocations.length >= 20
                              }
                              invalid={
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid
                              }
                              onChange={(item) => {
                                if (
                                  values.allocations.some(
                                    (a) => a.userId === item.id,
                                  )
                                ) {
                                  setError('ეს თანამშრომელი უკვე დამატებულია.')
                                  return
                                }
                                setError('')
                                setNames((previous) => ({
                                  ...previous,
                                  [item.id]: item.label,
                                }))
                                field.pushValue({ userId: item.id, amount: '' })
                                if (!existing) {
                                  setJob(null)
                                  form.setFieldValue('jobId', null)
                                }
                              }}
                            />
                            <p className="text-sm text-muted-foreground">
                              აირჩიეთ 2-დან 20-მდე თანამშრომელი. სამუშაოს
                              ბონუსისთვის ყველა ბენეფიციარი შემსრულებლად უნდა
                              ფიქსირდებოდეს.
                            </p>
                            {values.allocations.length ? (
                              <div className="min-w-0 overflow-hidden rounded-xl border">
                                <PoolAllocationTable
                                  rows={values.allocations.map((a) => ({
                                    userId: a.userId,
                                    name: names[a.userId] ?? a.userId,
                                    amountMinor: 0,
                                  }))}
                                  renderAmount={(_row, index) => (
                                    <form.Field
                                      name={`allocations[${index}].amount`}
                                    >
                                      {(share) => {
                                        const invalid =
                                          share.state.meta.isTouched &&
                                          !share.state.meta.isValid
                                        return (
                                          <Field
                                            className="min-w-28"
                                            data-invalid={invalid}
                                          >
                                            <FieldLabel
                                              className="sr-only"
                                              htmlFor={`pool-share-${index}`}
                                            >
                                              {
                                                names[
                                                  values.allocations[index]
                                                    .userId
                                                ]
                                              }{' '}
                                              თანხა ლარში
                                            </FieldLabel>
                                            <Input
                                              id={`pool-share-${index}`}
                                              required
                                              inputMode="decimal"
                                              autoComplete="off"
                                              value={share.state.value}
                                              onChange={(e) =>
                                                share.handleChange(
                                                  e.target.value,
                                                )
                                              }
                                              onBlur={share.handleBlur}
                                              maxLength={10}
                                              aria-invalid={invalid}
                                              aria-describedby={
                                                invalid
                                                  ? `pool-share-${index}-error`
                                                  : undefined
                                              }
                                            />
                                            <FieldError
                                              id={`pool-share-${index}-error`}
                                              errors={share.state.meta.errors}
                                            />
                                          </Field>
                                        )
                                      }}
                                    </form.Field>
                                  )}
                                  renderAction={(_row, index) => (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`${names[values.allocations[index].userId]} წაშლა`}
                                      onClick={() => {
                                        field.removeValue(index)
                                        if (!existing) {
                                          setJob(null)
                                          form.setFieldValue('jobId', null)
                                        }
                                      }}
                                    >
                                      <IconTrash aria-hidden="true" />
                                    </Button>
                                  )}
                                />
                              </div>
                            ) : null}
                            <FieldError
                              id="pool-person-error"
                              errors={field.state.meta.errors}
                            />
                            <Button
                              variant="outline"
                              className="self-start"
                              disabled={
                                total === null ||
                                values.allocations.length < 2 ||
                                total < values.allocations.length
                              }
                              onClick={() => {
                                if (total !== null)
                                  form.setFieldValue(
                                    'allocations',
                                    equalAwardShares(
                                      total,
                                      values.allocations.map((a) => a.userId),
                                    ).map((a) => ({
                                      userId: a.userId,
                                      amount: salaryAmountInput(a.amountMinor),
                                    })),
                                  )
                              }}
                            >
                              თანაბრად განაწილება
                            </Button>
                          </Field>
                        )}
                      </form.Field>
                      {rate?.rule?.calculation === 'job' ? (
                        <form.Field name="jobId">
                          {(field) => (
                            <Field
                              data-invalid={
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid
                              }
                            >
                              <FieldLabel htmlFor="pool-job">
                                დასრულებული სამუშაო{' '}
                                <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <AwardInputPicker
                                id="pool-job"
                                actorId={actorId}
                                kind="job"
                                value={job}
                                workDate={values.workDate}
                                userId={values.allocations[0]?.userId ?? null}
                                disabled={
                                  !!existing || !values.allocations.length
                                }
                                invalid={
                                  field.state.meta.isTouched &&
                                  !field.state.meta.isValid
                                }
                                onChange={(item) => {
                                  setJob(item)
                                  field.handleChange(item.id)
                                  form.setFieldValue('reference', '')
                                }}
                              />
                              <FieldError
                                id="pool-job-error"
                                errors={field.state.meta.errors}
                              />
                            </Field>
                          )}
                        </form.Field>
                      ) : (
                        <form.Field name="reference">
                          {(field) => (
                            <Field
                              data-invalid={
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid
                              }
                            >
                              <FieldLabel htmlFor="pool-reference">
                                წყაროს ნომერი <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <Input
                                id="pool-reference"
                                required
                                maxLength={160}
                                disabled={!!existing}
                                value={field.state.value}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                                onBlur={field.handleBlur}
                                aria-invalid={
                                  field.state.meta.isTouched &&
                                  !field.state.meta.isValid
                                }
                                aria-describedby={
                                  !field.state.meta.isValid
                                    ? 'pool-reference-error'
                                    : undefined
                                }
                              />
                              <FieldError
                                id="pool-reference-error"
                                errors={field.state.meta.errors}
                              />
                            </Field>
                          )}
                        </form.Field>
                      )}
                      {(['evidence', 'reason'] as const).map((name) => (
                        <form.Field key={name} name={name}>
                          {(field) => (
                            <Field
                              data-invalid={
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid
                              }
                            >
                              <FieldLabel htmlFor={`pool-${name}`}>
                                {name === 'evidence'
                                  ? 'შესრულების მტკიცებულება'
                                  : 'ცვლილების საფუძველი'}{' '}
                                <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <Textarea
                                id={`pool-${name}`}
                                required
                                rows={3}
                                maxLength={name === 'evidence' ? 1000 : 500}
                                value={field.state.value}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                                onBlur={field.handleBlur}
                                aria-invalid={
                                  field.state.meta.isTouched &&
                                  !field.state.meta.isValid
                                }
                                aria-describedby={
                                  !field.state.meta.isValid
                                    ? `pool-${name}-error`
                                    : undefined
                                }
                              />
                              <FieldError
                                id={`pool-${name}-error`}
                                errors={field.state.meta.errors}
                              />
                            </Field>
                          )}
                        </form.Field>
                      ))}
                    </FieldGroup>
                    <Card>
                      <CardContent className="flex flex-col gap-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="text-sm text-muted-foreground">
                            საერთო ფონდი
                          </span>
                          <span className="text-xl font-semibold tabular-nums">
                            {total === null
                              ? 'აირჩიეთ წესი'
                              : formatSalary({ amountMinor: total })}
                          </span>
                        </div>
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">
                            განაწილებულია
                          </span>
                          <span className="tabular-nums">
                            {assigned === null
                              ? 'შეავსეთ წილები'
                              : formatSalary({ amountMinor: assigned })}
                          </span>
                        </div>
                        {total !== null &&
                        assigned !== null &&
                        total !== assigned ? (
                          <p className="text-sm text-destructive">
                            {assigned > total
                              ? 'წილები აჭარბებს ფონდს'
                              : 'გასანაწილებელი ნაშთი'}
                            :{' '}
                            {formatSalary({
                              amountMinor: Math.abs(total - assigned),
                            })}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
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
                    <Button
                      type="submit"
                      disabled={pending}
                      aria-busy={pending}
                    >
                      <span
                        className="flex size-4 items-center justify-center"
                        aria-hidden="true"
                      >
                        {pending ? <Spinner /> : <IconDeviceFloppy />}
                      </span>
                      ფონდის შენახვა
                    </Button>
                  </SheetFooter>
                </fieldset>
              </form>
            </SheetContent>
          </Sheet>
        )
      }}
    </form.Subscribe>
  )
}
