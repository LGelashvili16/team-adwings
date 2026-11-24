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
  salaryDirectorySchema,
  salaryFilterFormSchema,
} from '../salary.schemas'
import type { SalaryDirectorySearch } from '../salary.schemas'

const options = {
  kind: {
    all: 'ყველა ტიპი',
    monthly: 'თვიური',
    hourly: 'საათობრივი',
    unconfigured: 'განსასაზღვრი',
  },
  status: {
    active: 'აქტიური თანამშრომლები',
    inactive: 'არააქტიური თანამშრომლები',
    all: 'ყველა თანამშრომელი',
  },
  sort: { name: 'სახელით: ა-ჰ', name_desc: 'სახელით: ჰ-ა' },
}
export function SalaryDirectoryFilters({
  search,
  onChange,
}: {
  search: SalaryDirectorySearch
  onChange: (value: SalaryDirectorySearch) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const form = useForm({
    defaultValues: search,
    validators: {
      onSubmit: salaryFilterFormSchema,
      onChange: salaryFilterFormSchema,
    },
    onSubmit: ({ value }) => {
      if (timer.current) clearTimeout(timer.current)
      onChange(salaryDirectorySchema.parse({ ...value, page: 1 }))
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
      <FieldGroup className="flex flex-col gap-3 xl:flex-row">
        <form.Field name="q">
          {(field) => (
            <Field
              className="min-w-0 xl:flex-1"
              data-invalid={!field.state.meta.isValid}
            >
              <FieldLabel htmlFor="salary-search" className="sr-only">
                თანამშრომლის ძიება
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <IconSearch aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id="salary-search"
                  placeholder="სახელი, მომხმარებლის სახელი ან თანამდებობა"
                  value={field.state.value}
                  maxLength={100}
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby="salary-search-error"
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    if (timer.current) clearTimeout(timer.current)
                    timer.current = setTimeout(() => {
                      void form.handleSubmit()
                    }, 300)
                  }}
                />
              </InputGroup>
              <FieldError
                id="salary-search-error"
                errors={field.state.meta.errors}
              />
            </Field>
          )}
        </form.Field>
        {(['kind', 'status', 'sort'] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Field className="xl:w-auto">
                <FieldLabel
                  className="sr-only"
                  htmlFor={`salary-filter-${name}`}
                >
                  {name === 'kind'
                    ? 'ხელფასის ტიპი'
                    : name === 'status'
                      ? 'დასაქმების სტატუსი'
                      : 'დალაგება'}
                </FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => {
                    const parsed = salaryDirectorySchema.safeParse({
                      ...form.state.values,
                      [name]: value,
                    })
                    if (parsed.success) {
                      form.setFieldValue(name, parsed.data[name])
                      void form.handleSubmit()
                    }
                  }}
                >
                  <SelectTrigger
                    id={`salary-filter-${name}`}
                    className="w-full"
                  >
                    <SelectValue>
                      {
                        Object.entries(options[name]).find(
                          ([value]) => value === field.state.value,
                        )?.[1]
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(options[name]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
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
