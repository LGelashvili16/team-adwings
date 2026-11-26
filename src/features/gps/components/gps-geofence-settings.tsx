import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import {
  jobGeofenceSettingsQueryOptions,
  jobsKeys,
} from '#/features/jobs/jobs.queries'
import { updateJobGeofenceSettings } from '#/features/jobs/jobs.functions'
import { jobGeofenceFormSchema } from '#/features/jobs/jobs.schemas'
import type { JobGeofenceDiameter } from '#/features/jobs/jobs.types'

const diameterLabel = 'სამუშაოების გეოზონის დიამეტრი (მ)'
const saveError = 'გეოზონის დიამეტრი ვერ შეინახა. სცადეთ ხელახლა.'

export function GpsGeofenceSettings({
  actorId,
  canManage,
}: {
  actorId: string
  canManage: boolean
}) {
  const query = useQuery(jobGeofenceSettingsQueryOptions(actorId))
  return (
    <div className="w-full min-w-0 sm:w-64">
      {query.data ? (
        canManage ? (
          <GeofenceForm
            key={query.data.diameter}
            actorId={actorId}
            diameter={query.data.diameter}
          />
        ) : (
          <div className="flex flex-col items-start gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {diameterLabel}
            </span>
            <Badge variant="secondary">{query.data.diameter} მ</Badge>
          </div>
        )
      ) : query.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">გეოზონის პარამეტრი იტვირთება</span>
          <Skeleton aria-hidden="true" className="h-9 w-32" />
        </div>
      ) : (
        <Alert variant="destructive">
          <AlertDescription>გეოზონის პარამეტრი ვერ ჩაიტვირთა.</AlertDescription>
          <Button
            variant="outline"
            depth="raised"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            ხელახლა ცდა
          </Button>
        </Alert>
      )}
    </div>
  )
}

function GeofenceForm({
  actorId,
  diameter,
}: {
  actorId: string
  diameter: JobGeofenceDiameter
}) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (value: { diameter: JobGeofenceDiameter }) => {
      const result = await updateJobGeofenceSettings({ data: value })
      if (!result.ok) throw new Error(result.message)
      return result.value
    },
    onSuccess: (setting) => {
      client.setQueryData(
        jobGeofenceSettingsQueryOptions(actorId).queryKey,
        (current) =>
          current && current.version > setting.version ? current : setting,
      )
      void client.invalidateQueries({ queryKey: jobsKeys.all(actorId) })
      toast.success('გეოზონის დიამეტრი შენახულია.')
    },
    onError: () => toast.error(saveError),
  })
  const form = useForm({
    defaultValues: { diameter: String(diameter) },
    validators: {
      onChange: jobGeofenceFormSchema,
      onSubmit: jobGeofenceFormSchema,
    },
    onSubmit: async ({ value }) => {
      const parsed = jobGeofenceFormSchema.parse(value)
      if (parsed.diameter === diameter || mutation.isPending) return
      await mutation.mutateAsync(parsed).catch(() => {})
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field name="diameter">
          {(field) => (
            <Field
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start"
              data-invalid={!field.state.meta.isValid}
            >
              <FieldLabel
                htmlFor="gps-geofence-diameter"
                className="col-span-2 text-xs text-muted-foreground"
              >
                {diameterLabel}
              </FieldLabel>
              <Input
                id="gps-geofence-diameter"
                className="h-11 tabular-nums sm:h-9"
                inputMode="numeric"
                value={field.state.value}
                disabled={mutation.isPending}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={!field.state.meta.isValid}
                aria-describedby={
                  field.state.meta.errors.length
                    ? 'gps-geofence-diameter-error'
                    : undefined
                }
              />
              <Button
                type="submit"
                depth="raised"
                className="h-11 sm:h-9"
                disabled={
                  Number(field.state.value) === diameter || mutation.isPending
                }
                aria-busy={mutation.isPending}
              >
                {mutation.isPending ? <Spinner aria-hidden="true" /> : null}
                შენახვა
              </Button>
              <FieldError
                id="gps-geofence-diameter-error"
                className="col-span-2"
                errors={field.state.meta.errors}
              />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      ) : null}
    </form>
  )
}
