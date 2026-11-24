import { useEffect, useRef } from 'react'
import { useForm } from '@tanstack/react-form'
import { IconSearch } from '@tabler/icons-react'
import { Field, FieldError, FieldLabel } from '#/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { bonusRuleHistoryFilterSchema } from '../bonus-rules.schemas'

export function PayrollHistorySearch({
  q,
  scope,
  label = 'ცვლილებების ისტორიის ძიება',
  onChange,
}: {
  q: string
  scope: string
  label?: string
  onChange: (q: string) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const form = useForm({
    defaultValues: { q },
    validators: {
      onChange: bonusRuleHistoryFilterSchema,
      onSubmit: bonusRuleHistoryFilterSchema,
    },
    onSubmit: ({ value }) => {
      if (timer.current) clearTimeout(timer.current)
      onChange(value.q.trim())
    },
  })
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (form.state.values.q.trim() !== q) form.reset({ q })
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [form, q, scope])
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="q">
        {(field) => {
          const invalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field className="max-w-md" data-invalid={invalid}>
              <FieldLabel htmlFor="payroll-history-search" className="sr-only">
                {label}
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <IconSearch aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id="payroll-history-search"
                  placeholder="ავტორი ან ცვლილების საფუძველი"
                  maxLength={100}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  aria-invalid={invalid}
                  aria-describedby={
                    invalid ? 'payroll-history-search-error' : undefined
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
                id="payroll-history-search-error"
                errors={field.state.meta.errors}
              />
            </Field>
          )
        }}
      </form.Field>
    </form>
  )
}
