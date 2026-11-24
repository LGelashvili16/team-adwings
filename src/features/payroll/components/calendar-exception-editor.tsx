import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconDeviceFloppy, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import { Spinner } from '#/components/ui/spinner'
import { formatGeorgianDate } from '#/lib/date-format'
import {
  calendarExceptionFormSchema,
  calendarKindSchema,
} from '../payroll-calendar.schemas'
import { calendarKindLabels } from '../payroll-calendar.presentation'
import { updateCalendarException } from '../payroll-calendar.functions'
import { calendarKey } from '../payroll-calendar.queries'
import type { PayrollCalendarDay } from '../payroll-calendar.types'

export type CalendarDraft = {
  key: number
  revision: number
  userId: string | null
  scopeName: string
  day: PayrollCalendarDay
}
export function CalendarExceptionEditor({
  draft,
  actorId,
  open,
  onClose,
}: {
  draft: CalendarDraft
  actorId: string
  open: boolean
  onClose: () => void
}) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const [initial] = useState(() => {
    const current = draft.userId
      ? draft.day.employeeException
      : draft.day.companyException
    return {
      kind: current?.kind ?? 'day_off',
      start: current?.hours?.start ?? draft.day.hours?.start ?? '09:00',
      end: current?.hours?.end ?? draft.day.hours?.end ?? '18:00',
      reason: '',
    }
  })
  const current = draft.userId
    ? draft.day.employeeException
    : draft.day.companyException
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof updateCalendarException>[0]) =>
      updateCalendarException(input),
    retry: false,
  })
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: calendarExceptionFormSchema },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            '#calendar-exception-form [aria-invalid="true"]',
          )
          ?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await mutation.mutateAsync({
          data: {
            userId: draft.userId,
            date: draft.day.date,
            kind: value.kind,
            hours:
              value.kind === 'working'
                ? { start: value.start, end: value.end }
                : null,
            reason: value.reason,
            expectedRevision: draft.revision,
          },
        })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success('კალენდრის გამონაკლისი შენახულია.')
        void client.invalidateQueries({ queryKey: calendarKey(actorId) })
        onClose()
      } catch {
        const message =
          'გამონაკლისი ვერ შეინახა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
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
              <SheetTitle>კალენდრის გამონაკლისი</SheetTitle>
              <SheetDescription className="sr-only">
                {draft.scopeName}: {formatGeorgianDate(draft.day.date)}
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
              id="calendar-exception-form"
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
                <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="wrap-anywhere">
                        {draft.scopeName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                      {formatGeorgianDate(draft.day.date)}
                    </CardContent>
                  </Card>
                  {draft.day.statutoryHoliday ? (
                    <Alert variant="warning">
                      <AlertDescription>
                        ეს თარიღი კანონით უქმეა. სამუშაო დღედ მითითება უქმის
                        სტატუსს არ აუქმებს და ანაზღაურების ცალკე განხილვას
                        მოითხოვს.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {!draft.day.legalCalendarKnown ? (
                    <Alert variant="warning">
                      <AlertDescription>
                        ამ ისტორიული წლის სამართლებრივი კალენდარი დაუზუსტებელია.
                        გამონაკლისი სამართლებრივი წესების დადასტურებას ვერ
                        ჩაანაცვლებს.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {draft.day.legalCalendarKnown &&
                  (draft.day.kind === 'unknown_history' ||
                    draft.day.kind === 'unconfigured') ? (
                    <Alert variant="warning">
                      <AlertDescription>
                        განრიგი დაუზუსტებელია. გამონაკლისი შეინახება, მაგრამ
                        ისტორიის დაზუსტებამდე გამოთვლის საფუძველს ვერ შექმნის.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <Card>
                    <CardHeader>
                      <CardTitle>დღის წესი</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <form.Field name="kind">
                          {(field) => (
                            <Field>
                              <FieldLabel htmlFor="calendar-exception-kind">
                                წესი <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <Select
                                value={field.state.value}
                                onValueChange={(value) => {
                                  const parsed =
                                    calendarKindSchema.safeParse(value)
                                  if (parsed.success)
                                    field.handleChange(parsed.data)
                                }}
                              >
                                <SelectTrigger
                                  id="calendar-exception-kind"
                                  className="w-full"
                                  aria-description="სავალდებულო ველი"
                                >
                                  <SelectValue>
                                    {calendarKindLabels[field.state.value]}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {calendarKindSchema.options.map((kind) => (
                                      <SelectItem
                                        key={kind}
                                        value={kind}
                                        disabled={
                                          kind === 'inherit' &&
                                          (!current ||
                                            current.kind === 'inherit')
                                        }
                                      >
                                        {calendarKindLabels[kind]}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </Field>
                          )}
                        </form.Field>
                        <form.Subscribe selector={(state) => state.values.kind}>
                          {(kind) =>
                            kind === 'working' ? (
                              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                                {(['start', 'end'] as const).map((name) => (
                                  <form.Field key={name} name={name}>
                                    {(field) => {
                                      const invalid =
                                        field.state.meta.isTouched &&
                                        !field.state.meta.isValid
                                      return (
                                        <Field data-invalid={invalid}>
                                          <FieldLabel
                                            htmlFor={`calendar-exception-${name}`}
                                          >
                                            {name === 'start'
                                              ? 'დაწყების დრო'
                                              : 'დასრულების დრო'}{' '}
                                            <span aria-hidden="true">*</span>
                                          </FieldLabel>
                                          <Input
                                            id={`calendar-exception-${name}`}
                                            type="time"
                                            step={60}
                                            required
                                            value={field.state.value}
                                            onChange={(event) =>
                                              field.handleChange(
                                                event.target.value,
                                              )
                                            }
                                            onBlur={field.handleBlur}
                                            aria-invalid={invalid}
                                            aria-describedby={
                                              invalid
                                                ? `calendar-exception-${name}-error`
                                                : undefined
                                            }
                                          />
                                          <FieldError
                                            id={`calendar-exception-${name}-error`}
                                            errors={
                                              invalid
                                                ? field.state.meta.errors
                                                : []
                                            }
                                          />
                                        </Field>
                                      )
                                    }}
                                  </form.Field>
                                ))}
                              </FieldGroup>
                            ) : null
                          }
                        </form.Subscribe>
                        <form.Field name="reason">
                          {(field) => {
                            const invalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            return (
                              <Field data-invalid={invalid}>
                                <FieldLabel htmlFor="calendar-exception-reason">
                                  ცვლილების საფუძველი{' '}
                                  <span aria-hidden="true">*</span>
                                </FieldLabel>
                                <Textarea
                                  id="calendar-exception-reason"
                                  required
                                  maxLength={500}
                                  value={field.state.value}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                  onBlur={field.handleBlur}
                                  aria-invalid={invalid}
                                  aria-describedby={
                                    invalid
                                      ? 'calendar-exception-reason-error'
                                      : undefined
                                  }
                                />
                                <FieldError
                                  id="calendar-exception-reason-error"
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
                    ინახება სახელფასო კალენდრის ახალი ვერსია. გადატანილი სამუშაო
                    და დასვენების თარიღები მიუთითეთ ცალ-ცალკე და აღწერეთ
                    საფუძველი. დასწრების ჩანაწერები და შვებულების ბალანსები არ
                    იცვლება.
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
