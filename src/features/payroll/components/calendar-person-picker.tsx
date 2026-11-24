import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { IconSearch, IconUsers } from '@tabler/icons-react'
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
import { calendarPeopleFormSchema } from '../payroll-calendar.schemas'
import { calendarPeopleQuery } from '../payroll-calendar.queries'
import type { CalendarPerson } from '../payroll-calendar.types'

export function CalendarPersonPicker({
  actorId,
  person,
  onChange,
}: {
  actorId: string
  person: CalendarPerson | null
  onChange: (userId: string | null) => void
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
      onChange: calendarPeopleFormSchema,
      onSubmit: calendarPeopleFormSchema,
    },
    onSubmit: ({ value }) => {
      setPage(1)
      setQ(value.q.trim())
    },
  })
  const query = useQuery({
    ...calendarPeopleQuery(actorId, q, page),
    enabled: open,
  })
  const view = query.data?.ok ? query.data.value : null
  const choose = (userId: string | null) => {
    onChange(userId)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="max-w-full justify-start whitespace-normal text-left"
          />
        }
      >
        <IconUsers data-icon="inline-start" aria-hidden="true" />
        {person?.name ?? 'კომპანიის კალენდარი'}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3"
      >
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => choose(null)}
        >
          კომპანიის კალენდარი
        </Button>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (timer.current) clearTimeout(timer.current)
            void form.handleSubmit()
          }}
        >
          <form.Field name="q">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor="calendar-person-q" className="sr-only">
                  თანამშრომლის ძიება
                </FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <IconSearch aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="calendar-person-q"
                    placeholder="სახელი ან მომხმარებლის სახელი"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    maxLength={100}
                    aria-invalid={!field.state.meta.isValid}
                    aria-describedby={
                      !field.state.meta.isValid
                        ? 'calendar-person-q-error'
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
                  id="calendar-person-q-error"
                  errors={field.state.meta.errors}
                />
              </Field>
            )}
          </form.Field>
        </form>
        {query.isPending ? (
          <div
            role="status"
            aria-label="თანამშრომლები იტვირთება"
            aria-busy="true"
          >
            <Skeleton className="h-36" aria-hidden="true" />
          </div>
        ) : !view ? (
          <p role="alert" className="text-sm text-destructive">
            თანამშრომლები ვერ ჩაიტვირთა. დახურეთ და ხელახლა გახსენით სია.
          </p>
        ) : (
          <>
            <div
              className="flex max-h-64 flex-col gap-1 overflow-y-auto"
              aria-label="თანამშრომლები"
            >
              {view.records.map((record) => (
                <Button
                  key={record.userId}
                  variant="ghost"
                  className="h-auto min-h-11 w-full flex-col items-start gap-1 py-2 text-left whitespace-normal"
                  onClick={() => choose(record.userId)}
                >
                  <span className="wrap-anywhere">{record.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {record.username
                      ? `@${record.username}`
                      : (record.jobTitle ?? 'თანამდებობა არ არის მითითებული')}
                  </span>
                </Button>
              ))}
              {!view.records.length ? (
                <p className="py-4 text-sm text-muted-foreground">
                  თანამშრომელი ვერ მოიძებნა.
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                წინა
              </Button>
              <p className="text-xs text-muted-foreground">
                {page} / {Math.max(1, Math.ceil(view.total / view.pageSize))}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={page * view.pageSize >= view.total}
                onClick={() => setPage(page + 1)}
              >
                შემდეგი
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
