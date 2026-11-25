import { IconCalendarClock, IconWallet } from '@tabler/icons-react'
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
}: {
  term: SalaryTerm
  scheduled?: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p
          className={cn(
            'min-w-0 wrap-anywhere font-semibold tracking-tight tabular-nums',
            scheduled ? 'text-2xl' : 'text-3xl sm:text-4xl',
          )}
        >
          {formatSalary(term)}
        </p>
        <span className="text-sm text-muted-foreground">
          {term.kind === 'monthly' ? 'თვეში' : 'საათში'}
        </span>
      </div>
      <Badge
        variant={scheduled ? 'outline' : 'green'}
        className="h-auto max-w-full whitespace-normal"
      >
        {salaryKindLabels[term.kind]}
      </Badge>
      <dl className="grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">თანხის საფუძველი</dt>
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
    </>
  )
}

export function SalarySummary({
  employee,
  highlightCurrent = false,
}: {
  employee: SalaryEmployee
  highlightCurrent?: boolean
}) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card
        className={cn(
          'min-w-0 rounded-2xl sm:[--card-spacing:--spacing(5)]',
          highlightCurrent && 'bg-linear-to-br from-accent/65 via-card to-card',
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
            <SalaryTermSummary term={employee.current} />
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
          {employee.next ? (
            <SalaryTermSummary term={employee.next} scheduled />
          ) : (
            <p className="w-full rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              მომდევნო ცვლილება არ არის დაგეგმილი.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
