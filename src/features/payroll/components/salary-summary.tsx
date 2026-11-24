import { IconCalendarClock, IconWallet } from '@tabler/icons-react'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { formatGeorgianDate } from '#/lib/date-format'
import {
  formatSalary,
  salaryKindLabels,
  salaryBasisLabels,
} from '../salary.presentation'
import type { SalaryEmployee } from '../salary.types'

export function SalarySummary({ employee }: { employee: SalaryEmployee }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconWallet
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <h2>მოქმედი ხელფასი</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {employee.current ? (
            <>
              <div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatSalary(employee.current)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {employee.current.kind === 'monthly' ? 'თვეში' : 'საათში'}
                  </span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {salaryBasisLabels[employee.current.amountBasis]}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="green">
                  {salaryKindLabels[employee.current.kind]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatGeorgianDate(employee.current.effectiveFrom)} თარიღიდან
                </span>
              </div>
            </>
          ) : (
            <>
              <Badge variant="yellow">ხელფასი არ არის განსაზღვრული</Badge>
              <p className="text-sm leading-6 text-muted-foreground">
                ამ თარიღისთვის ხელფასი მითითებული არ არის. დასაზუსტებლად
                მიმართეთ ბუღალტერს ან ადმინისტრატორს.
              </p>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconCalendarClock
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <h2>დაგეგმილი ცვლილება</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {employee.next ? (
            <>
              <p className="text-2xl font-semibold tabular-nums">
                {formatSalary(employee.next)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {employee.next.kind === 'monthly' ? 'თვეში' : 'საათში'}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {salaryKindLabels[employee.next.kind]} ·{' '}
                {salaryBasisLabels[employee.next.amountBasis]}
              </p>
              <p className="text-sm">
                ამოქმედდება {formatGeorgianDate(employee.next.effectiveFrom)}{' '}
                თარიღიდან
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              მომდევნო ცვლილება არ არის დაგეგმილი.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
