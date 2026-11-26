import { Badge } from '#/components/ui/badge'
import { formatGeorgianDate } from '#/lib/date-format'
import { cn } from '#/lib/utils'
import { payStageLabel } from '../payroll-settings.schemas'
import { formatSalary } from '../salary.presentation'
import type { SalaryStatementPayment } from '../salary.types'

export function PaymentBreakdown({
  payments,
  twice = payments.some((payment) => payment.stage === 'first'),
  recentAfter,
}: {
  payments: SalaryStatementPayment[]
  twice?: boolean
  recentAfter?: number
}) {
  return (
    <ul className="flex flex-col gap-2 text-xs">
      {payments.map((payment) => {
        const recent =
          recentAfter !== undefined && (payment.recentUntil ?? 0) > recentAfter
        return (
          <li
            key={payment.stage}
            className={cn(
              'gap-x-3 gap-y-0.5',
              recentAfter !== undefined
                ? 'grid grid-cols-[minmax(0,1fr)_auto] items-start rounded-lg border bg-muted/30 px-3 py-2'
                : 'flex flex-wrap items-baseline justify-between',
              recent && 'border-badge-green-foreground/20 bg-badge-green/55',
            )}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{payStageLabel(payment.stage, twice)}</span>
                {recent ? (
                  <Badge variant="green">ახლახანს გაცემული</Badge>
                ) : null}
              </div>
              <time className="text-muted-foreground" dateTime={payment.paidOn}>
                {formatGeorgianDate(payment.paidOn)}
              </time>
            </div>
            <strong className="font-medium whitespace-nowrap tabular-nums">
              {formatSalary({ amountMinor: payment.totalMinor })}
            </strong>
          </li>
        )
      })}
    </ul>
  )
}
