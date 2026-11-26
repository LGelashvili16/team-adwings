import { DatePicker } from '#/components/common/date-picker'
import { Field, FieldLabel } from '#/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Switch } from '#/components/ui/switch'
import { weekdayLabels } from '#/features/scheduling/components/schedule-week-editor'
import { workLocationLabel } from '#/features/scheduling/scheduling.content'
import type {
  WorkingWeek,
  WorkLocationPlan,
} from '#/features/scheduling/scheduling.types'

export function RecurringWorkLocationFields({
  idPrefix,
  week,
  value,
  disabled,
  onChange,
}: {
  idPrefix: string
  week: WorkingWeek
  value: Array<number>
  disabled: boolean
  onChange: (weekdays: Array<number>) => void
}) {
  const workingDays = week
    .filter((day) => day.hours)
    .sort((a, b) => a.weekday - b.weekday)
  if (!workingDays.length) return null
  const configuredDays = value.filter((weekday) =>
    workingDays.some((day) => day.weekday === weekday),
  )
  return (
    <fieldset className="min-w-0 rounded-xl border px-3 pb-1">
      <legend className="px-1 text-sm font-medium">
        ყოველკვირეული სამუშაო ადგილი
      </legend>
      <div className="divide-y">
        {workingDays.map(({ weekday }) => {
          const id = `${idPrefix}-remote-${weekday}`
          const remote = value.includes(weekday)
          return (
            <Field
              key={weekday}
              orientation="horizontal"
              className="min-h-11 gap-3 py-2"
            >
              <FieldLabel htmlFor={id} className="grow">
                {weekdayLabels[weekday - 1]}
              </FieldLabel>
              <span
                className="text-xs text-muted-foreground"
                aria-hidden="true"
              >
                {workLocationLabel(remote)}
              </span>
              <Switch
                id={id}
                aria-label={`${weekdayLabels[weekday - 1]}, დისტანციურად`}
                checked={remote}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...configuredDays, weekday].sort()
                      : configuredDays.filter((day) => day !== weekday),
                  )
                }
              />
            </Field>
          )
        })}
      </div>
    </fieldset>
  )
}

type Override = { date: string; remote: boolean | null }

export function DatedWorkLocationField({
  plan,
  value,
  disabled,
  invalid,
  onChange,
  onBlur,
}: {
  plan: WorkLocationPlan
  value?: Override
  disabled: boolean
  invalid: boolean
  onChange: (override: Override | undefined) => void
  onBlur: () => void
}) {
  const modes = {
    remote: workLocationLabel(true),
    on_site: workLocationLabel(false),
    recurring: 'ყოველკვირეული განრიგის მიხედვით',
  }
  const selection =
    value?.remote === null ? 'recurring' : value?.remote ? 'remote' : 'on_site'
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-medium">
        სამუშაო ადგილის შეცვლა კონკრეტულ დღეს
      </legend>
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="work-location-date">თარიღი</FieldLabel>
        <DatePicker
          id="work-location-date"
          value={value?.date ?? ''}
          today={plan.today}
          minimum={plan.today}
          disabled={disabled}
          invalid={invalid}
          clearLabel="თარიღის გასუფთავება"
          onChange={(date) =>
            onChange(
              date
                ? {
                    date,
                    remote:
                      plan.overrides.find((override) => override.date === date)
                        ?.remote ?? true,
                  }
                : undefined,
            )
          }
          onBlur={onBlur}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="dated-work-location">სამუშაო ადგილი</FieldLabel>
        <Select
          value={value ? selection : null}
          disabled={!value || disabled}
          onValueChange={(mode) => {
            if (value && mode)
              onChange({
                ...value,
                remote: mode === 'recurring' ? null : mode === 'remote',
              })
          }}
        >
          <SelectTrigger
            id="dated-work-location"
            className="min-h-10 w-full whitespace-normal data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none"
          >
            <SelectValue
              className="min-w-0 wrap-anywhere"
              placeholder="აირჩიეთ თარიღი"
            >
              {value ? modes[selection] : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            align="end"
            alignItemWithTrigger={false}
            className="w-max min-w-(--anchor-width) max-w-(--available-width)"
          >
            {Object.entries(modes).map(([mode, label]) => (
              <SelectItem key={mode} value={mode}>
                <span className="min-w-0 whitespace-normal wrap-anywhere">
                  {label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </fieldset>
  )
}
