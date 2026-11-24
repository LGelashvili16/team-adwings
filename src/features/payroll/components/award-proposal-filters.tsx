import { useEffect, useRef } from 'react'
import { useForm } from '@tanstack/react-form'
import { IconSearch } from '@tabler/icons-react'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
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
import {
  awardFilterSchema,
  awardSearchSchema,
} from '../award-proposals.schemas'
import type { AwardSearch } from '../award-proposals.schemas'

const labels = {
  status: {
    all: 'ყველა სტატუსი',
    proposed: 'განხილვის მოლოდინში',
    withdrawn: 'გაუქმებული',
  },
  sort: { newest: 'ჯერ ახალი', oldest: 'ჯერ ძველი' },
}
export function AwardProposalFilters({
  search,
  onChange,
}: {
  search: AwardSearch
  onChange: (value: AwardSearch) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const form = useForm({
    defaultValues: { q: search.q, status: search.status, sort: search.sort },
    validators: { onChange: awardFilterSchema, onSubmit: awardFilterSchema },
    onSubmit: ({ value }) => {
      if (timer.current) clearTimeout(timer.current)
      onChange(awardSearchSchema.parse({ ...value, page: 1 }))
    },
  })
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    form.reset({ q: search.q, status: search.status, sort: search.sort })
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [form, search.q, search.status, search.sort])
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="flex flex-col gap-3 sm:flex-row">
        <form.Field name="q">
          {(field) => (
            <Field
              className="min-w-0 sm:flex-1"
              data-invalid={!field.state.meta.isValid}
            >
              <FieldLabel htmlFor="award-search" className="sr-only">
                განაცხადის ძიება
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <IconSearch aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id="award-search"
                  placeholder="თანამშრომელი, წესი ან წყაროს ნომერი"
                  maxLength={100}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby={
                    !field.state.meta.isValid ? 'award-search-error' : undefined
                  }
                  onChange={(e) => {
                    field.handleChange(e.target.value)
                    if (timer.current) clearTimeout(timer.current)
                    timer.current = setTimeout(() => {
                      void form.handleSubmit()
                    }, 300)
                  }}
                />
              </InputGroup>
              <FieldError
                id="award-search-error"
                errors={field.state.meta.errors}
              />
            </Field>
          )}
        </form.Field>
        {(['status', 'sort'] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Field className="sm:w-auto">
                <FieldLabel
                  className="sr-only"
                  htmlFor={`award-filter-${name}`}
                >
                  {name === 'status'
                    ? 'განაცხადის სტატუსი'
                    : 'განაცხადების დალაგება'}
                </FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => {
                    const parsed = awardSearchSchema.safeParse({
                      ...form.state.values,
                      [name]: value,
                    })
                    if (parsed.success) {
                      form.setFieldValue(name, parsed.data[name])
                      void form.handleSubmit()
                    }
                  }}
                >
                  <SelectTrigger id={`award-filter-${name}`} className="w-full">
                    <SelectValue>
                      {
                        Object.entries(labels[name]).find(
                          ([key]) => key === field.state.value,
                        )?.[1]
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(labels[name]).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
        ))}
      </FieldGroup>
    </form>
  )
}
