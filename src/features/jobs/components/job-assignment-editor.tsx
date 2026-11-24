import { useId, useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconChevronDown, IconGps, IconUsers, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '#/components/ui/accordion'
import { Spinner } from '#/components/ui/spinner'
import { readJobAssignmentTeam, saveJobAssignments } from '../jobs.functions'
import { jobsKeys } from '../jobs.queries'
import { canAssignJobs } from '../jobs.rules'
import { jobAssignmentFieldsSchema } from '../jobs.schemas'
import { JobAssignmentPicker } from './job-assignment-picker'
import { JobConflictReview } from './job-conflict-review'
import type { z } from 'zod'
import type { Actor } from '#/lib/authorization/actor'
import type { JobDetail, JobAssignmentPerson } from '../jobs.types'

export function JobAssignmentEditor({
  actor,
  job,
  open,
  onOpenChange,
}: {
  actor: Actor
  job: JobDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const client = useQueryClient()
  const fieldId = useId()
  const [people, setPeople] = useState(job.assignments.employees)
  const [team, setTeam] = useState(job.assignments.team)
  const [device, setDevice] = useState(job.assignments.gpsDevice)
  const [teamOpen, setTeamOpen] = useState(false)
  const [deviceOpen, setDeviceOpen] = useState(false)
  const [version, setVersion] = useState(job.version)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const mutation = useMutation({
    mutationFn: (fields: z.infer<typeof jobAssignmentFieldsSchema>) =>
      saveJobAssignments({ data: { ...fields, id: job.id, version } }),
    retry: false,
  })
  const teamLookup = useMutation({
    mutationFn: (id: string) => readJobAssignmentTeam({ data: { id } }),
    retry: false,
  })
  const pending = mutation.isPending || teamLookup.isPending
  const form = useForm({
    defaultValues: {
      employeeIds: people.map((person) => person.id),
      teamId: team?.id ?? null,
      teamVersion: null as number | null,
      gpsDeviceId: device?.id ?? null,
    },
    validationLogic: revalidateLogic({
      mode: 'submit',
      modeAfterSubmission: 'change',
    }),
    validators: { onDynamic: jobAssignmentFieldsSchema },
    onSubmit: async ({ value }) => {
      if (pending || conflict) return
      setError('')
      try {
        const result = await mutation.mutateAsync(value)
        if (!result.ok) {
          setError(result.message)
          setConflict(result.code === 'conflict')
          toast.error(result.message)
          return
        }
        toast.success('სამუშაოს შემსრულებლები შენახულია.')
        void client.invalidateQueries({ queryKey: jobsKeys.all(actor.id) })
        onOpenChange(false)
      } catch {
        setError('შენახვა ვერ მოხერხდა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.')
        toast.error('დამატების შენახვა ვერ მოხერხდა.')
      }
    },
  })
  function changePeople(next: Array<JobAssignmentPerson>) {
    setPeople(next)
    form.setFieldValue(
      'employeeIds',
      next.map((person) => person.id),
    )
  }
  async function selectTeam(person: JobAssignmentPerson) {
    setError('')
    try {
      const result = await teamLookup.mutateAsync(person.id)
      if (!result.ok) {
        setError(result.message)
        return
      }
      const selected = result.value
      setTeam({ id: selected.id, name: selected.name })
      form.setFieldValue('teamId', selected.id)
      form.setFieldValue('teamVersion', selected.version)
      changePeople([
        ...new Map(
          [...people, ...selected.employees].map((member) => [
            member.id,
            member,
          ]),
        ).values(),
      ])
      setTeamOpen(false)
    } catch {
      setError('გუნდი ვერ ჩაიტვირთა. სცადეთ ხელახლა.')
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        aria-describedby={undefined}
        showCloseButton={!pending}
        forceBackdrop
      >
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <DialogTitle>სამუშაოზე დამატება</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
            <Card size="sm" className="shrink-0">
              <CardHeader>
                <CardTitle>GPS მოწყობილობა</CardTitle>
              </CardHeader>
              <CardContent>
                {' '}
                <form.Field name="gpsDeviceId">
                  {(field) => (
                    <Field data-invalid={!field.state.meta.isValid}>
                      <FieldLabel
                        htmlFor={`${fieldId}-device`}
                        className="sr-only"
                      >
                        GPS მოწყობილობა
                      </FieldLabel>
                      <div className="flex gap-2">
                        <Popover open={deviceOpen} onOpenChange={setDeviceOpen}>
                          <PopoverTrigger
                            render={
                              <Button
                                id={`${fieldId}-device`}
                                type="button"
                                variant="outline"
                                depth="raised"
                                disabled={pending}
                                className="h-auto min-h-10 min-w-0 flex-1 justify-start whitespace-normal text-left"
                              />
                            }
                          >
                            <IconGps aria-hidden="true" />
                            <span className="min-w-0 flex-1 break-words">
                              {device?.name ?? 'მოწყობილობის არჩევა'}
                            </span>
                            <IconChevronDown aria-hidden="true" />
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-80 max-w-[calc(100vw-3rem)]"
                            align="start"
                          >
                            {deviceOpen ? (
                              <JobAssignmentPicker
                                actorId={actor.id}
                                kind="devices"
                                selected={device ? [device.id] : []}
                                disabled={pending}
                                onSelect={(person) => {
                                  setDevice(person)
                                  field.handleChange(person.id)
                                  setDeviceOpen(false)
                                }}
                              />
                            ) : null}
                          </PopoverContent>
                        </Popover>
                        {device ? (
                          <Button
                            type="button"
                            variant="outline"
                            depth="raised"
                            size="icon-lg"
                            aria-label="GPS მოწყობილობის მოხსნა"
                            disabled={pending}
                            onClick={() => {
                              setDevice(null)
                              field.handleChange(null)
                            }}
                          >
                            <IconX aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
              </CardContent>
            </Card>
            <Card size="sm" className="shrink-0">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  დამატებული თანამშრომლები
                  <Badge variant="secondary">{people.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form.Field name="employeeIds">
                  {(field) => (
                    <Field data-invalid={!field.state.meta.isValid}>
                      <div className="max-h-52 overflow-y-auto">
                        {people.length ? (
                          <ul className="flex flex-col gap-3">
                            {people.map((person) => (
                              <li
                                key={person.id}
                                className="flex items-center gap-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium break-words">
                                    {person.name}
                                  </p>
                                  {person.jobTitle ? (
                                    <p className="text-xs break-words text-muted-foreground">
                                      {person.jobTitle}
                                    </p>
                                  ) : null}
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  depth="raised"
                                  size="icon-sm"
                                  aria-label={`${person.name} ამოღება`}
                                  disabled={pending}
                                  onClick={() =>
                                    changePeople(
                                      people.filter(
                                        (entry) => entry.id !== person.id,
                                      ),
                                    )
                                  }
                                >
                                  <IconX aria-hidden="true" />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            თანამშრომლები ჯერ არ არიან დამატებული.
                          </p>
                        )}
                      </div>
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
              </CardContent>
            </Card>
            <Card size="sm" className="shrink-0">
              <CardHeader>
                <CardTitle>თანამშრომლის დამატება</CardTitle>
              </CardHeader>
              <CardContent>
                <JobAssignmentPicker
                  actorId={actor.id}
                  kind="employees"
                  selected={people.map((person) => person.id)}
                  disabled={pending}
                  onSelect={(person) => {
                    if (!people.some((entry) => entry.id === person.id))
                      changePeople([...people, person])
                  }}
                />
              </CardContent>
            </Card>
            <Card size="sm" className="shrink-0">
              <CardContent>
                <Accordion>
                  <AccordionItem value="team">
                    <AccordionTrigger>დამატებითი პარამეტრები</AccordionTrigger>
                    <AccordionContent className="pt-3">
                      <FieldGroup>
                        {' '}
                        <form.Field name="teamId">
                          {(field) => (
                            <Field data-invalid={!field.state.meta.isValid}>
                              <FieldLabel htmlFor={`${fieldId}-team`}>
                                გუნდი
                              </FieldLabel>
                              <div className="flex gap-2">
                                <Popover
                                  open={teamOpen}
                                  onOpenChange={setTeamOpen}
                                >
                                  <PopoverTrigger
                                    render={
                                      <Button
                                        id={`${fieldId}-team`}
                                        type="button"
                                        variant="outline"
                                        depth="raised"
                                        disabled={pending}
                                        className="h-auto min-h-10 min-w-0 flex-1 justify-start whitespace-normal text-left"
                                      />
                                    }
                                  >
                                    {teamLookup.isPending ? (
                                      <Spinner />
                                    ) : (
                                      <IconUsers aria-hidden="true" />
                                    )}
                                    <span className="min-w-0 flex-1 break-words">
                                      {team?.name ?? 'გუნდის არჩევა'}
                                    </span>
                                    <IconChevronDown aria-hidden="true" />
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className="w-80 max-w-[calc(100vw-3rem)]"
                                    align="start"
                                  >
                                    {teamOpen ? (
                                      <JobAssignmentPicker
                                        actorId={actor.id}
                                        kind="teams"
                                        selected={team ? [team.id] : []}
                                        disabled={pending}
                                        onSelect={(person) =>
                                          void selectTeam(person)
                                        }
                                      />
                                    ) : null}
                                  </PopoverContent>
                                </Popover>
                                {team ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    depth="raised"
                                    size="icon-lg"
                                    aria-label="გუნდის მოხსნა"
                                    disabled={pending}
                                    onClick={() => {
                                      setTeam(null)
                                      field.handleChange(null)
                                      form.setFieldValue('teamVersion', null)
                                    }}
                                  >
                                    <IconX aria-hidden="true" />
                                  </Button>
                                ) : null}
                              </div>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                გუნდის არჩევა მის მოქმედ წევრებს სიაში ამატებს.
                                თანამშრომლები ცალ-ცალკე შეცვალეთ. გუნდის მოხსნა
                                თანამშრომლებს არ შლის.
                              </p>
                              <FieldError errors={field.state.meta.errors} />
                            </Field>
                          )}
                        </form.Field>
                      </FieldGroup>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {conflict ? (
              <JobConflictReview
                actorId={actor.id}
                id={job.id}
                canContinue={(latest) =>
                  canAssignJobs(actor) &&
                  !['completed', 'rejected'].includes(latest.status)
                }
                onReviewed={(latest) => {
                  setVersion(latest.version)
                  setConflict(false)
                  setError('')
                }}
              />
            ) : null}
          </div>
          <DialogFooter className="m-0 shrink-0 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              depth="raised"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              გაუქმება
            </Button>
            <Button
              type="submit"
              disabled={pending || conflict}
              aria-busy={pending}
            >
              {pending ? <Spinner aria-hidden="true" /> : null}შენახვა
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
