import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Switch } from '#/components/ui/switch'
import { dayOffSettingsQuery } from '#/features/leave/day-off-allowance.queries'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { IconUserPlus } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { DatePicker } from '#/components/common/date-picker'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { createEmployeeAccount } from '../access.functions'
import {
  employeeRoleSchema,
  provisionableRoleSchema,
  provisionAccountSchema,
} from '../access.schemas'
import { EmployeeScheduleField } from './employee-schedule-field'
import { RecurringWorkLocationFields } from './employee-work-location-fields'
import { AccountRoleFields } from './account-authorization-fields'
import type { z } from 'zod'
import type { IssuedAccountCode } from '../access.types'

const defaults: z.input<typeof provisionAccountSchema> = {
  name: '',
  contactEmail: '',
  roles: ['employee'],
  jobTitle: '',
  phone: '',
  workingWeek: null,
  dayOffAllowance: null,
}
const textFields = [
  {
    name: 'name',
    label: 'სახელი და გვარი',
    required: true,
    autoComplete: 'name',
  },
  {
    name: 'jobTitle',
    label: 'თანამდებობა',
    required: false,
    autoComplete: 'organization-title',
  },
  {
    name: 'contactEmail',
    label: 'ელფოსტა',
    required: false,
    autoComplete: 'email',
  },
  {
    name: 'phone',
    label: 'ტელეფონის ნომერი',
    required: false,
    autoComplete: 'tel',
  },
] as const

