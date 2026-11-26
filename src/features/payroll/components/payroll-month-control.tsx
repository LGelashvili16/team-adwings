import { useState } from 'react'
import { format } from 'date-fns'
import { ka } from 'date-fns/locale'
import { IconCalendar } from '@tabler/icons-react'
import { formatGeorgianMonth } from '#/lib/date-format'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { payrollMonthSchema } from '../monthly.schemas'

function monthDate(month: string) {
  return new Date(`${month}-01T12:00:00`)
}

export function PayrollMonthControl({
  month,
  onChange,
  placeholder,
  id = 'payroll-month',
  invalid = false,
  required = false,
}: {
  month: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  invalid?: boolean
  required?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => monthDate(month))
  const label = placeholder ?? formatGeorgianMonth(month)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(monthDate(month))
        setOpen(next)
      }}
    >
      <PopoverTrigger
        id={id}
        aria-label={`სახელფასო თვე: ${label}`}
        aria-description={required ? 'სავალდებულო ველი' : undefined}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        render={
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-full border-input bg-white px-3 font-normal dark:bg-input/30 dark:shadow-control-raised dark:active:shadow-control-pressed md:h-9 md:w-auto"
          />
        }
      >
        <IconCalendar aria-hidden="true" data-icon="inline-start" />
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-[calc(100vw-2rem)] gap-2 p-2"
      >
        <Calendar
          className="[--cell-size:--spacing(9)]"
          month={draft}
          onMonthChange={setDraft}
          startMonth={new Date(2000, 0, 1)}
          endMonth={new Date(2100, 11, 1)}
          captionLayout="dropdown"
          showOutsideDays={false}
          locale={ka}
          formatters={{
            formatMonthDropdown: (date) => format(date, 'MMMM', { locale: ka }),
            formatWeekdayName: (day) => format(day, 'EEEEEE', { locale: ka }),
          }}
          labels={{
            labelNav: () => 'თვეების ნავიგაცია',
            labelPrevious: () => 'წინა თვე',
            labelNext: () => 'შემდეგი თვე',
            labelMonthDropdown: () => 'თვე',
            labelYearDropdown: () => 'წელი',
            labelGrid: (date) => format(date, 'MMMM yyyy', { locale: ka }),
          }}
        />
        <Button
          type="button"
          size="sm"
          className="w-full"
          onClick={() => {
            const selected = payrollMonthSchema.safeParse(
              format(draft, 'yyyy-MM'),
            )
            if (!selected.success) return
            setOpen(false)
            if (placeholder || selected.data !== month) onChange(selected.data)
          }}
        >
          თვის არჩევა
        </Button>
      </PopoverContent>
    </Popover>
  )
}
