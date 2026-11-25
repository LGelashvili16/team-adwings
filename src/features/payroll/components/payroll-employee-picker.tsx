import { useEffect, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import {
  IconChevronDown,
  IconSearch,
  IconAlertCircle,
} from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Field, FieldError, FieldLabel } from '#/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from '#/lib/utils'
import { payrollSearchFormSchema } from '../payroll-search.schemas'
import { payrollEmployeesQuery } from '../payroll-employee.queries'

export function PayrollEmployeePicker({
  actorId,
  id,
  value,
  disabled = false,
  invalid = false,
  className,
  onChange,
}: {
  actorId: string
  id: string
  value: { label: string } | null
  disabled?: boolean
  invalid?: boolean
  className?: string
  onChange: (item: { id: string; label: string; description: string }) => void
}) {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const form = useForm({
    defaultValues: { q: '' },
    validators: {
      onChange: payrollSearchFormSchema,
      onSubmit: payrollSearchFormSchema,
    },
    onSubmit: ({ value: input }) => {
      if (timer.current) clearTimeout(timer.current)
      setQ(input.q.trim())
      setPage(1)
    },
  })
  const query = useQuery({
    ...payrollEmployeesQuery(actorId, { q, page }),
    enabled: open && !disabled,
  })
  const view = query.data?.ok ? query.data.value : null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-description="სავალდებულო ველი"
        aria-invalid={invalid}
        aria-describedby={`${id}-value${invalid ? ` ${id}-error` : ''}`}
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              'h-auto min-h-10 w-full justify-between whitespace-normal text-left',
              className,
            )}
          />
        }
      >
        <span id={`${id}-value`} className="min-w-0 wrap-anywhere">
          {value?.label ?? 'აირჩიეთ თანამშრომელი'}
        </span>
        <IconChevronDown aria-hidden="true" data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-3"
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <form.Field name="q">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel className="sr-only" htmlFor={`${id}-search`}>
                  თანამშრომელი: ძიება
                </FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <IconSearch aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id={`${id}-search`}
                    value={field.state.value}
                    maxLength={100}
                    placeholder="ძიება დასახელებით"
                    onBlur={field.handleBlur}
                    aria-invalid={!field.state.meta.isValid}
                    aria-describedby={
                      !field.state.meta.isValid
                        ? `${id}-search-error`
                        : undefined
                    }
                    onChange={(e) => {
                      field.handleChange(e.target.value)
                      if (timer.current) clearTimeout(timer.current)
                      timer.current = setTimeout(() => {
                        void form.handleSubmit()
                      }, 300)
                    }}
                  />
                </InputGroup>
                <FieldError
                  id={`${id}-search-error`}
                  errors={field.state.meta.errors}
                />
              </Field>
            )}
          </form.Field>
        </form>
        {query.isPending ? (
          <div role="status" aria-busy="true" aria-label="არჩევანი იტვირთება">
            <Skeleton className="h-24" aria-hidden="true" />
          </div>
        ) : !view ? (
          <Alert variant="destructive">
            <IconAlertCircle aria-hidden="true" />
            <AlertDescription>
              {query.data && !query.data.ok
                ? query.data.message
                : 'არჩევანი ვერ ჩაიტვირთა.'}
            </AlertDescription>
          </Alert>
        ) : view.records.length ? (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {view.records.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                className="h-auto min-h-11 justify-start whitespace-normal text-left"
                onClick={() => {
                  onChange(item)
                  setOpen(false)
                }}
              >
                <span className="flex min-w-0 flex-col gap-1 wrap-anywhere">
                  <span>{item.label}</span>
                  {item.description ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            შესაბამისი ჩანაწერი არ მოიძებნა.
          </p>
        )}
        {view ? (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              წინა
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {Math.max(1, Math.ceil(view.total / view.pageSize))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * view.pageSize >= view.total}
              onClick={() => setPage((p) => p + 1)}
            >
              შემდეგი
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
