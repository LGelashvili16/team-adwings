import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconDeviceFloppy } from '@tabler/icons-react'
import { toast } from 'sonner'
import { ownScheduleOptions } from '#/features/scheduling/scheduling.queries'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { parseRoles, roleLabels } from '#/lib/authorization/permissions'
import { updateEmployeeDetails } from '../access.functions'
import {
  employeeDetailsSchema,
  employeeRoleSchema,
  provisionableRoleSchema,
  provisionableRolesSchema,
} from '../access.schemas'
import { EmployeeScheduleField } from './employee-schedule-field'
import {
  DatedWorkLocationField,
  RecurringWorkLocationFields,
} from './employee-work-location-fields'
import { AccountRoleFields } from './account-authorization-fields'
import type { z } from 'zod'
import type { EmployeeAccountRecord } from '../access.types'
import type { WorkLocationPlan } from '#/features/scheduling/scheduling.types'

const detailFields = [
  { name: 'name', label: 'სახელი და გვარი', autoComplete: 'off' },
  { name: 'code', label: 'მომხმარებლის სახელი', autoComplete: 'off' },
  { name: 'contactEmail', label: 'ელფოსტა', autoComplete: 'off' },
  { name: 'jobTitle', label: 'თანამდებობა', autoComplete: 'off' },
  { name: 'phone', label: 'ტელეფონის ნომერი', autoComplete: 'off' },
] as const

