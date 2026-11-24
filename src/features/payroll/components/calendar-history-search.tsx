import { useEffect, useRef } from 'react'
import { useForm } from '@tanstack/react-form'
import { IconSearch } from '@tabler/icons-react'
import { Field, FieldError, FieldLabel } from '#/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { calendarPeopleFormSchema } from '../payroll-calendar.schemas'

export function CalendarHistorySearch({
  q,
  scope,
  onChange,
}: {
  q: string
  scope: string
  onChange: (q: string) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const form = useForm({
    defaultValues: { q },
    validators: {
      onChange: calendarPeopleFormSchema,
      onSubmit: calendarPeopleFormSchema,
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
        {(field) => (
          <Field className="max-w-md" data-invalid={!field.state.meta.isValid}>
            <FieldLabel htmlFor="calendar-history-q" className="sr-only">
              ცვლილებების ისტორიის ძიება
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <IconSearch aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id="calendar-history-q"
                placeholder="ავტორი ან ცვლილების საფუძველი"
                maxLength={100}
                value={field.state.value}
                onBlur={field.handleBlur}
                aria-invalid={!field.state.meta.isValid}
                aria-describedby={
                  !field.state.meta.isValid
                    ? 'calendar-history-q-error'
                    : undefined
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
              id="calendar-history-q-error"
              errors={field.state.meta.errors}
            />
          </Field>
        )}
      </form.Field>
    </form>
  )
}
