import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  IconDeviceFloppy,
  IconX,
  IconAlertTriangle,
  IconAlertCircle,
  IconHistory,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { DatePicker } from '#/components/common/date-picker'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from '#/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
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
  SheetFooter,
} from '#/components/ui/sheet'
import { DraftSheet } from '#/components/common/draft-sheet'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Spinner } from '#/components/ui/spinner'
import { accountInitials } from '#/features/access/access.presentation'
import {
  salaryAmountInput,
  salaryFormSchema,
  salaryKindSchema,
  salaryToMinor,
} from '../salary.schemas'
import { salaryKindLabels } from '../salary.presentation'
import { setSalaryTerms } from '../salary.functions'
import { salaryKey } from '../salary.queries'
import { monthlyKey } from '../monthly.queries'
import type { SalaryEmployee } from '../salary.types'

export function SalaryEditor({
  actorId,
  targets,
  today,
  open,
  onClose,
}: {
  actorId: string
  targets: SalaryEmployee[]
  today: string
  open: boolean
  onClose: () => void
}) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const [initial] = useState(() => {
    const existing =
      targets.length === 1 ? (targets[0].current ?? targets[0].next) : null
    return {
      kind: existing?.kind ?? ('monthly' as const),
      amount:
        existing?.amountBasis === 'net'
          ? salaryAmountInput(existing.amountMinor)
          : '',
      effectiveFrom: today,
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
            amountMinor: salaryToMinor(parsed.amount),
            currency: 'GEL',
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
        void client.invalidateQueries({ queryKey: monthlyKey(actorId) })
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
        <DraftSheet
          open={open}
          onOpenChange={(next) => {
            if (!next && !pending) onClose()
          }}
        >
          <SheetContent
            className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
            showCloseButton={false}
          >
            <SheetHeader className="relative shrink-0 border-b p-4 pr-14 sm:p-6 sm:pr-16">
              <SheetTitle className="flex min-w-0 items-center gap-3 text-base sm:text-lg">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <IconWallet className="size-5" aria-hidden="true" />
                </span>
                ხელფასის განსაზღვრა
              </SheetTitle>
              <SheetDescription className="sr-only">
                ახალი შეთანხმება {targets.length} თანამშრომლისთვის
              </SheetDescription>
              <Button
                variant="ghost"
                size="icon"
                aria-label="დახურვა"
                className="absolute top-1/2 right-3 -translate-y-1/2 sm:right-4"
                type="button"
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
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
                  <Card className="shrink-0 gap-0 rounded-xl bg-muted/35">
                    {targets.length > 1 ? (
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <IconUsers
                            className="size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                          თანამშრომლები
                          <Badge variant="secondary" className="tabular-nums">
                            {targets.length}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                    ) : null}
                    <CardContent>
                      <ul
                        aria-label="თანამშრომლები"
                        className="flex max-h-40 flex-col gap-3 overflow-y-auto overscroll-contain text-sm"
                      >
                        {targets.map((target) => (
                          <li
                            key={target.userId}
                            className="flex min-w-0 items-center gap-3"
                          >
                            <Avatar
                              aria-hidden="true"
                              className="size-9 shrink-0 ring-1 ring-border"
                            >
                              <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                                {accountInitials(target.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 wrap-anywhere">
                              <p className="font-medium">{target.name}</p>
                              {target.jobTitle ? (
                                <p className="text-xs text-muted-foreground">
                                  {target.jobTitle}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                  {targets.some((target) => target.next) ? (
                    <Alert variant="warning" role="status">
                      <IconAlertTriangle aria-hidden="true" />
                      <AlertDescription>
                        არსებული მომავალი ცვლილებები შენარჩუნდება. იმავე თარიღზე
                        ახალი ვერსია წინა შეთანხმებას ჩაანაცვლებს.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <Card className="shrink-0 rounded-xl sm:[--card-spacing:--spacing(5)]">
                    <CardHeader className="border-b border-border/70">
                      <CardTitle>ანაზღაურების პირობები</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
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
                                  გასაცემი თანხა ლარში{' '}
                                  <span aria-hidden="true">*</span>
                                </FieldLabel>
                                <InputGroup>
                                  <InputGroupInput
                                    id="salary-amount"
                                    name={field.name}
                                    required
                                    inputMode="decimal"
                                    maxLength={10}
                                    autoComplete="off"
                                    value={field.state.value}
                                    className="min-w-0 font-medium tabular-nums"
                                    onChange={(event) =>
                                      field.handleChange(event.target.value)
                                    }
                                    onBlur={field.handleBlur}
                                    aria-invalid={invalid}
                                    aria-describedby={
                                      invalid
                                        ? 'salary-amount-error'
                                        : undefined
                                    }
                                  />
                                  <InputGroupAddon
                                    align="inline-end"
                                    aria-hidden="true"
                                  >
                                    <InputGroupText className="font-medium">
                                      ₾
                                    </InputGroupText>
                                  </InputGroupAddon>
                                </InputGroup>
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
                        <form.Field name="effectiveFrom">
                          {(field) => {
                            const invalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            return (
                              <Field
                                className="sm:col-span-2"
                                data-invalid={invalid}
                              >
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
                      </FieldGroup>
                    </CardContent>
                  </Card>
                  <Alert variant="info" role="status">
                    <IconHistory aria-hidden="true" />
                    <AlertDescription>
                      შეთანხმება ინახება ისტორიაში. დარიცხვა და გადახდა ცალკე
                      ხდება.
                    </AlertDescription>
                  </Alert>
                  {error ? (
                    <Alert variant="destructive">
                      <IconAlertCircle aria-hidden="true" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}
                </div>
                <SheetFooter className="shrink-0 flex-row gap-2 border-t bg-card p-4 sm:justify-end sm:px-6">
                  <Button
                    type="button"
                    variant="outline"
                    depth="raised"
                    className="flex-1 sm:flex-none"
                    disabled={pending}
                    onClick={onClose}
                  >
                    გაუქმება
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 sm:min-w-28 sm:flex-none"
                    disabled={pending}
                    aria-busy={pending}
                  >
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
        </DraftSheet>
      )}
    </form.Subscribe>
  )
}