export function EmployeeDetailsSheet({
  open,
  target,
  editingSelf,
  canAssignAdmin = false,
  canConfigureSchedule,
  workLocations,
  onClose,
}: {
  open: boolean
  target: EmployeeAccountRecord
  editingSelf: boolean
  /** Assigning privileged administrator/accountant roles requires admin.access, users.manage, and roles.manage. */
  canAssignAdmin?: boolean
  /** Editing the working week additionally requires the attendance.configure permission. */
  canConfigureSchedule: boolean
  workLocations?: WorkLocationPlan
  onClose: () => void
}) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (data: z.input<typeof employeeDetailsSchema>) =>
      updateEmployeeDetails({ data }),
    retry: false,
    gcTime: 0,
  })
  const targetRoles = parseRoles(target.roles)
  const availableRoles = canAssignAdmin
    ? provisionableRoleSchema.options
    : employeeRoleSchema.options
  const parsedRoles = provisionableRolesSchema.safeParse(targetRoles)
  const editableRoles =
    !editingSelf &&
    parsedRoles.success &&
    parsedRoles.data.every((role) =>
      availableRoles.some((item) => item === role),
    )
      ? parsedRoles.data
      : undefined
  const defaultValues: z.input<typeof employeeDetailsSchema> = {
    userId: target.userId,
    code: target.code ?? '',
    roles: editableRoles,
    expectedRoles: editableRoles ? target.roles : undefined,
    name: target.name,
    contactEmail: target.contactEmail ?? '',
    jobTitle: target.jobTitle ?? '',
    phone: target.phone ?? '',
    // Undefined tells the server to leave the schedule untouched.
    workingWeek: canConfigureSchedule ? target.workingWeek : undefined,
    remoteWeekdays: canConfigureSchedule
      ? workLocations?.remoteWeekdays
      : undefined,
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: employeeDetailsSchema },
    onSubmit: async ({ value, formApi }) => {
      setError('')
      try {
        const {
          roles,
          expectedRoles,
          workingWeek,
          remoteWeekdays,
          workLocationOverride,
          ...profile
        } = value
        const scheduleChanged =
          workingWeek !== undefined &&
          formApi.getFieldMeta('workingWeek')?.isDefaultValue === false
        const weekdaysChanged =
          remoteWeekdays !== undefined &&
          formApi.getFieldMeta('remoteWeekdays')?.isDefaultValue === false
        const details = {
          ...profile,
          ...(scheduleChanged ? { workingWeek } : {}),
          ...(weekdaysChanged ? { remoteWeekdays } : {}),
          ...(workLocationOverride ? { workLocationOverride } : {}),
        }
        const originalRoles = parseRoles(expectedRoles ?? '')
        const rolesChanged =
          roles &&
          (roles.length !== originalRoles.length ||
            roles.some((role) => !originalRoles.includes(role)))
        const result = await mutation.mutateAsync(
          rolesChanged ? { ...details, roles, expectedRoles } : details,
        )
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        await client.invalidateQueries({ queryKey: ['employee-accounts'] })
        if (scheduleChanged || weekdaysChanged || workLocationOverride)
          await client.invalidateQueries({
            queryKey: ownScheduleOptions(target.userId).queryKey,
          })
        toast.success('თანამშრომლის მონაცემები განახლებულია.')
        onClose()
      } catch {
        const message =
          'მონაცემები ვერ შეინახა. გადაამოწმეთ თქვენი წვდომა და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      } finally {
        mutation.reset()
      }
    },
  })

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !form.state.isSubmitting) onClose()
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          form.reset()
          setError('')
        }
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={!mutation.isPending}
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="border-b">
          <SheetTitle>მონაცემების რედაქტირება</SheetTitle>
        </SheetHeader>
        <form
          noValidate
          className="min-h-0 flex-1 overflow-y-auto p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup className="gap-4">
            <SheetDescription>
              მომხმარებლის სახელის ან შესვლის ელფოსტის შეცვლა მაშინვე აისახება
              ანგარიშზე.
              {editingSelf
                ? null
                : ' სისტემაში წვდომის შეცვლისას მიმდინარე სესიები გაუქმდება.'}
            </SheetDescription>
            {detailFields.map(({ name, label, autoComplete }) => (
              <form.Field key={name} name={name}>
                {(field) => {
                  const required =
                    name === 'name' || (name === 'code' && Boolean(target.code))
                  return (
                    <Field data-invalid={!field.state.meta.isValid}>
                      <FieldLabel htmlFor={`details-${name}`}>
                        {label}
                        {required ? (
                          <span aria-hidden="true" className="text-destructive">
                            *
                          </span>
                        ) : null}
                      </FieldLabel>
                      <Input
                        id={`details-${name}`}
                        name={name}
                        type={name === 'contactEmail' ? 'email' : 'text'}
                        autoComplete={autoComplete}
                        autoCapitalize={name === 'code' ? 'none' : undefined}
                        spellCheck={name === 'code' ? false : undefined}
                        required={required}
                        disabled={mutation.isPending}
                        value={field.state.value ?? ''}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={!field.state.meta.isValid}
                        aria-describedby={`details-${name}-error`}
                      />
                      <FieldError
                        id={`details-${name}-error`}
                        errors={field.state.meta.errors}
                      />
                    </Field>
                  )
                }}
              </form.Field>
            ))}
            {editableRoles ? (
              <form.Field name="roles">
                {(field) => (
                  <AccountRoleFields
                    collapsible
                    options={availableRoles}
                    value={field.state.value ?? editableRoles}
                    onChange={field.handleChange}
                    disabled={mutation.isPending}
                    invalid={!field.state.meta.isValid}
                    errors={field.state.meta.errors}
                  />
                )}
              </form.Field>
            ) : editingSelf ? null : (
              <p className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                ამ ანგარიშის სისტემაში წვდომა წვდომის მართვის გვერდიდან
                იმართება.
                {targetRoles.length > 0 ? (
                  <>
                    {' '}
                    {targetRoles.map((role) => roleLabels[role]).join(', ')}.
                  </>
                ) : null}
              </p>
            )}
            {canConfigureSchedule ? (
              <form.Field name="workingWeek">
                {(field) => (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <EmployeeScheduleField
                      idPrefix="details"
                      value={field.state.value ?? null}
                      onChange={field.handleChange}
                      disabled={mutation.isPending}
                      renderWorkLocations={(week) => (
                        <form.Field name="remoteWeekdays">
                          {(locations) => (
                            <>
                              <RecurringWorkLocationFields
                                idPrefix="details"
                                week={week}
                                value={locations.state.value ?? []}
                                onChange={locations.handleChange}
                                disabled={mutation.isPending}
                              />
                              <FieldError
                                errors={locations.state.meta.errors}
                              />
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
            {canConfigureSchedule && workLocations ? (
              <form.Field name="workLocationOverride">
                {(field) => (
                  <>
                    <DatedWorkLocationField
                      plan={workLocations}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      disabled={mutation.isPending}
                      invalid={!field.state.meta.isValid}
                    />
                    <FieldError
                      id="work-location-date-error"
                      errors={field.state.meta.errors}
                    />
                  </>
                )}
              </form.Field>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <SheetFooter className="px-0 pb-0 sm:flex-row sm:justify-end">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(pending) => (
                  <>
                    <SheetClose
                      render={<Button variant="outline" disabled={pending} />}
                    >
                      გაუქმება
                    </SheetClose>
                    <Button
                      type="submit"
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
                  </>
                )}
              </form.Subscribe>
            </SheetFooter>
          </FieldGroup>
        </form>
      </SheetContent>
    </Sheet>
  )
}
