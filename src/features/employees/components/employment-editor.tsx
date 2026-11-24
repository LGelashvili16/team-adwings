import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  IconCalendarUser,
  IconDeviceFloppy,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { DatePicker } from '#/components/common/date-picker'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#/components/ui/field'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { Textarea } from '#/components/ui/textarea'
import { employmentFormSchema } from '../employment.schemas'
import {
  discardEmployeeEmployment,
  updateEmployeeEmployment,
} from '../employment.functions'
import { EmploymentDates } from './employment-periods-table'
import type { EmploymentPeriod } from '../employment.types'

export type EmploymentDraft = {
  key: number
  revision: number
  mode: 'create' | 'edit' | 'void'
  period: EmploymentPeriod | null
}

export function EmploymentEditor({
  open,
  draft,
  userId,
  name,
  today,
  onClose,
  onSaved,
}: {
  open: boolean
  draft: EmploymentDraft
  userId: string
  name: string
  today: string
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState('')
  const removing = draft.mode === 'void'
  const mutation = useMutation({
    mutationFn: async (value: {
      startDate: string
      endDate: string
      reason: string
    }) => {
      const common = {
        userId,
        expectedRevision: draft.revision,
        reason: value.reason,
      }
      return removing && draft.period
        ? discardEmployeeEmployment({
            data: { ...common, periodId: draft.period.id },
          })
        : updateEmployeeEmployment({
            data: {
              ...common,
              periodId: draft.period?.id ?? null,
              startDate: value.startDate,
              endDate: value.endDate || null,
            },
          })
    },
    retry: false,
  })
  const form = useForm({
    defaultValues: {
      startDate: draft.period?.startDate ?? '',
      endDate: draft.period?.endDate ?? '',
      reason: '',
    },
    validators: {
      onSubmit: employmentFormSchema,
    },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('#employment-form [aria-invalid="true"]')
          ?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await mutation.mutateAsync(value)
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success(
          removing ? 'პერიოდი გაუქმებულია.' : 'დასაქმების პერიოდი შენახულია.',
        )
        onSaved()
        onClose()
      } catch {
        const message =
          'პერიოდი ვერ შეინახა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
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
              <SheetTitle>
                {removing
                  ? 'პერიოდის გაუქმება'
                  : draft.mode === 'create'
                    ? 'დასაქმების პერიოდის დამატება'
                    : 'დასაქმების პერიოდის შეცვლა'}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {name}: დასაქმების თარიღების დადასტურება
              </SheetDescription>
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
            <form
              id="employment-form"
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
                <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                  <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background">
                      <IconCalendarUser
                        className="size-5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        თანამშრომელი
                      </p>
                      <p className="mt-1 font-medium wrap-anywhere">{name}</p>
                    </div>
                  </div>
                  {removing && draft.period ? (
                    <Alert variant="destructive">
                      <AlertDescription className="space-y-2">
                        <p>
                          ეს პერიოდი ხელფასის გამოთვლისას აღარ გამოიყენება.
                          ცვლილების ისტორია შენარჩუნდება.
                        </p>
                        <EmploymentDates period={draft.period} />
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {removing
                          ? 'გაუქმების საფუძველი'
                          : 'დადასტურებული თარიღები'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {!removing ? (
                        <>
                          <form.Field name="startDate">
                            {(field) => {
                              const invalid =
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid
                              return (
                                <Field data-invalid={invalid}>
                                  <FieldLabel htmlFor="employment-startDate">
                                    დაწყების თარიღი{' '}
                                    <span aria-hidden="true">*</span>
                                  </FieldLabel>
                                  <DatePicker
                                    id="employment-startDate"
                                    value={field.state.value}
                                    today={today}
                                    invalid={invalid}
                                    required
                                    onChange={field.handleChange}
                                    onBlur={field.handleBlur}
                                  />
                                  <FieldError
                                    id="employment-startDate-error"
                                    errors={
                                      invalid ? field.state.meta.errors : []
                                    }
                                  />
                                </Field>
                              )
                            }}
                          </form.Field>
                          <form.Field name="endDate">
                            {(field) => {
                              const invalid =
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid
                              return (
                                <Field data-invalid={invalid}>
                                  <FieldLabel htmlFor="employment-endDate">
                                    დასრულების თარიღი
                                  </FieldLabel>
                                  <DatePicker
                                    id="employment-endDate"
                                    value={field.state.value}
                                    today={today}
                                    invalid={invalid}
                                    onChange={field.handleChange}
                                    onBlur={field.handleBlur}
                                  />
                                  <FieldDescription>
                                    ცარიელი ველი ნიშნავს, რომ დასაქმება
                                    გრძელდება. დასრულების დღე პერიოდს მოიცავს.
                                  </FieldDescription>
                                  <FieldError
                                    id="employment-endDate-error"
                                    errors={
                                      invalid ? field.state.meta.errors : []
                                    }
                                  />
                                </Field>
                              )
                            }}
                          </form.Field>
                        </>
                      ) : null}
                      <form.Field name="reason">
                        {(field) => {
                          const invalid =
                            field.state.meta.isTouched &&
                            !field.state.meta.isValid
                          return (
                            <Field data-invalid={invalid}>
                              <FieldLabel htmlFor="employment-reason">
                                ცვლილების მიზეზი{' '}
                                <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <Textarea
                                id="employment-reason"
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
                                  invalid
                                    ? 'employment-reason-error'
                                    : undefined
                                }
                                className="min-h-28"
                              />
                              <FieldError
                                id="employment-reason-error"
                                errors={invalid ? field.state.meta.errors : []}
                              />
                            </Field>
                          )
                        }}
                      </form.Field>
                    </CardContent>
                  </Card>
                  <p className="text-sm leading-6 text-muted-foreground">
                    ეს თარიღები განსაზღვრავს ხელფასის დათვლის პერიოდს. ანგარიშის
                    წვდომა და თანამშრომლის სტატუსი ცალკე იმართება.
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
                  <Button
                    type="submit"
                    variant={removing ? 'destructive' : 'default'}
                    disabled={pending}
                    aria-busy={pending}
                  >
                    <span className="flex size-4 items-center justify-center">
                      {pending ? (
                        <Spinner aria-hidden="true" />
                      ) : removing ? (
                        <IconTrash aria-hidden="true" />
                      ) : (
                        <IconDeviceFloppy aria-hidden="true" />
                      )}
                    </span>
                    {removing ? 'პერიოდის გაუქმება' : 'შენახვა'}
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
