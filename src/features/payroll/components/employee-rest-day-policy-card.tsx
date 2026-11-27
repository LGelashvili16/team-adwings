import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconCalendarEvent,
  IconChevronDown,
  IconDeviceFloppy,
  IconHistory,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import { formatGeorgianDate, formatGeorgianDateTime } from '#/lib/date-format'
import { hasAnyPermission } from '#/lib/authorization/permissions'
import { restDayPolicyFormSchema } from '../rest-day-policy.schemas'
import { setEmployeeRestDayPolicy } from '../rest-day-policy.functions'
import {
  employeeRestDayPolicyQuery,
  restDayPolicyKey,
} from '../rest-day-policy.queries'
import { attendancePayrollKey } from '../attendance-payroll.queries'
import { monthlyKey } from '../monthly.queries'
import type { Actor } from '#/lib/authorization/actor'
import type { EmployeeRestDayPolicyView } from '../rest-day-policy.types'

export function EmployeeRestDayPolicyCard({
  actor,
  userId,
}: {
  actor: Actor
  userId: string
}) {
  const canRead = hasAnyPermission(actor, [
    'payroll.attendance.review',
    'payroll.read.all',
  ])
  const [page, setPage] = useState(1)
  const [historyOpen, setHistoryOpen] = useState(false)
  const query = useQuery({
    ...employeeRestDayPolicyQuery(actor.id, userId, page),
    enabled: canRead,
  })
  if (!canRead) return null
  const view = query.data?.ok ? query.data.value : null
  const isFixed = view?.salaryKind === 'monthly'
  const isHourly = view?.salaryKind === 'hourly'

  return (
    <Card className="min-w-0 rounded-2xl sm:[--card-spacing:--spacing(5)]">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <IconCalendarEvent className="size-5" aria-hidden="true" />
          </span>
          <h2>დასვენების დღის წესები</h2>
        </CardTitle>
        {view ? (
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={
                view.current.restDayClockInAllowed ? 'green' : 'secondary'
              }
            >
              შესვლა:{' '}
              {view.current.restDayClockInAllowed ? 'ჩართულია' : 'გამორთულია'}
            </Badge>
            {isFixed ? (
              <Badge
                variant={
                  view.current.autoRestDayBonusEnabled ? 'green' : 'secondary'
                }
              >
                ბონუსი:{' '}
                {view.current.autoRestDayBonusEnabled
                  ? 'ჩართულია'
                  : 'გამორთულია'}
              </Badge>
            ) : isHourly ? (
              <Badge variant="green">+30% (ავტომატური)</Badge>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {query.isPending ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="დასვენების დღის წესები იტვირთება"
          >
            <Skeleton className="h-24 rounded-xl" aria-hidden="true" />
          </div>
        ) : !view ? (
          <Alert variant="destructive">
            <AlertDescription>
              {query.data && !query.data.ok
                ? query.data.message
                : 'დასვენების დღის წესები ვერ ჩაიტვირთა.'}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {view.canEdit ? (
              <RestDayPolicyForm
                key={`${view.version}-${view.salaryKind ?? 'none'}`}
                actorId={actor.id}
                view={view}
              />
            ) : userId === actor.id ? (
              <p className="text-sm text-muted-foreground">
                საკუთარი დასვენების დღის წესების შესაცვლელად მიმართეთ სხვა
                უფლებამოსილ პირს.
              </p>
            ) : null}
            {view.total > 0 ? (
              <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                <CollapsibleTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between px-2"
                    />
                  }
                >
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <IconHistory className="size-4" aria-hidden="true" />
                    ცვლილებების ისტორია ({view.total})
                  </span>
                  <IconChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${historyOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 flex flex-col gap-2">
                  <ul className="divide-y rounded-xl border bg-muted/20">
                    {view.history.map((item) => (
                      <li
                        key={item.version}
                        className="flex flex-col gap-1 p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium tabular-nums">
                            {formatGeorgianDate(item.effectiveFrom)}-დან
                          </span>
                          <span className="text-muted-foreground">
                            {item.actorName} ·{' '}
                            {formatGeorgianDateTime(
                              item.recordedAt,
                              view.timezone,
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge
                            variant={
                              item.restDayClockInAllowed ? 'green' : 'secondary'
                            }
                          >
                            შესვლა:{' '}
                            {item.restDayClockInAllowed ? 'ჩართ.' : 'გამორთ.'}
                          </Badge>
                          {isFixed ? (
                            <Badge
                              variant={
                                item.autoRestDayBonusEnabled
                                  ? 'green'
                                  : 'secondary'
                              }
                            >
                              ბონუსი:{' '}
                              {item.autoRestDayBonusEnabled
                                ? 'ჩართ.'
                                : 'გამორთ.'}
                            </Badge>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {view.total > view.pageSize ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        depth="raised"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      >
                        წინა
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        depth="raised"
                        size="sm"
                        disabled={page * view.pageSize >= view.total}
                        onClick={() => setPage((prev) => prev + 1)}
                      >
                        შემდეგი
                      </Button>
                    </div>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function RestDayPolicyForm({
  actorId,
  view,
}: {
  actorId: string
  view: EmployeeRestDayPolicyView
}) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const isFixed = view.salaryKind === 'monthly'
  const initialBonus = isFixed ? view.current.autoRestDayBonusEnabled : false

  const mutation = useMutation({
    mutationFn: (values: {
      restDayClockInAllowed: boolean
      autoRestDayBonusEnabled: boolean
    }) =>
      setEmployeeRestDayPolicy({
        data: {
          userId: view.userId,
          expectedVersion: view.version,
          restDayClockInAllowed: values.restDayClockInAllowed,
          autoRestDayBonusEnabled: isFixed
            ? values.autoRestDayBonusEnabled
            : false,
        },
      }),
    retry: false,
  })

  const form = useForm({
    defaultValues: {
      restDayClockInAllowed: view.current.restDayClockInAllowed,
      autoRestDayBonusEnabled: initialBonus,
    },
    validators: { onSubmit: restDayPolicyFormSchema },
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const parsed = restDayPolicyFormSchema.parse(value)
        const result = await mutation.mutateAsync(parsed)
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success('დასვენების დღის წესები შენახულია.')
        await Promise.all([
          client.invalidateQueries({
            queryKey: restDayPolicyKey(actorId, view.userId),
          }),
          client.invalidateQueries({ queryKey: attendancePayrollKey(actorId) }),
          client.invalidateQueries({ queryKey: monthlyKey(actorId) }),
        ])
      } catch {
        const msg = 'წესების შენახვა ვერ მოხერხდა. სცადეთ ხელახლა.'
        setError(msg)
        toast.error(msg)
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
      className="flex flex-1 flex-col gap-3"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset
        disabled={mutation.isPending}
        className="flex flex-1 flex-col gap-3"
      >
        <FieldGroup className="gap-3">
          <form.Field name="restDayClockInAllowed">
            {(field) => (
              <Field
                orientation="horizontal"
                className="justify-between gap-3 rounded-xl border bg-muted/20 p-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <FieldLabel htmlFor="rest-day-clock-in">
                    დასვენების დღეს შესვლის ნებართვა
                  </FieldLabel>
                  <FieldDescription className="text-xs">
                    გამორთვისას თანამშრომელი დასვენების დღეს სესიას თავად ვერ
                    დაიწყებს.
                  </FieldDescription>
                </div>
                <Switch
                  id="rest-day-clock-in"
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
              </Field>
            )}
          </form.Field>
          {isFixed ? (
            <form.Field name="autoRestDayBonusEnabled">
              {(field) => (
                <Field
                  orientation="horizontal"
                  className="justify-between gap-3 rounded-xl border bg-muted/20 p-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <FieldLabel htmlFor="rest-day-auto-bonus">
                      დასვენების დღის ავტომატური ბონუსი (+30%)
                    </FieldLabel>
                    <FieldDescription className="text-xs">
                      დასვენების დღეს მუშაობაზე დაემატება დღიური განაკვეთი ×
                      1.30.
                    </FieldDescription>
                  </div>
                  <Switch
                    id="rest-day-auto-bonus"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
          ) : null}
        </FieldGroup>
        <form.Subscribe selector={(s) => s.values}>
          {(values) => {
            const changed =
              values.restDayClockInAllowed !==
                view.current.restDayClockInAllowed ||
              (isFixed && values.autoRestDayBonusEnabled !== initialBonus)
            return (
              <div className="mt-auto flex justify-end pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!changed || mutation.isPending}
                  aria-busy={mutation.isPending}
                >
                  {mutation.isPending ? (
                    <Spinner />
                  ) : (
                    <IconDeviceFloppy
                      data-icon="inline-start"
                      aria-hidden="true"
                    />
                  )}
                  შენახვა
                </Button>
              </div>
            )
          }}
        </form.Subscribe>
      </fieldset>
    </form>
  )
}
