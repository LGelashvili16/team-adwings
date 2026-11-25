import { useEffect, useEffectEvent, useRef } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import {
  IconAdjustmentsHorizontal,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { useIsMobile } from '#/hooks/use-mobile'
import { cn } from '#/lib/utils'
import {
  jobFilterSchema,
  jobKindSchema,
  jobStatusSchema,
} from '../jobs.schemas'
import { jobKinds, jobStatuses } from '../jobs.presentation'
import { jobsMonthRange } from '../jobs.dates'
import { JobsDateRange } from './jobs-date-range'
import type { JobSearch } from '../jobs.types'
import type { z } from 'zod'

type Filters = z.infer<typeof jobFilterSchema>
const signature = (search: JobSearch) =>
  JSON.stringify([
    search.q,
    search.status,
    search.kind,
    search.scope,
    search.deadlineState,
    search.sort,
    search.page,
    search.from,
    search.to,
  ])
const filterFields = [
  {
    name: 'status',
    label: 'სამუშაოს სტატუსი',
    options: [
      { value: 'all', label: 'ყველა სტატუსი' },
      ...jobStatusSchema.options.map((value) => ({
        value,
        label: jobStatuses[value].label,
      })),
    ],
  },
  {
    name: 'kind',
    label: 'სამუშაოს ტიპი',
    options: [
      { value: 'all', label: 'ყველა ტიპი' },
      ...jobKindSchema.options.map((value) => ({
        value,
        label: jobKinds[value].label,
      })),
    ],
  },
  {
    name: 'scope',
    label: 'სამუშაოები',
    options: [
      { value: 'all', label: 'ყველა სამუშაო' },
      { value: 'mine', label: 'ჩემზე მინიჭებული' },
      { value: 'related', label: 'ჩემთან დაკავშირებული' },
    ],
  },
  {
    name: 'sort',
    label: 'დალაგება და ვადა',
    options: [
      { value: 'newest', label: 'ჯერ ახალი' },
      { value: 'oldest', label: 'ჯერ ძველი' },
      { value: 'title', label: 'სათაურით' },
      { value: 'deadline_asc', label: 'ჯერ ახლო ვადა' },
      { value: 'deadline_desc', label: 'ჯერ შორი ვადა' },
      { value: 'upcoming', label: 'დღეს და მომავალი ვადები' },
      { value: 'overdue', label: 'ვადაგადაცილებული' },
    ],
  },
] as const

function countActiveFilters(search: JobSearch) {
  const defaultRange = jobsMonthRange()
  let count = 0
  if (
    search.deadlineState === 'all' &&
    (search.from !== defaultRange.from || search.to !== defaultRange.to)
  )
    count++
  if (search.q.trim()) count++
  if (search.status !== 'all') count++
  if (search.kind !== 'all') count++
  if (search.scope !== 'all') count++
  if (search.deadlineState !== 'all' || search.sort !== 'newest') count++
  return count
}

export function JobsFilters({
  search,
  onChange,
  showSearch = true,
}: {
  search: JobSearch
  onChange: (search: JobSearch, replace?: boolean) => void
  showSearch?: boolean
}) {
  const isMobile = useIsMobile()
  const applied = signature(search)
  const previous = useRef(applied)
  const pending = useRef(new Set<string>())
  const form = useForm({
    defaultValues: {
      from: search.from,
      to: search.to,
      q: search.q,
      status: search.status,
      kind: search.kind,
      scope: search.scope,
      deadlineState: search.deadlineState,
      sort: search.sort,
    },
    validators: { onChange: jobFilterSchema, onSubmit: jobFilterSchema },
    onSubmit: ({ value }) => commit(value, false),
  })
  const draft = useStore(form.store, (state) => state.values)
  function commit(value: Filters, replace: boolean) {
    const parsed = jobFilterSchema.safeParse(value)
    if (!parsed.success) return
    const next = { ...search, ...parsed.data, page: 1, pin: undefined }
    const key = signature(next)
    if (key === applied || pending.current.has(key)) return
    pending.current.add(key)
    onChange(next, replace)
  }
  const debounce = useEffectEvent(() => commit(draft, true))
  useEffect(() => {
    if (previous.current === applied) return
    previous.current = applied
    if (pending.current.delete(applied)) return
    pending.current.clear()
    form.reset({
      from: search.from,
      to: search.to,
      q: search.q,
      status: search.status,
      kind: search.kind,
      scope: search.scope,
      deadlineState: search.deadlineState,
      sort: search.sort,
    })
  }, [
    applied,
    form,
    search.q,
    search.status,
    search.kind,
    search.scope,
    search.deadlineState,
    search.sort,
    search.from,
    search.to,
  ])
  useEffect(() => {
    if (draft.q.trim() === search.q) return
    const timer = setTimeout(debounce, 300)
    return () => clearTimeout(timer)
  }, [draft.q, applied, search.q])

  const activeCount = countActiveFilters(search)

  const fields = (
    <FieldGroup
      className={cn(
        isMobile
          ? 'flex flex-col gap-3'
          : 'flex flex-row flex-wrap items-start gap-2',
      )}
    >
      {showSearch ? (
        <form.Field name="q">
          {(field) => (
            <Field
              className={cn(isMobile ? 'w-full' : 'w-full md:w-80')}
              data-invalid={!field.state.meta.isValid}
            >
              <FieldLabel className="sr-only" htmlFor="jobs-search">
                სამუშაოს ძიება
              </FieldLabel>
              <InputGroup className="h-11 rounded-full px-1 md:h-9">
                <InputGroupAddon>
                  <IconSearch aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id="jobs-search"
                  className="h-full"
                  placeholder="სამუშაოს ძიება"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby={
                    field.state.meta.errors.length
                      ? 'jobs-search-error'
                      : undefined
                  }
                />
              </InputGroup>
              <FieldError
                id="jobs-search-error"
                errors={field.state.meta.errors}
              />
            </Field>
          )}
        </form.Field>
      ) : null}
      {draft.deadlineState === 'all' ? (
        <Field className={cn(isMobile ? 'w-full' : 'w-full md:w-auto')}>
          <JobsDateRange
            key={`${search.from}:${search.to}`}
            value={{ from: search.from, to: search.to }}
            onChange={(range) => {
              form.setFieldValue('from', range.from)
              form.setFieldValue('to', range.to)
              commit({ ...form.state.values, ...range }, false)
            }}
          />
        </Field>
      ) : null}
      {filterFields.map(({ name, label, options }) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <Field className={cn(isMobile ? 'w-full' : 'w-auto')}>
              <FieldLabel className="sr-only" htmlFor={`jobs-filter-${name}`}>
                {label}
              </FieldLabel>
              <Select
                value={
                  name === 'sort' && draft.deadlineState !== 'all'
                    ? draft.deadlineState
                    : field.state.value
                }
                items={options}
                onValueChange={(value) => {
                  const deadlineState =
                    name === 'sort' &&
                    (value === 'upcoming' || value === 'overdue')
                      ? value
                      : 'all'
                  const parsed = jobFilterSchema.shape[name].safeParse(
                    deadlineState === 'all' ? value : 'deadline_asc',
                  )
                  if (!parsed.success) return
                  field.handleChange(parsed.data)
                  if (name === 'sort')
                    form.setFieldValue('deadlineState', deadlineState)
                  commit({ ...form.state.values, [name]: parsed.data }, false)
                }}
              >
                <SelectTrigger
                  id={`jobs-filter-${name}`}
                  className="w-full rounded-full px-3 shadow-control-raised active:shadow-control-pressed data-[size=default]:h-11 md:data-[size=default]:h-9"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-max min-w-(--anchor-width) max-w-[calc(100vw-2rem)]">
                  <SelectGroup>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
      ))}
      <Button
        type="button"
        variant="destructive"
        depth="raised"
        className={cn(
          'h-11 rounded-full px-3 md:size-9 md:p-0',
          isMobile && 'w-full',
        )}
        aria-label="ფილტრების გასუფთავება"
        title="ფილტრების გასუფთავება"
        onClick={() => {
          const defaults: Filters = {
            ...jobsMonthRange(),
            q: '',
            status: 'all',
            kind: 'all',
            scope: 'all',
            deadlineState: 'all',
            sort: 'newest',
          }
          pending.current.clear()
          form.reset(defaults)
          onChange({ ...search, ...defaults, page: 1, pin: undefined })
        }}
      >
        <IconX aria-hidden="true" />
        <span className={cn(!isMobile && 'md:sr-only')}>გასუფთავება</span>
      </Button>
    </FieldGroup>
  )

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {isMobile ? (
        <div className="rounded-xl border bg-card px-3.5">
          <Accordion>
            <AccordionItem value="filters">
              <AccordionTrigger className="items-center py-3 hover:no-underline">
                <span className="flex items-center gap-2 font-medium">
                  <IconAdjustmentsHorizontal
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  ფილტრები
                  {activeCount > 0 ? (
                    <Badge variant="secondary" className="tabular-nums">
                      {activeCount}
                    </Badge>
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-3.5">
                {fields}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      ) : (
        fields
      )}
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) =>
          errors.length ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              გადაამოწმეთ ფილტრები.
            </p>
          ) : null
        }
      </form.Subscribe>
    </form>
  )
}
