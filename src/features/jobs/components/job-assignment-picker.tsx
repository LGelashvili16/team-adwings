import { useEffect, useId, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useInfiniteQuery } from '@tanstack/react-query'
import {
  IconCheck,
  IconFilter,
  IconPlus,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Field,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from '#/components/ui/field'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from '#/components/ui/popover'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from '#/components/ui/input-group'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import { jobAssignmentCandidatesQueryOptions } from '../jobs.queries'
import {
  jobAssignmentSearchSchema,
  jobAssignmentFilterSchema,
} from '../jobs.schemas'
import type { JobAssignmentSearch } from '../jobs.schemas'
import { teamMemberRoles } from '#/features/teams/teams.rules'
import { roleLabels } from '#/lib/authorization/permissions'
import type { JobAssignmentPerson } from '../jobs.types'

const labels = {
  employees: 'თანამშრომლების ძიება',
  teams: 'გუნდების ძიება',
  devices: 'GPS მოწყობილობების ძიება',
}
export function JobAssignmentPicker({
  actorId,
  kind,
  selected,
  disabled,
  onSelect,
}: {
  actorId: string
  kind: keyof typeof labels
  selected: Array<string>
  disabled: boolean
  onSelect: (person: JobAssignmentPerson) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [roles, setRoles] = useState<JobAssignmentSearch['roles']>([
    'production_specialist',
  ])
  const form = useForm({
    defaultValues: { q: '', roles },
    validators: {
      onChange: jobAssignmentFilterSchema,
    },
  })
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = jobAssignmentSearchSchema.shape.q.safeParse(draft)
      if (parsed.success) setQ(parsed.data)
    }, 300)
    return () => clearTimeout(timer)
  }, [draft])
  const query = useInfiniteQuery(
    jobAssignmentCandidatesQueryOptions(actorId, { kind, q, roles }),
  )
  const items = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ]
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className={
          kind === 'employees'
            ? 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2'
            : undefined
        }
      >
        <form.Field name="q">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor={id} className="sr-only">
                {labels[kind]}
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <IconSearch aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id={id}
                  value={draft}
                  disabled={disabled}
                  maxLength={100}
                  placeholder={
                    kind === 'employees'
                      ? 'სახელის, მომხმარებლის ან თანამდებობის ძიება'
                      : labels[kind]
                  }
                  aria-invalid={!field.state.meta.isValid}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    field.handleChange(event.target.value)
                  }}
                />
                {draft ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      size="icon-xs"
                      aria-label="ძიების გასუფთავება"
                      disabled={disabled}
                      onClick={() => {
                        setDraft('')
                        field.handleChange('')
                      }}
                    >
                      <IconX aria-hidden="true" />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        {kind === 'employees' ? (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  depth="raised"
                  disabled={disabled}
                  aria-label={`როლების ფილტრი, არჩეულია ${roles.length}`}
                />
              }
            >
              <IconFilter aria-hidden="true" />
              როლები<Badge variant="secondary">{roles.length}</Badge>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-72 max-w-[calc(100vw-2rem)] gap-3 p-3"
            >
              <PopoverHeader>
                <PopoverTitle>როლებით გაფილტვრა</PopoverTitle>
              </PopoverHeader>
              <form.Field name="roles">
                {(field) => (
                  <FieldSet className="gap-1">
                    <FieldLegend variant="label" className="sr-only">
                      როლები
                    </FieldLegend>
                    {teamMemberRoles.map((role) => (
                      <Field
                        key={role}
                        orientation="horizontal"
                        className="rounded-md px-2 py-2 hover:bg-accent"
                      >
                        <Checkbox
                          id={`${id}-${role}`}
                          checked={roles.includes(role)}
                          disabled={disabled}
                          onCheckedChange={(checked) => {
                            const next = teamMemberRoles.filter((value) =>
                              value === role ? checked : roles.includes(value),
                            )
                            field.handleChange(next)
                            setRoles(next)
                          }}
                        />
                        <FieldLabel
                          htmlFor={`${id}-${role}`}
                          className="cursor-pointer text-sm font-normal"
                        >
                          {roleLabels[role]}
                        </FieldLabel>
                      </Field>
                    ))}
                    <FieldError errors={field.state.meta.errors} />
                    <div className="mt-2 border-t pt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        depth="raised"
                        disabled={disabled}
                        onClick={() => {
                          field.handleChange(['production_specialist'])
                          setRoles(['production_specialist'])
                        }}
                      >
                        ნაგულისხმევი
                      </Button>
                    </div>
                  </FieldSet>
                )}
              </form.Field>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      {query.data ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          ნაჩვენებია {items.length} / {query.data.pages[0].total}
        </p>
      ) : null}
      <div
        role="region"
        aria-label={labels[kind]}
        aria-busy={query.isFetching}
        className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border"
        tabIndex={0}
      >
        {query.isPending ? (
          <div role="status" className="flex flex-col gap-2 p-3">
            <span className="sr-only">სია იტვირთება</span>
            <Skeleton aria-hidden="true" className="h-12 w-full" />
            <Skeleton aria-hidden="true" className="h-12 w-full" />
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((item) => {
              const picked = selected.includes(item.id)
              return (
                <li
                  key={item.id}
                  className="flex min-w-0 items-center gap-3 p-3"
                >
                  {kind === 'employees' ? (
                    <Avatar aria-hidden="true">
                      <AvatarFallback>
                        {item.name
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">
                      {item.name}
                    </p>
                    {kind === 'teams' && item.memberCount !== undefined ? (
                      <Badge variant="secondary">
                        {item.memberCount} წევრი
                      </Badge>
                    ) : null}
                    {kind === 'devices' && item.reportedId ? (
                      <div className="mt-1 flex flex-col gap-1 text-xs break-words text-muted-foreground tabular-nums">
                        {item.phone ? (
                          <p>
                            <span className="sr-only">ტელეფონი: </span>
                            {item.phone}
                          </p>
                        ) : null}
                        <p>GPS ID: {item.reportedId}</p>
                      </div>
                    ) : null}
                    {item.jobTitle ? (
                      <p className="text-xs break-words text-muted-foreground">
                        {item.jobTitle}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant={
                      picked && kind === 'employees' ? 'secondary' : 'outline'
                    }
                    depth="raised"
                    size="sm"
                    disabled={disabled || (picked && kind === 'employees')}
                    aria-label={`${item.name} ${kind === 'employees' ? (picked ? 'დამატებულია' : 'დამატება') : 'არჩევა'}`}
                    onClick={() => onSelect(item)}
                  >
                    {picked ? (
                      <IconCheck aria-hidden="true" />
                    ) : (
                      <IconPlus aria-hidden="true" />
                    )}{' '}
                    {kind === 'employees'
                      ? picked
                        ? 'დამატებულია'
                        : 'დამატება'
                      : 'არჩევა'}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        {query.isSuccess && !items.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            შედეგები ვერ მოიძებნა.
          </p>
        ) : null}
      </div>
      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            სია ვერ ჩაიტვირთა. სცადეთ ხელახლა.
          </AlertDescription>
        </Alert>
      ) : null}
      {query.isError && !query.data ? (
        <Button
          type="button"
          variant="outline"
          depth="raised"
          disabled={query.isFetching}
          aria-busy={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? <Spinner /> : null}ხელახლა ცდა
        </Button>
      ) : null}
      {query.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          depth="raised"
          disabled={disabled || query.isFetchingNextPage}
          aria-busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? <Spinner /> : null}
          {query.isFetchNextPageError ? 'ხელახლა ცდა' : 'მეტის ჩატვირთვა'}
        </Button>
      ) : null}
    </div>
  )
}
