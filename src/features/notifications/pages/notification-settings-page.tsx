import { useId } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '#/components/ui/card'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldSet,
  FieldLegend,
} from '#/components/ui/field'
import { Checkbox } from '#/components/ui/checkbox'
import { roleSchema, roleLabels } from '#/lib/authorization/permissions'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import { notificationSettingsSchema } from '../notification-settings.schemas'
import { updateNotificationSettings } from '../notification-settings.functions'
import {
  notificationSettingsKey,
  notificationSettingsQuery,
} from '../notification-settings.queries'
import type { z } from 'zod'

const route = getRouteApi('/_authenticated/admin/settings/notifications')

export function NotificationSettingsPage() {
  const { actor } = route.useRouteContext()
  const query = useQuery(notificationSettingsQuery(actor.id))
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        შეტყობინებების პარამეტრები
      </h1>
      <div className="w-full max-w-2xl">
        {query.isPending ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="პარამეტრები იტვირთება"
          >
            <Skeleton className="h-128 w-full sm:h-96" aria-hidden="true" />
          </div>
        ) : query.data ? (
          <NotificationSettingsForm actorId={actor.id} initial={query.data} />
        ) : (
          <Alert variant="destructive">
            <AlertDescription>
              პარამეტრები ვერ ჩაიტვირთა. განაახლეთ გვერდი და სცადეთ ხელახლა.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}

function NotificationSettingsForm({
  actorId,
  initial,
}: {
  actorId: string
  initial: z.infer<typeof notificationSettingsSchema>
}) {
  const fieldId = useId()
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof notificationSettingsSchema>) =>
      updateNotificationSettings({ data }),
    retry: false,
  })
  const form = useForm({
    defaultValues: initial,
    validators: {
      onChange: notificationSettingsSchema,
      onSubmit: notificationSettingsSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const saved = await mutation.mutateAsync(value)
        client.setQueryData(notificationSettingsKey(actorId), saved)
        form.reset(saved)
        toast.success('შეტყობინებების პარამეტრები შენახულია.')
      } catch {
        toast.error('პარამეტრები ვერ შეინახა. სცადეთ ხელახლა.')
      }
    },
  })
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>სამუშაოების შეტყობინებები</CardTitle>
          <CardDescription>
            აირჩიეთ როლები, რომლებიც მიიღებენ ახალი სამუშაოს, დეტალებისა და
            სტატუსის ცვლილების შეტყობინებებს.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form.Field name="jobNotificationRoles">
            {(field) => (
              <FieldSet className="gap-4">
                <FieldLegend variant="label">მიმღები როლები</FieldLegend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roleSchema.options.map((role) => (
                    <Field
                      key={role}
                      orientation="horizontal"
                      className="rounded-lg border p-3"
                      data-invalid={!field.state.meta.isValid}
                    >
                      <Checkbox
                        id={`${fieldId}-${role}`}
                        checked={field.state.value.includes(role)}
                        disabled={mutation.isPending}
                        onCheckedChange={(checked) =>
                          field.handleChange(
                            roleSchema.options.filter((value) =>
                              value === role
                                ? checked
                                : field.state.value.includes(value),
                            ),
                          )
                        }
                        onBlur={field.handleBlur}
                        aria-invalid={!field.state.meta.isValid}
                        aria-describedby={`${fieldId}-description ${fieldId}-error`}
                      />
                      <FieldLabel
                        htmlFor={`${fieldId}-${role}`}
                        className="font-normal"
                      >
                        {roleLabels[role]}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
                <FieldDescription id={`${fieldId}-description`}>
                  თუ არცერთ როლს აირჩევთ, სამუშაოების შეტყობინებები არ
                  გაიგზავნება.
                </FieldDescription>
                <FieldError
                  id={`${fieldId}-error`}
                  errors={field.state.meta.errors}
                />
              </FieldSet>
            )}
          </form.Field>
        </CardContent>
        <CardFooter className="justify-end">
          <form.Subscribe
            selector={(state) => ({
              dirty: state.isDirty,
              pending: state.isSubmitting,
            })}
          >
            {({ dirty, pending }) => (
              <Button
                type="submit"
                disabled={!dirty || pending}
                aria-busy={pending}
              >
                {pending && <Spinner aria-hidden="true" />}შენახვა
              </Button>
            )}
          </form.Subscribe>
        </CardFooter>
      </Card>
    </form>
  )
}
