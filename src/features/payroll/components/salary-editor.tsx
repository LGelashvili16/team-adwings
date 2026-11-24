import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconDeviceFloppy, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { DatePicker } from '#/components/common/date-picker'
import { Button } from '#/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '#/components/ui/sheet'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Spinner } from '#/components/ui/spinner'
import {
  salaryAmountInput,
  salaryBasisSchema,
  salaryFormSchema,
  salaryKindSchema,
  salaryToMinor,
} from '../salary.schemas'
import { salaryBasisLabels, salaryKindLabels } from '../salary.presentation'
import { setSalaryTerms } from '../salary.functions'
import { salaryKey } from '../salary.queries'
import type { SalaryEmployee } from '../salary.types'

export function SalaryEditor({
  actorId,
  targets,
  today,
  open,
  onClose,
  onSaved,
  defaultAmountBasis = 'gross',
}: {
  actorId: string
  targets: SalaryEmployee[]
  today: string
  open: boolean
  onClose: () => void
  onSaved?: () => void
  defaultAmountBasis?: 'gross' | 'net'
}) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const [initial] = useState(() => {
    const existing =
      targets.length === 1 ? (targets[0].current ?? targets[0].next) : null
    return {
      kind: existing?.kind ?? ('monthly' as const),
      amountBasis: existing?.amountBasis ?? defaultAmountBasis,
      amount: existing ? salaryAmountInput(existing.amountMinor) : '',
      effectiveFrom: today,
      reason: '',
    }
  })
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof setSalaryTerms>[0]) =>
      setSalaryTerms(input),
    retry: false,
  })
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: salaryFormSchema },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('#salary-form [aria-invalid="true"]')
          ?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const parsed = salaryFormSchema.parse(value)
        const result = await mutation.mutateAsync({
          data: {
            targets: targets.map((item) => ({
              userId: item.userId,
              expectedVersion: item.version,
            })),
            effectiveFrom: parsed.effectiveFrom,
            kind: parsed.kind,
            amountBasis: parsed.amountBasis,
            amountMinor: salaryToMinor(parsed.amount),
            currency: 'GEL',
            reason: parsed.reason,
          },
        })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success(
          targets.length === 1
            ? 'ხელფასი შენახულია.'
            : `${result.value.saved} თანამშრომლის ხელფასი შენახულია.`,
        )
        void client.invalidateQueries({ queryKey: salaryKey(actorId) })
        onSaved?.()
        onClose()
      } catch {
        const message =
          'ხელფასი ვერ შეინახა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(pending) => (
        <Sheet
          open={open}
          onOpenChange={(next) => {
            if (!next && !pending) onClose()
          }}
        >
          <SheetContent
            className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
            showCloseButton={false}
          >
            <SheetHeader className="shrink-0 border-b p-5 pr-16 sm:p-6 sm:pr-16">
              <SheetTitle>ხელფასის განსაზღვრა</SheetTitle>
              <SheetDescription className="sr-only">
                ახალი შეთანხმება {targets.length} თანამშრომლისთვის
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
              id="salary-form"
              className="flex min-h-0 flex-1 flex-col"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit()
              }}
            >
              <fieldset
                disabled={pending}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>თანამშრომლები ({targets.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto text-sm">
                        {targets.map((target) => (
                          <li key={target.userId} className="wrap-anywhere">
                            {target.name}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                  {targets.some((target) => target.next) ? (
                    <Alert variant="warning">
                      <AlertDescription>
                        არსებული მომავალი ცვლილებები შენარჩუნდება. იმავე თარიღზე
                        ახალი ვერსია წინა შეთანხმებას ჩაანაცვლებს.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <Card>
                    <CardHeader>
                      <CardTitle>ანაზღაურების პირობები</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <form.Field name="kind">
                          {(field) => (
                            <Field>
                              <FieldLabel htmlFor="salary-kind">
                                ხელფასის ტიპი <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <Select
                                value={field.state.value}
                                onValueChange={(value) => {
                                  const parsed =
                                    salaryKindSchema.safeParse(value)
                                  if (parsed.success)
                                    field.handleChange(parsed.data)
                                }}
                              >
                                <SelectTrigger
                                  id="salary-kind"
                                  aria-description="სავალდებულო ველი"
                                  className="w-full"
                                >
                                  <SelectValue>
                                    {salaryKindLabels[field.state.value]}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {salaryKindSchema.options.map((value) => (
                                      <SelectItem key={value} value={value}>
                                        {salaryKindLabels[value]}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </Field>
                          )}
                        </form.Field>
                        <form.Field name="amount">
                          {(field) => {
                            const invalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            return (
                              <Field data-invalid={invalid}>
                                <FieldLabel htmlFor="salary-amount">
                                  თანხა ლარში <span aria-hidden="true">*</span>
                                </FieldLabel>
                                <Input
                                  id="salary-amount"
                                  name={field.name}
                                  required
                                  inputMode="decimal"
                                  maxLength={10}
                                  autoComplete="off"
                                  value={field.state.value}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                  onBlur={field.handleBlur}
                                  aria-invalid={invalid}
                                  aria-describedby={
                                    invalid ? 'salary-amount-error' : undefined
                                  }
                                />
                                <FieldError
                                  id="salary-amount-error"
                                  errors={
                                    invalid ? field.state.meta.errors : []
                                  }
                                />
                              </Field>
                            )
                          }}
                        </form.Field>
                        <form.Field name="amountBasis">
                          {(field) => (
                            <Field>
                              <FieldLabel htmlFor="salary-basis">
                                თანხის საფუძველი{' '}
                                <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <Select
                                value={field.state.value}
                                onValueChange={(value) => {
                                  const parsed =
                                    salaryBasisSchema.safeParse(value)
                                  if (parsed.success)
                                    field.handleChange(parsed.data)
                                }}
                              >
                                <SelectTrigger
                                  id="salary-basis"
                                  aria-description="სავალდებულო ველი"
                                  className="w-full"
                                >
                                  <SelectValue>
                                    {salaryBasisLabels[field.state.value]}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {salaryBasisSchema.options.map((value) => (
                                      <SelectItem key={value} value={value}>
                                        {salaryBasisLabels[value]}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                              <FieldDescription>
                                დარიცხული თანხა დაქვითვებამდეა. ხელზე ასაღები
                                თანხა ხელშეკრულებით შეთანხმებული ოდენობაა.
                              </FieldDescription>
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
                                <FieldLabel htmlFor="salary-date">
                                  ამოქმედების თარიღი{' '}
                                  <span aria-hidden="true">*</span>
                                </FieldLabel>
                                <DatePicker
                                  id="salary-date"
                                  value={field.state.value}
                                  today={today}
                                  required
                                  invalid={invalid}
                                  onChange={field.handleChange}
                                  onBlur={field.handleBlur}
                                />
                                <FieldError
                                  id="salary-date-error"
                                  errors={
                                    invalid ? field.state.meta.errors : []
                                  }
                                />
                              </Field>
                            )
                          }}
                        </form.Field>
                        <form.Field name="reason">
                          {(field) => {
                            const invalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            return (
                              <Field data-invalid={invalid}>
                                <FieldLabel htmlFor="salary-reason">
                                  ცვლილების მიზეზი{' '}
                                  <span aria-hidden="true">*</span>
                                </FieldLabel>
                                <Textarea
                                  id="salary-reason"
                                  name={field.name}
                                  required
                                  maxLength={500}
                                  value={field.state.value}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                  onBlur={field.handleBlur}
                                  aria-invalid={invalid}
                                  aria-describedby={
                                    invalid ? 'salary-reason-error' : undefined
                                  }
                                />
                                <FieldError
                                  id="salary-reason-error"
                                  errors={
                                    invalid ? field.state.meta.errors : []
                                  }
                                />
                              </Field>
                            )
                          }}
                        </form.Field>
                      </FieldGroup>
                    </CardContent>
                  </Card>
                  <p className="text-sm leading-6 text-muted-foreground">
                    შეინახება ახალი შეთანხმება. წინა ვერსიები დარჩება ისტორიაში.
                    ეს მოქმედება თანხას არ რიცხავს და არ იხდის.
                  </p>
                  {error ? (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}
                </div>
                <SheetFooter className="shrink-0 border-t p-5 sm:flex-row sm:justify-end sm:p-6">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={onClose}
                  >
                    გაუქმება
                  </Button>
                  <Button type="submit" disabled={pending} aria-busy={pending}>
                    <span className="flex size-4 items-center justify-center">
                      {pending ? (
                        <Spinner aria-hidden="true" />
                      ) : (
                        <IconDeviceFloppy aria-hidden="true" />
                      )}
                    </span>
                    შენახვა
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
