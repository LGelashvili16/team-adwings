import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { useForm } from '@tanstack/react-form'
import { IconSearch } from '@tabler/icons-react'
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
import { monthlySearchSchema } from '../monthly.schemas'
import type { ReactNode } from 'react'
import type { MonthlySearch } from '../monthly.schemas'

const schema = z.object({
  q: monthlySearchSchema.shape.q.removeDefault(),
  sort: monthlySearchSchema.shape.sort.removeDefault(),
})
export function MonthlyFilters({
  search,
  onChange,
  monthPicker,
  children,
}: {
  search: MonthlySearch
  onChange: (search: MonthlySearch) => void
  monthPicker: ReactNode
  children: ReactNode
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const form = useForm({
    defaultValues: { q: search.q, sort: search.sort },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: ({ value }) => {
      if (timer.current) clearTimeout(timer.current)
      onChange({ ...search, ...value, page: 1 })
    },
  })
  const { q, sort, page, month, view } = search
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (form.state.values.q.trim() !== q || form.state.values.sort !== sort) {
      form.reset({ q, sort })
    }
  }, [form, q, sort, page, month, view])
  return (
    <form
      className="min-w-0"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="flex flex-wrap items-start gap-2 md:flex-row">
        <form.Field name="q">
          {(field) => (
            <Field
              className="min-w-0 md:w-64"
              data-invalid={!field.state.meta.isValid}
            >
              <FieldLabel htmlFor="monthly-search" className="sr-only">
                თანამშრომლის ძიება
              </FieldLabel>
              <InputGroup className="h-11 rounded-full px-1 md:h-9">
                <InputGroupAddon>
                  <IconSearch aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  className="h-full"
                  id="monthly-search"
                  placeholder="თანამშრომლის ძიება"
                  maxLength={100}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value)
                    if (timer.current) clearTimeout(timer.current)
                    timer.current = setTimeout(
                      () => void form.handleSubmit(),
                      300,
                    )
                  }}
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby={
                    !field.state.meta.isValid
                      ? 'monthly-search-error'
                      : undefined
                  }
                />
              </InputGroup>
              <FieldError
                id="monthly-search-error"
                errors={field.state.meta.errors}
              />
            </Field>
          )}
        </form.Field>
        {monthPicker}
        <form.Field name="sort">
          {(field) => (
            <Field className="md:w-auto">
              <FieldLabel htmlFor="monthly-sort" className="sr-only">
                დალაგება
              </FieldLabel>
              <Select
                value={field.state.value}
                onValueChange={(v) => {
                  if (v === 'name' || v === 'name_desc') {
                    field.handleChange(v)
                    void form.handleSubmit()
                  }
                }}
              >
                <SelectTrigger
                  id="monthly-sort"
                  className="w-full rounded-full px-3 shadow-control-raised active:shadow-control-pressed data-[size=default]:h-11 md:data-[size=default]:h-9"
                >
                  <SelectValue>
                    {field.state.value === 'name'
                      ? 'სახელით: ა-ჰ'
                      : 'სახელით: ჰ-ა'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="name">სახელით: ა-ჰ</SelectItem>
                    <SelectItem value="name_desc">სახელით: ჰ-ა</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>
        {children}
      </FieldGroup>
    </form>
  )
}
