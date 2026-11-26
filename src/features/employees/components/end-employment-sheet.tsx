import { useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { IconDoorExit, IconInfoCircle } from '@tabler/icons-react'
import { toast } from 'sonner'
import { DatePicker } from '#/components/common/date-picker'
import { DraftSheet } from '#/components/common/draft-sheet'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { Textarea } from '#/components/ui/textarea'
import { endEmployeeEmployment } from '#/features/access/access.functions'
import { endEmploymentFormSchema } from '../employment.schemas'
import type { EmploymentPeriod } from '../employment.types'

export function EndEmploymentSheet({
  open,
  userId,
  name,
  today,
  revision,
  period,
  onClose,
  onSaved,
}: {
  open: boolean
  userId: string
  name: string
  today: string
  revision: number
  period: EmploymentPeriod | null
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState('')
  const form = useForm({
    defaultValues: {
      startDate: period?.startDate ?? '',
      endDate: period?.endDate ?? '',
      reason: '',
    },
    validators: {
      onSubmit: endEmploymentFormSchema.refine(
        (value) => Boolean(value.startDate),
        {
          path: ['startDate'],
          message: 'მიუთითეთ დასაქმების დაწყების თარიღი.',
        },
      ),
    },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            '#end-employment-form [aria-invalid="true"]',
          )
          ?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await endEmployeeEmployment({
          data: { ...value, userId, expectedRevision: revision },
        })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success(
          result.value.scheduled
            ? 'დასაქმების დასრულება დაიგეგმა.'
            : 'თანამშრომლის დასაქმება დასრულდა.',
        )
        onClose()
        onSaved()
      } catch {
        const message =
          'დასაქმება ვერ დასრულდა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
  const endDate = useStore(form.store, (state) => state.values.endDate)
  const future = endDate > today

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
            className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
            showCloseButton={!pending}
          >
            <SheetHeader className="shrink-0 border-b p-5 pr-14 sm:p-6 sm:pr-14">
              <SheetTitle>დასაქმების დასრულება</SheetTitle>
              <SheetDescription className="wrap-anywhere">
                {name}
              </SheetDescription>
            </SheetHeader>
            <form
              id="end-employment-form"
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
                  <Alert variant={future ? 'info' : 'warning'} role="note">
                    <IconInfoCircle aria-hidden="true" />
                    <AlertDescription>
                      {future
                        ? 'თანამშრომელს სისტემაში წვდომა ბოლო სამუშაო დღის მომდევნო დღეს, კომპანიის დროით 00:00-ზე შეუწყდება.'
                        : endDate
                          ? 'დადასტურებისთანავე თანამშრომელს შეუწყდება სისტემაში წვდომა.'
                          : 'შეგიძლიათ აირჩიოთ მომავალი თარიღი და წინასწარ დაგეგმოთ დასაქმების დასრულება.'}{' '}
                      ბოლო სამუშაო დღე დასაქმების პერიოდში ჩაითვლება. დასწრების,
                      შვებულებისა და ხელფასის ისტორია შენარჩუნდება.
                    </AlertDescription>
                  </Alert>
                  <FieldGroup>
                    {(!period
                      ? (['startDate', 'endDate'] as const)
                      : (['endDate'] as const)
                    ).map((fieldName) => (
                      <form.Field key={fieldName} name={fieldName}>
                        {(field) => {
                          const invalid = !field.state.meta.isValid
                          const id = `departure-${fieldName}`
                          return (
                            <Field data-invalid={invalid}>
                              <FieldLabel htmlFor={id}>
                                {fieldName === 'startDate'
                                  ? 'დასაქმების დაწყების თარიღი'
                                  : 'ბოლო სამუშაო დღე'}
                                <span aria-hidden="true">*</span>
                              </FieldLabel>
                              <DatePicker
                                id={id}
                                today={today}
                                value={field.state.value}
                                minimum={
                                  fieldName === 'endDate'
                                    ? period?.startDate
                                    : undefined
                                }
                                maximum={
                                  fieldName === 'startDate' ? today : undefined
                                }
                                required
                                invalid={invalid}
                                onChange={field.handleChange}
                                onBlur={field.handleBlur}
                              />
                              <FieldError
                                id={`${id}-error`}
                                errors={field.state.meta.errors}
                              />
                            </Field>
                          )
                        }}
                      </form.Field>
                    ))}
                    <form.Field name="reason">
                      {(field) => {
                        const invalid = !field.state.meta.isValid
                        return (
                          <Field data-invalid={invalid}>
                            <FieldLabel htmlFor="departure-reason">
                              დასრულების მიზეზი{' '}
                              <span aria-hidden="true">*</span>
                            </FieldLabel>
                            <Textarea
                              id="departure-reason"
                              value={field.state.value}
                              required
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              onBlur={field.handleBlur}
                              aria-invalid={invalid}
                              aria-describedby={
                                invalid ? 'departure-reason-error' : undefined
                              }
                            />
                            <FieldError
                              id="departure-reason-error"
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
                <SheetFooter className="shrink-0 border-t p-5 sm:flex-row sm:justify-end sm:p-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={pending}
                  >
                    გაუქმება
                  </Button>
                  <Button
                    type="submit"
                    variant={future ? 'default' : 'destructive'}
                    disabled={pending}
                    aria-busy={pending}
                  >
                    {pending ? (
                      <Spinner aria-hidden="true" />
                    ) : (
                      <IconDoorExit
                        data-icon="inline-start"
                        aria-hidden="true"
                      />
                    )}
                    {future ? 'დასრულების დაგეგმვა' : 'დასაქმების დასრულება'}
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
