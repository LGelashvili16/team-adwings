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
import { Switch } from '#/components/ui/switch'
import {
  jobGeofenceSettingsQueryOptions,
  jobsKeys,
} from '#/features/jobs/jobs.queries'
import { updateJobGeofenceSettings } from '#/features/jobs/jobs.functions'
import { jobGeofenceFormSchema } from '#/features/jobs/jobs.schemas'
import type { JobGeofenceDiameter } from '#/features/jobs/jobs.types'

const diameterLabel = 'სამუშაოების გეოზონის დიამეტრი (მ)'
const autoModeLabel = 'ავტომატური დასწრება გეოზონით'
const saveError = 'გეოზონის პარამეტრები ვერ შეინახა. სცადეთ ხელახლა.'

export function GpsGeofenceSettings({
  actorId,
  canManage,
}: {
  actorId: string
  canManage: boolean
}) {
  const query = useQuery(jobGeofenceSettingsQueryOptions(actorId))
  const autoEnabled = query.data?.autoAttendanceEnabled ?? false
  return (
    <div className="w-full min-w-0 sm:w-72">
      {query.data ? (
        canManage ? (
          <GeofenceForm
            key={`${query.data.diameter}-${autoEnabled}`}
            actorId={actorId}
            diameter={query.data.diameter}
            autoAttendanceEnabled={autoEnabled}
          />
        ) : (
          <div className="flex flex-col items-start gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {diameterLabel}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{query.data.diameter} მ</Badge>
              <Badge variant={autoEnabled ? 'green' : 'outline'}>
                {autoEnabled ? 'ავტომატური დასწრება' : 'დაკვირვების რეჟიმი'}
              </Badge>
            </div>
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
  autoAttendanceEnabled,
}: {
  actorId: string
  diameter: JobGeofenceDiameter
  autoAttendanceEnabled: boolean
}) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (value: {
      diameter: JobGeofenceDiameter
      autoAttendanceEnabled?: boolean
    }) => {
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
      toast.success('გეოზონის პარამეტრები შენახულია.')
    },
    onError: () => toast.error(saveError),
  })
  const form = useForm({
    defaultValues: {
      diameter: String(diameter),
      autoAttendanceEnabled,
    },
    validators: {
      onChange: jobGeofenceFormSchema,
      onSubmit: jobGeofenceFormSchema,
    },
    onSubmit: async ({ value }) => {
      const parsed = jobGeofenceFormSchema.parse(value)
      if (
        (parsed.diameter === diameter &&
          parsed.autoAttendanceEnabled === autoAttendanceEnabled) ||
        mutation.isPending
      )
        return
      await mutation.mutateAsync(parsed).catch(() => {})
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="gap-3">
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
              <form.Subscribe selector={(s) => s.values.autoAttendanceEnabled}>
                {(autoVal) => (
                  <Button
                    type="submit"
                    depth="raised"
                    className="h-11 sm:h-9"
                    disabled={
                      (Number(field.state.value) === diameter &&
                        autoVal === autoAttendanceEnabled) ||
                      mutation.isPending
                    }
                    aria-busy={mutation.isPending}
                  >
                    {mutation.isPending ? <Spinner aria-hidden="true" /> : null}
                    შენახვა
                  </Button>
                )}
              </form.Subscribe>
              <FieldError
                id="gps-geofence-diameter-error"
                className="col-span-2"
                errors={field.state.meta.errors}
              />
            </Field>
          )}
        </form.Field>
        <form.Field name="autoAttendanceEnabled">
          {(field) => (
            <Field orientation="horizontal">
              <div className="flex flex-col gap-0.5">
                <FieldLabel
                  htmlFor="gps-geofence-auto-attendance"
                  className="text-xs text-muted-foreground"
                >
                  {autoModeLabel}
                </FieldLabel>
                <span className="text-[11px] text-muted-foreground">
                  {field.state.value
                    ? 'ჯგუფი ავტომატურად იწყებს და ასრულებს ცვლას'
                    : 'მხოლოდ დაკვირვების რეჟიმი'}
                </span>
              </div>
              <Switch
                id="gps-geofence-auto-attendance"
                checked={field.state.value}
                disabled={mutation.isPending}
                onCheckedChange={field.handleChange}
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
