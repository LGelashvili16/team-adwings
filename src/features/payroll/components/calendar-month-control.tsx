import { useForm } from '@tanstack/react-form'
import { format } from 'date-fns'
import { ka } from 'date-fns/locale'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  payrollCalendarSearchSchema,
  calendarMonthFormSchema,
} from '../payroll-calendar.schemas'

const years = Array.from({ length: 101 }, (_, index) => String(2000 + index))
const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: format(new Date(2026, index, 1), 'MMMM', { locale: ka }),
}))
export function CalendarMonthControl({
  month,
  onChange,
}: {
  month: string
  onChange: (value: string) => void
}) {
  const form = useForm({
    defaultValues: { year: month.slice(0, 4), month: month.slice(5, 7) },
    validators: { onSubmit: calendarMonthFormSchema },
    onSubmit: ({ value }) => {
      const parsed = payrollCalendarSearchSchema.safeParse({
        month: `${value.year}-${value.month}`,
      })
      if (parsed.success && parsed.data.month) onChange(parsed.data.month)
    },
  })
  const shift = (offset: number) => {
    const date = new Date(`${month}-01T12:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() + offset)
    const next = date.toISOString().slice(0, 7)
    if (payrollCalendarSearchSchema.safeParse({ month: next }).success)
      onChange(next)
  }
  return (
    <form
      className="w-full min-w-0 sm:w-88"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="flex flex-row items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="წინა თვე"
          disabled={month === '2000-01'}
          onClick={() => shift(-1)}
        >
          <IconChevronLeft aria-hidden="true" />
        </Button>
        {(['month', 'year'] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Field
                className={
                  name === 'month' ? 'min-w-0 flex-1' : 'w-24 shrink-0'
                }
              >
                <FieldLabel
                  htmlFor={`payroll-calendar-${name}`}
                  className="sr-only"
                >
                  {name === 'month' ? 'თვე' : 'წელი'}
                </FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => {
                    const parsed = calendarMonthFormSchema.safeParse({
                      ...form.state.values,
                      [name]: value,
                    })
                    if (parsed.success) {
                      field.handleChange(parsed.data[name])
                      void form.handleSubmit()
                    }
                  }}
                >
                  <SelectTrigger
                    id={`payroll-calendar-${name}`}
                    className="w-full"
                  >
                    <SelectValue>
                      {name === 'month'
                        ? months.find(
                            (option) => option.value === field.state.value,
                          )?.label
                        : field.state.value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(name === 'month'
                        ? months
                        : years.map((year) => ({ value: year, label: year }))
                      ).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
        ))}
        <Button
          variant="outline"
          size="icon"
          aria-label="შემდეგი თვე"
          disabled={month === '2100-12'}
          onClick={() => shift(1)}
        >
          <IconChevronRight aria-hidden="true" />
        </Button>
      </FieldGroup>
    </form>
  )
}
