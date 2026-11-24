import { useEffect, useRef } from 'react'
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
import {
  bonusRuleFilterSchema,
  bonusRuleSearchSchema,
} from '../bonus-rules.schemas'
import type { BonusRuleSearch } from '../bonus-rules.schemas'

const options = {
  kind: { all: 'ყველა ტიპი', bonus: 'ბონუსები', premium: 'პრემიები' },
  sort: { name: 'დასახელებით: ა-ჰ', name_desc: 'დასახელებით: ჰ-ა' },
}
export function BonusRuleFilters({
  search,
  onChange,
}: {
  search: BonusRuleSearch
  onChange: (next: BonusRuleSearch) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const form = useForm({
    defaultValues: { q: search.q, kind: search.kind, sort: search.sort },
    validators: {
      onChange: bonusRuleFilterSchema,
      onSubmit: bonusRuleFilterSchema,
    },
    onSubmit: ({ value }) => {
      if (timer.current) clearTimeout(timer.current)
      onChange(bonusRuleSearchSchema.parse({ ...value, page: 1 }))
    },
  })
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    form.reset({ q: search.q, kind: search.kind, sort: search.sort })
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [form, search.q, search.kind, search.sort])
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="flex flex-col gap-3 sm:flex-row">
        <form.Field name="q">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field className="min-w-0 sm:flex-1" data-invalid={invalid}>
                <FieldLabel htmlFor="bonus-rule-search" className="sr-only">
                  წახალისების წესის ძიება
                </FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <IconSearch aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="bonus-rule-search"
                    placeholder="წესის დასახელება"
                    maxLength={100}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    aria-invalid={invalid}
                    aria-describedby={
                      invalid ? 'bonus-rule-search-error' : undefined
                    }
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
                  id="bonus-rule-search-error"
                  errors={field.state.meta.errors}
                />
              </Field>
            )
          }}
        </form.Field>
        {(['kind', 'sort'] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Field className="sm:w-auto">
                <FieldLabel
                  htmlFor={`bonus-rule-filter-${name}`}
                  className="sr-only"
                >
                  {name === 'kind'
                    ? 'წახალისების ტიპის ფილტრი'
                    : 'წესების დალაგება'}
                </FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => {
                    const parsed = bonusRuleSearchSchema.safeParse({
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
                    id={`bonus-rule-filter-${name}`}
                    className="w-full"
                  >
                    <SelectValue>
                      {
                        Object.entries(options[name]).find(
                          ([key]) => key === field.state.value,
                        )?.[1]
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(options[name]).map(([key, label]) => (
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
