import { useState } from 'react'
import { format } from 'date-fns'
import { ka } from 'date-fns/locale'
import { IconCalendar, IconX } from '@tabler/icons-react'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { formatGeorgianDate } from '#/lib/date-format'

/** Calendar dates stay date-only; local noon avoids midnight timezone shifts. */
export function DatePicker({
  id,
  value,
  today,
  minimum,
  disabled,
  invalid,
  required,
  clearLabel = 'დასრულების თარიღის გასუფთავება',
  onChange,
  onBlur,
}: {
  id: string
  value: string
  today?: string
  minimum?: string
  disabled?: boolean
  invalid: boolean
  required?: boolean
  clearLabel?: string
  onChange: (value: string) => void
  onBlur: () => void
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(`${value}T12:00:00`) : undefined
  return (
    <div className="flex min-w-0 gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) onBlur()
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="min-w-0 flex-1 justify-start whitespace-normal text-left"
            />
          }
          id={id}
          disabled={disabled}
          aria-description={required ? 'სავალდებულო ველი' : undefined}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
        >
          <IconCalendar aria-hidden="true" data-icon="inline-start" />
          {value ? formatGeorgianDate(value) : 'აირჩიეთ თარიღი'}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <Calendar
            className="[--cell-size:--spacing(10)] sm:[--cell-size:--spacing(8)]"
            mode="single"
            locale={ka}
            captionLayout="dropdown"
            selected={selected}
            disabled={
              minimum ? { before: new Date(`${minimum}T00:00:00`) } : undefined
            }
            defaultMonth={
              selected ?? (today ? new Date(`${today}T12:00:00`) : undefined)
            }
            startMonth={new Date(1900, 0, 1)}
            endMonth={new Date(2100, 11, 31)}
            formatters={{
              formatCaption: (month) =>
                format(month, 'MMMM yyyy', { locale: ka }),
              formatWeekdayName: (day) => format(day, 'EEEEEE', { locale: ka }),
              formatMonthDropdown: (month) =>
                format(month, 'MMMM', { locale: ka }),
            }}
            labels={{
              labelNext: () => 'შემდეგი თვე',
              labelPrevious: () => 'წინა თვე',
              labelNav: () => 'თვეების ნავიგაცია',
              labelMonthDropdown: () => 'თვე',
              labelYearDropdown: () => 'წელი',
              labelGrid: (month) => format(month, 'MMMM yyyy', { locale: ka }),
              labelDayButton: (day) =>
                format(day, 'EEEE, d MMMM yyyy', { locale: ka }),
            }}
            onSelect={(day) => {
              if (!day) return
              onChange(format(day, 'yyyy-MM-dd'))
              setOpen(false)
              onBlur()
            }}
          />
        </PopoverContent>
      </Popover>
      {!required && value ? (
        <Button
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={clearLabel}
          onClick={() => {
            onChange('')
            onBlur()
          }}
        >
          <IconX aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