export function ProvisionAccountForm({
  onCode,
  canAssignAdmin = false,
  canConfigureSchedule = false,
  canSetEmploymentDate = false,
  framed = true,
  onPendingChange,
}: {
  onCode: (value: IssuedAccountCode) => void
  canAssignAdmin?: boolean
  canConfigureSchedule?: boolean
  canSetEmploymentDate?: boolean
  framed?: boolean
  onPendingChange?: (pending: boolean) => void
}) {
  const availableRoles = canAssignAdmin
    ? provisionableRoleSchema.options
    : employeeRoleSchema.options
  const settings = useQuery(dayOffSettingsQuery())
  const client = useQueryClient()
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (data: z.input<typeof provisionAccountSchema>) =>
      createEmployeeAccount({ data }),
    retry: false,
    gcTime: 0,
  })
  const form = useForm({
    defaultValues: { ...defaults },
    validators: { onSubmit: provisionAccountSchema },
    onSubmit: async ({ value }) => {
      setError('')
      onPendingChange?.(true)
      try {
        const result = await mutation.mutateAsync(value)
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        onCode(result.value)
        form.reset()
        toast.success('თანამშრომლის ანგარიში შექმნილია.')
        await client.invalidateQueries({ queryKey: ['employee-accounts'] })
      } catch {
        const message =
          'ანგარიშის შექმნა ვერ მოხერხდა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      } finally {
        mutation.reset()
        onPendingChange?.(false)
      }
    },
  })
  const content = (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="gap-5">
        {textFields.map(({ name, label, required, autoComplete }) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor={`provision-${name}`}>
                  {label}
                  {required ? (
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  ) : null}
                </FieldLabel>
                <Input
                  id={`provision-${name}`}
                  name={name}
                  autoComplete={autoComplete}
                  type={
                    name === 'contactEmail'
                      ? 'email'
                      : name === 'phone'
                        ? 'tel'
                        : 'text'
                  }
                  required={required}
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby={`provision-${name}-error`}
                />
                <FieldError
                  id={`provision-${name}-error`}
                  errors={field.state.meta.errors}
                />
              </Field>
            )}
          </form.Field>
        ))}
        <form.Field name="roles">
          {(field) => (
            <AccountRoleFields
              collapsible
              options={availableRoles}
              value={field.state.value ?? ['employee']}
              onChange={field.handleChange}
              disabled={mutation.isPending}
              invalid={!field.state.meta.isValid}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        {canSetEmploymentDate ? (
          <form.Field name="employmentStartDate">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor="provision-employment-start-date">
                  მუშაობის დაწყების თარიღი
                </FieldLabel>
                <DatePicker
                  id="provision-employment-start-date"
                  value={field.state.value ?? ''}
                  invalid={!field.state.meta.isValid}
                  clearLabel="დაწყების თარიღის გასუფთავება"
                  onChange={(date) => field.handleChange(date || undefined)}
                  onBlur={field.handleBlur}
                />
                <FieldError
                  id="provision-employment-start-date-error"
                  errors={field.state.meta.errors}
                />
              </Field>
            )}
          </form.Field>
        ) : null}
        {canConfigureSchedule ? (
          <form.Field name="workingWeek">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <EmployeeScheduleField
                  value={field.state.value ?? null}
                  onChange={field.handleChange}
                  disabled={mutation.isPending}
                  renderWorkLocations={(week) => (
                    <form.Field name="remoteWeekdays">
                      {(locations) => (
                        <>
                          <RecurringWorkLocationFields
                            idPrefix="provision"
                            week={week}
                            value={locations.state.value ?? []}
                            onChange={locations.handleChange}
                            disabled={mutation.isPending}
                          />
                          <FieldError errors={locations.state.meta.errors} />
                        </>
                      )}
                    </form.Field>
                  )}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
        ) : null}
        <form.Field name="dayOffAllowance">
          {(field) => (
            <Card
              size="sm"
              className="border bg-transparent shadow-none ring-0"
            >
              <CardContent className="flex flex-col gap-4">
                <Field orientation="horizontal">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <FieldLabel htmlFor="inherit-day-offs">
                      კომპანიის დასვენების დღეების ლიმიტის გამოყენება
                    </FieldLabel>
                    {field.state.value == null ? (
                      <FieldDescription id="inherit-day-offs-description">
                        {settings.data
                          ? `საწყისი ბალანსი: ${settings.data.defaultDays} დღე`
                          : 'შექმნისას გამოიყენება კომპანიის მოქმედი ლიმიტი.'}
                      </FieldDescription>
                    ) : null}
                  </div>
                  <Switch
                    id="inherit-day-offs"
                    checked={field.state.value == null}
                    aria-describedby={
                      field.state.value == null
                        ? 'inherit-day-offs-description'
                        : undefined
                    }
                    onCheckedChange={(checked) =>
                      field.handleChange(
                        checked ? null : (settings.data?.defaultDays ?? 4),
                      )
                    }
                    disabled={mutation.isPending}
                  />
                </Field>
                {field.state.value != null ? (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <FieldLabel htmlFor="initial-day-offs">
                      დასვენების დღეების საწყისი ბალანსი
                    </FieldLabel>
                    <Input
                      id="initial-day-offs"
                      type="number"
                      min={0}
                      max={366}
                      value={
                        Number.isNaN(field.state.value) ? '' : field.state.value
                      }
                      disabled={mutation.isPending}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.value === ''
                            ? Number.NaN
                            : Number(event.target.value),
                        )
                      }
                      aria-invalid={!field.state.meta.isValid}
                      aria-describedby="initial-day-offs-error"
                    />
                    <FieldError
                      id="initial-day-offs-error"
                      errors={field.state.meta.errors}
                    />
                  </Field>
                ) : null}
              </CardContent>
            </Card>
          )}
        </form.Field>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(pending) => (
            <Button
              type="submit"
              className="h-10 w-full"
              disabled={pending}
              aria-busy={pending}
            >
              <span className="flex size-4 items-center justify-center">
                {pending ? (
                  <Spinner aria-hidden="true" />
                ) : (
                  <IconUserPlus className="size-4" aria-hidden="true" />
                )}
              </span>
              ანგარიშის შექმნა
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
  return framed ? (
    <Card className="rounded-2xl">
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <IconUserPlus className="size-5" aria-hidden="true" />
          </span>
          ახალი მომხმარებელი
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  ) : (
    content
  )
}
