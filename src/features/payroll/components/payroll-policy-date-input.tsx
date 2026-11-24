import { useState } from 'react'
import { format } from 'date-fns'
import { ka } from 'date-fns/locale'
import { IconCalendar } from '@tabler/icons-react'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'

export function PayrollPolicyDateInput({
  value,
  minimum,
  invalid,
  onChange,
  onBlur,
}: {
  value: string
  minimum: string
  invalid: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  const [open, setOpen] = useState(false)
  const selected = new Date(`${value}T12:00:00`)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur()
      }}
    >
      <PopoverTrigger
        render={<Button variant="outline" className="w-full justify-start" />}
        id="payroll-effectiveFrom"
        aria-description="სავალდებულო ველი"
        aria-invalid={invalid}
        aria-describedby={invalid ? 'payroll-effectiveFrom-error' : undefined}
      >
        <IconCalendar aria-hidden="true" data-icon="inline-start" />
        {format(selected, 'd MMMM yyyy', { locale: ka })}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <Calendar
          mode="single"
          locale={ka}
          selected={selected}
          defaultMonth={selected}
          disabled={{ before: new Date(`${minimum}T00:00:00`) }}
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
  )
}
