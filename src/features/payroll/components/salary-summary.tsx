import type { ReactNode } from 'react'
import { IconCalendarClock, IconWallet } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { formatGeorgianDate } from '#/lib/date-format'
import { cn } from '#/lib/utils'
import {
  formatSalary,
  salaryKindLabels,
  salaryBasisLabels,
} from '../salary.presentation'
import type { SalaryEmployee, SalaryTerm } from '../salary.types'

function SalaryTermSummary({
  term,
  scheduled = false,
  personal = false,
}: {
  term: SalaryTerm
  scheduled?: boolean
  personal?: boolean
}) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-3',
        personal &&
          'gap-5 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end',
      )}
    >
      <div className="flex min-w-0 flex-col items-start gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p
            className={cn(
              'min-w-0 wrap-anywhere font-semibold tracking-tight tabular-nums',
              scheduled ? 'text-2xl' : 'text-3xl sm:text-4xl',
              personal && 'text-4xl leading-none sm:text-5xl',
            )}
          >
            {formatSalary(term)}
          </p>
          <span className="text-sm text-muted-foreground">
            {term.kind === 'monthly' ? 'თვეში' : 'საათში'}
          </span>
        </div>
        {!personal ? (
          <Badge
            variant={scheduled ? 'outline' : 'green'}
            className="h-auto max-w-full whitespace-normal"
          >
            {salaryKindLabels[term.kind]}
          </Badge>
        ) : null}
      </div>
      <dl
        className={cn(
          'grid gap-3',
          personal
            ? 'grid-cols-2 gap-x-4 rounded-xl border bg-muted/35 p-3 sm:gap-x-6 sm:px-4'
            : 'border-t border-border/70 pt-4 sm:grid-cols-2',
        )}
      >
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">თანხის ტიპი</dt>
          <dd className="mt-1 wrap-anywhere font-medium">
            {salaryBasisLabels[term.amountBasis]}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">ამოქმედების თარიღი</dt>
          <dd className="mt-1 font-medium tabular-nums">
            <time dateTime={term.effectiveFrom}>
              {formatGeorgianDate(term.effectiveFrom)}
            </time>
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function SalarySummary({
  employee,
  personal = false,
  extra,
}: {
  employee: SalaryEmployee
  personal?: boolean
  extra?: ReactNode
}) {
  const next = employee.next
  return (
    <div
      className={cn(
        'grid min-w-0 gap-4',
        !personal &&
          (extra
            ? 'lg:grid-cols-3'
            : 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'),
      )}
    >
      <Card
        className={cn(
          'min-w-0 rounded-2xl sm:[--card-spacing:--spacing(5)]',
          personal && 'gap-4 sm:[--card-spacing:--spacing(6)]',
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <IconWallet className="size-5" aria-hidden="true" />
            </span>
            <h2>მოქმედი ხელფასი</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3 [&>dl]:w-full">
          {employee.current ? (
            <SalaryTermSummary term={employee.current} personal={personal} />
          ) : (
            <>
              <Badge
                variant="yellow"
                className="h-auto max-w-full whitespace-normal"
              >
                ხელფასი არ არის განსაზღვრული
              </Badge>
              <p className="text-sm leading-6 text-muted-foreground">
                ამ თარიღისთვის ხელფასი მითითებული არ არის. დასაზუსტებლად
                მიმართეთ ბუღალტერს ან ადმინისტრატორს.
              </p>
            </>
          )}
        </CardContent>
      </Card>
      {personal ? (
        next && (
          <Alert role="status" className="rounded-xl px-4 py-3 sm:px-5">
            <IconCalendarClock aria-hidden="true" />
            <AlertTitle>დაგეგმილი ცვლილება</AlertTitle>
            <AlertDescription className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                ამოქმედების თარიღი{' '}
                <time dateTime={next.effectiveFrom}>
                  {formatGeorgianDate(next.effectiveFrom)}
                </time>
              </span>
              <strong className="font-medium text-foreground tabular-nums">
                {formatSalary(next)}{' '}
                {next.kind === 'monthly' ? 'თვეში' : 'საათში'} ·{' '}
                {salaryBasisLabels[next.amountBasis]}
              </strong>
            </AlertDescription>
          </Alert>
        )
      ) : (
        <Card className="min-w-0 rounded-2xl sm:[--card-spacing:--spacing(5)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <IconCalendarClock className="size-5" aria-hidden="true" />
              </span>
              <h2>დაგეგმილი ცვლილება</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3 [&>dl]:w-full">
            {next ? (
              <SalaryTermSummary term={next} scheduled />
            ) : (
              <p className="w-full rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                მომდევნო ცვლილება არ არის დაგეგმილი.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {!personal ? extra : null}
    </div>
  )
}
