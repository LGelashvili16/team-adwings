import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { useForm } from '@tanstack/react-form'
import {
  IconAdjustmentsHorizontal,
  IconCalendarMonth,
  IconCircleHalf2,
  IconSearch,
} from '@tabler/icons-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
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
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Spinner } from '#/components/ui/spinner'
import { useIsMobile } from '#/hooks/use-mobile'
import { formatGeorgianMonth } from '#/lib/date-format'
import { monthlyPeriodSchema, monthlySearchSchema } from '../monthly.schemas'
import { PayrollMonthControl } from './payroll-month-control'
import type { ReactNode } from 'react'
import type { MonthlySearch } from '../monthly.schemas'

const schema = z.object({
  q: monthlySearchSchema.shape.q.removeDefault(),
  sort: monthlySearchSchema.shape.sort.removeDefault(),
  period: monthlyPeriodSchema.optional(),
})
const periods = {
  all: 'მთელი თვე',
  first: 'პირველი ნაწილი',
  salary: 'მეორე ნაწილი',
} as const
const compactPeriods = { all: 'თვე', first: '1/2', salary: '2/2' } as const
export function MonthlyFilters({
  search,
  onChange,
  payrollMonth,
  payrollPeriod,
  isPeriodLoading,
  onMonthChange,
  children,
  periodPanelId,
}: {
  search: MonthlySearch
  onChange: (search: MonthlySearch) => void
  payrollMonth?: string
  payrollPeriod?: MonthlySearch['period']
  isPeriodLoading: boolean
  onMonthChange: (month: string) => void
  children: ReactNode
  periodPanelId?: string
}) {
  const isMobile = useIsMobile()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const defaultValues: z.input<typeof schema> = {
    q: search.q,
    sort: search.sort,
    period: search.period,
  }
  const form = useForm({
    defaultValues,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: ({ value }) => {
      if (timer.current) clearTimeout(timer.current)
      onChange({
        ...search,
        ...value,
        period: periodPanelId ? value.period : undefined,
        page: 1,
      })
    },
  })
  const { q, sort, page, month, view, period } = search
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (
      form.state.values.q.trim() !== q ||
      form.state.values.sort !== sort ||
      form.state.values.period !== period
    ) {
      form.reset({ q, sort, period })
    }
  }, [form, q, sort, page, month, view, period])
  const fields = (
    <>
      <form.Field name="q">
        {(field) => (
          <Field
            className="min-w-0 md:w-64 md:min-w-44"
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
                  !field.state.meta.isValid ? 'monthly-search-error' : undefined
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
      {payrollMonth ? (
        <PayrollMonthControl month={payrollMonth} onChange={onMonthChange} />
      ) : null}
      <form.Field name="sort">
        {(field) => (
          <Field className="md:w-max md:shrink-0">
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
                className="w-full rounded-full px-3 dark:shadow-control-raised dark:active:shadow-control-pressed data-[size=default]:h-11 md:data-[size=default]:h-9"
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
    </>
  )

  return (
    <form
      aria-label="სახელფასო ფილტრები"
      className="flex min-w-0 flex-col gap-2 md:-m-1 md:flex-row md:items-start md:overflow-x-auto md:p-1"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      {isMobile ? (
        <div className="w-full rounded-xl border bg-card px-3.5">
          <Accordion>
            <AccordionItem value="filters">
              <AccordionTrigger className="items-center gap-3 py-3 hover:no-underline">
                <span className="flex shrink-0 items-center gap-2 font-medium">
                  <IconAdjustmentsHorizontal
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  ფილტრები
                </span>
                {payrollMonth ? (
                  <span className="ml-auto text-right text-xs text-muted-foreground">
                    {formatGeorgianMonth(payrollMonth)}
                  </span>
                ) : null}
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-3.5">
                <FieldGroup className="gap-2">{fields}</FieldGroup>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      ) : (
        fields
      )}
      {periodPanelId ? (
        <form.Field name="period">
          {(field) => {
            const selectPeriod = (value: unknown) => {
              const selected = monthlyPeriodSchema.safeParse(value)
              if (selected.success && selected.data !== field.state.value) {
                field.handleChange(selected.data)
                void form.handleSubmit()
              }
            }
            return (
              <Tabs
                className="w-full shrink-0 md:w-auto"
                value={payrollPeriod ?? field.state.value ?? 'all'}
                onValueChange={selectPeriod}
              >
                <TabsList
                  aria-label="სახელფასო პერიოდი"
                  activateOnFocus={false}
                  className="w-full gap-0.5 group-data-horizontal/tabs:h-11 md:w-max md:group-data-horizontal/tabs:h-9"
                >
                  {monthlyPeriodSchema.options.map((value) => (
                    <TabsTrigger
                      key={value}
                      id={`${periodPanelId}-${value}`}
                      value={value}
                      type="button"
                      aria-label={
                        value === 'all'
                          ? periods[value]
                          : `${compactPeriods[value]} ${periods[value]}`
                      }
                      aria-controls={periodPanelId}
                      onClick={
                        isPeriodLoading && value === payrollPeriod
                          ? () => selectPeriod(value)
                          : undefined
                      }
                      className="px-2 text-xs tabular-nums"
                    >
                      {isPeriodLoading && value === search.period ? (
                        <Spinner className="size-3.5" aria-hidden="true" />
                      ) : value === 'all' ? (
                        <IconCalendarMonth
                          className="size-3.5"
                          aria-hidden="true"
                        />
                      ) : (
                        <IconCircleHalf2
                          className={
                            value === 'first'
                              ? 'size-3.5 -scale-x-100'
                              : 'size-3.5'
                          }
                          aria-hidden="true"
                        />
                      )}
                      {compactPeriods[value]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )
          }}
        </form.Field>
      ) : null}
      {children}
    </form>
  )
}
