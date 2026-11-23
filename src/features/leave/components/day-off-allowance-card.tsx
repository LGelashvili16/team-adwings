import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  IconCalendarPause,
  IconSun,
  IconAdjustmentsHorizontal,
  IconInfoCircle,
} from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import { Switch } from '#/components/ui/switch'
import { Spinner } from '#/components/ui/spinner'
import { Skeleton } from '#/components/ui/skeleton'
import { Alert, AlertDescription } from '#/components/ui/alert'
import {
  Field,
  FieldLabel,
  FieldError,
  FieldSet,
  FieldLegend,
} from '#/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  dayOffSettingsQuery,
  employeeDayOffBalanceQuery,
  ownDayOffBalanceQuery,
  dayOffAllowanceKey,
} from '../day-off-allowance.queries'
import {
  updateDayOffSettings,
  updateEmployeeDayOffBalance,
} from '../day-off-allowance.functions'
import {
  saveAllowanceSettingFormSchema,
  adjustAllowanceBalanceFormSchema,
} from '../day-off-allowance.schemas'
import type { DayOffBalanceView } from '../day-off-allowance.schemas'

function PendingBalance() {
  return (
    <div role="status" aria-busy="true" aria-label="ბალანსი იტვირთება">
      <Skeleton className="h-24 w-full" aria-hidden="true" />
    </div>
  )
}
function BalanceError() {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        დასვენების დღეების ბალანსი ვერ ჩაიტვირთა. განაახლეთ გვერდი.
      </AlertDescription>
    </Alert>
  )
}
export function OwnDayOffBalance({ actorId }: { actorId: string }) {
  const query = useQuery(ownDayOffBalanceQuery(actorId))
  if (query.isPending) return <PendingBalance />
  if (!query.data) return <BalanceError />
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Badge
        variant="blue"
        className="h-auto w-full max-w-full px-3 py-1.5 text-sm whitespace-normal sm:w-fit"
      >
        დასვენების დღეები: {query.data.remainingDays}
      </Badge>
      <Badge
        variant="purple"
        className="h-auto w-full max-w-full px-3 py-1.5 text-sm whitespace-normal sm:w-fit"
      >
        შვებულება: {query.data.vacationRemainingDays} სამუშაო დღე
      </Badge>
    </div>
  )
}
export function EmployeeDayOffBalanceCard({
  actorId,
  userId,
  canEdit,
}: {
  actorId: string
  userId: string
  canEdit: boolean
}) {
  const query = useQuery(employeeDayOffBalanceQuery(actorId, userId))
  const [editing, setEditing] = useState(false)
  return (
    <Card className="rounded-2xl py-4 sm:py-5">
      <CardHeader className="px-4 sm:px-5">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/70 text-muted-foreground">
            <IconCalendarPause className="size-4" aria-hidden="true" />
          </span>
          <h2>დასვენება და შვებულება</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4 sm:px-5">
        {query.isPending ? (
          <div role="status" aria-busy="true" aria-label="ბალანსი იტვირთება">
            <div className="flex flex-col gap-3" aria-hidden="true">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
              </div>
              {canEdit ? <Skeleton className="h-9 rounded-lg" /> : null}
            </div>
          </div>
        ) : !query.data ? (
          <BalanceError />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-badge-blue-foreground/15 bg-badge-blue/40 p-3.5">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-badge-blue-foreground">
                  <IconCalendarPause className="size-3.5 shrink-0" aria-hidden="true" />
                  დასვენების დღეები
                </dt>
                <dd className="mt-2 flex items-baseline gap-1.5 text-badge-blue-foreground">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">
                    {query.data.remainingDays}
                  </span>
                  <span className="text-xs">დღე</span>
                </dd>
                <dd className="mt-2 text-xs leading-4 text-muted-foreground">
                  წლიური ლიმიტი: {query.data.annualDays}
                </dd>
              </div>
              <div className="rounded-xl border border-badge-purple-foreground/15 bg-badge-purple/40 p-3.5">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-badge-purple-foreground">
                  <IconSun className="size-3.5 shrink-0" aria-hidden="true" />
                  შვებულება
                </dt>
                <dd className="mt-2 flex items-baseline gap-1.5 text-badge-purple-foreground">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">
                    {query.data.vacationRemainingDays}
                  </span>
                  <span className="text-xs">დღე</span>
                </dd>
                <dd className="mt-2 text-xs leading-4 text-muted-foreground">
                  წლიური დამატება: {query.data.vacationAnnualDays}
                </dd>
              </div>
            </dl>
            {canEdit ? (
              <Button
                variant="outline"
                depth="raised"
                className="w-full"
                onClick={() => setEditing(true)}
              >
                <IconAdjustmentsHorizontal
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                რედაქტირება
              </Button>
            ) : null}
            <Dialog open={editing} onOpenChange={setEditing}>
              <DialogContent className="max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>ბალანსების შეცვლა</DialogTitle>
                </DialogHeader>
                <BalanceForm
                  userId={userId}
                  initial={query.data}
                  onSaved={() => setEditing(false)}
                />
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  )
}
function BalanceForm({
  userId,
  initial,
  onSaved,
}: {
  userId: string
  initial: DayOffBalanceView
  onSaved: () => void
}) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const form = useForm({
    defaultValues: {
      userId,
      annualDays: initial.annualDays,
      remainingDays: initial.remainingDays,
      vacationAnnualDays: initial.vacationAnnualDays,
      vacationRemainingDays: initial.vacationRemainingDays,
      revision: initial.revision,
      year: initial.year,
      reason: '',
    },
    validators: { onSubmit: adjustAllowanceBalanceFormSchema },
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await updateEmployeeDayOffBalance({ data: value })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        await client.invalidateQueries({ queryKey: dayOffAllowanceKey })
        toast.success('ბალანსები განახლდა.')
        onSaved()
      } catch {
        const message =
          'ბალანსი ვერ განახლდა. განაახლეთ მონაცემები და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {(
        [
          'annualDays',
          'remainingDays',
          'vacationAnnualDays',
          'vacationRemainingDays',
          'reason',
        ] as const
      ).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor={`balance-${name}`}>
                {name === 'annualDays'
                  ? 'წლიური ლიმიტი'
                  : name === 'remainingDays'
                    ? 'დარჩენილი დღეები'
                    : name === 'vacationAnnualDays'
                      ? 'შვებულების წლიური ლიმიტი (სამუშაო დღე)'
                      : name === 'vacationRemainingDays'
                        ? 'შვებულების დარჩენილი სამუშაო დღეები'
                        : 'ცვლილების მიზეზი'}
              </FieldLabel>
              <Input
                id={`balance-${name}`}
                type={name === 'reason' ? 'text' : 'number'}
                min={name === 'vacationAnnualDays' ? 24 : 0}
                required
                value={
                  typeof field.state.value === 'number' &&
                  Number.isNaN(field.state.value)
                    ? ''
                    : field.state.value
                }
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(
                    name === 'reason'
                      ? event.target.value
                      : event.target.value === ''
                        ? Number.NaN
                        : Number(event.target.value),
                  )
                }
                aria-invalid={!field.state.meta.isValid}
                aria-describedby={`balance-${name}-error`}
              />
              <FieldError
                id={`balance-${name}-error`}
                errors={field.state.meta.errors}
              />
            </Field>
          )}
        </form.Field>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? <Spinner aria-hidden="true" /> : null}ბალანსის შენახვა
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
export function DayOffSettingsCard({ canEdit }: { canEdit: boolean }) {
  const query = useQuery(dayOffSettingsQuery())
  return (
    <Card className="rounded-2xl [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
      <CardHeader className="border-b">
        <CardTitle className="font-semibold">
          დასვენებისა და შვებულების ლიმიტები
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="პარამეტრები იტვირთება"
          >
            <div className="grid gap-6 md:grid-cols-2" aria-hidden="true">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          </div>
        ) : !query.data ? (
          <BalanceError />
        ) : (
          <SettingsForm
            key={query.data.revision}
            initial={query.data}
            canEdit={canEdit}
          />
        )}
      </CardContent>
    </Card>
  )
}
function SettingsForm({
  initial,
  canEdit,
}: {
  initial: {
    defaultDays: number
    resetYearly: boolean
    revision: number
    defaultVacationDays?: number
  }
  canEdit: boolean
}) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const form = useForm({
    defaultValues: {
      ...initial,
      defaultVacationDays: initial.defaultVacationDays ?? 24,
    },
    validators: { onSubmit: saveAllowanceSettingFormSchema },
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await updateDayOffSettings({ data: value })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        await client.invalidateQueries({ queryKey: dayOffAllowanceKey })
        toast.success('დასვენების დღეების წესი შენახულია.')
      } catch {
        const message =
          'წესი ვერ შეინახა. განაახლეთ მონაცემები და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <FieldSet className="min-w-0 gap-5">
          <FieldLegend className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <IconCalendarPause className="size-5" aria-hidden="true" />
            </span>
            დასვენების დღეები
          </FieldLegend>
          <form.Field name="defaultDays">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor="default-day-offs">
                  საწყისი ლიმიტი (დღე)
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </FieldLabel>
                <Input
                  id="default-day-offs"
                  type="number"
                  min={0}
                  max={366}
                  required
                  disabled={!canEdit}
                  value={
                    Number.isNaN(field.state.value) ? '' : field.state.value
                  }
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(event.target.valueAsNumber)
                  }
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby="default-day-offs-info default-day-offs-error"
                />
                <FieldError
                  id="default-day-offs-error"
                  errors={field.state.meta.errors}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="resetYearly">
            {(field) => (
              <Field
                orientation="horizontal"
                className="rounded-xl border bg-muted/30 p-4"
              >
                <FieldLabel htmlFor="reset-day-offs">
                  ბალანსის წლიური განახლება 1 იანვარს
                </FieldLabel>
                <Switch
                  id="reset-day-offs"
                  disabled={!canEdit}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                  aria-describedby="default-day-offs-info"
                />
              </Field>
            )}
          </form.Field>
          <Alert variant="info" role="note" id="default-day-offs-info">
            <IconInfoCircle aria-hidden="true" />
            <AlertDescription>
              საწყისი ლიმიტი ახალი თანამშრომლებისთვისაა. გამორთვისას ნაშთი
              ინახება; ჩართვა მომდევნო 1 იანვრიდან მოქმედებს.
            </AlertDescription>
          </Alert>
        </FieldSet>
        <FieldSet className="min-w-0 gap-5">
          <FieldLegend className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <IconSun className="size-5" aria-hidden="true" />
            </span>
            შვებულება
          </FieldLegend>
          <form.Field name="defaultVacationDays">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor="default-vacation-days">
                  შვებულების წლიური ლიმიტი (სამუშაო დღე)
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </FieldLabel>
                <Input
                  id="default-vacation-days"
                  required
                  type="number"
                  min={24}
                  max={366}
                  disabled={!canEdit}
                  value={
                    Number.isNaN(field.state.value) ? '' : field.state.value
                  }
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(event.target.valueAsNumber)
                  }
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby="vacation-days-info vacation-days-error"
                />
                <FieldError
                  id="vacation-days-error"
                  errors={field.state.meta.errors}
                />
              </Field>
            )}
          </form.Field>
          <Alert variant="info" role="note" id="vacation-days-info">
            <IconInfoCircle aria-hidden="true" />
            <AlertDescription>
              ლიმიტი ახალი თანამშრომლებისთვისაა. დღეები ყოველ 1 იანვარს ემატება,
              გამოუყენებელი ნაშთი ინახება და დასვენების დღეები არ მცირდება.
            </AlertDescription>
          </Alert>
        </FieldSet>
      </div>
      {canEdit ? (
        <>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(pending) => (
              <Button
                type="submit"
                className="self-end"
                depth="raised"
                disabled={pending}
                aria-busy={pending}
              >
                {pending ? <Spinner aria-hidden="true" /> : null}წესის შენახვა
              </Button>
            )}
          </form.Subscribe>
        </>
      ) : null}
    </form>
  )
}
