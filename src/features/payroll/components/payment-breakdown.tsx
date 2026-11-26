import { formatGeorgianDate } from '#/lib/date-format'
import { payStageLabel } from '../payroll-settings.schemas'
import { formatSalary } from '../salary.presentation'
import type { PublishedPayment } from '../monthly.types'

export function PaymentBreakdown({
  payments,
  twice = payments.some((payment) => payment.stage === 'first'),
}: {
  payments: PublishedPayment[]
  twice?: boolean
}) {
  return (
    <ul className="flex flex-col gap-2 text-xs">
      {payments.map((payment) => (
        <li
          key={payment.stage}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
        >
          <div className="flex flex-col gap-0.5">
            <span>{payStageLabel(payment.stage, twice)}</span>
            <time className="text-muted-foreground" dateTime={payment.paidOn}>
              {formatGeorgianDate(payment.paidOn)}
            </time>
          </div>
          <strong className="font-medium tabular-nums">
            {formatSalary({ amountMinor: payment.totalMinor })}
          </strong>
        </li>
      ))}
    </ul>
  )
}
