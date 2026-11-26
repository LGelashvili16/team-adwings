import { IconHistory } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { DataPagination } from '#/components/common/data-pagination'
import { formatGeorgianDateTime } from '#/lib/date-format'
import { formatWorkedTime } from '#/features/attendance/attendance.rules'
import { monthlyAdjustmentLabels, monthlySalaryLabels } from '../monthly.rules'
import { formatSalary, salaryKindLabels } from '../salary.presentation'
import type { MonthlyDetail } from '../monthly.types'

const statuses = {
  draft: { label: 'მონახაზი', variant: 'secondary' },
  finalized: { label: 'დასრულებული', variant: 'green' },
  voided: { label: 'ამოღებული', variant: 'red' },
} as const

export function MonthlyEntryHistory({
  view,
  page,
  onPageChange,
  busy,
  disabled,
}: {
  view: Pick<MonthlyDetail, 'history' | 'total' | 'pageSize' | 'timezone'>
  page: number
  onPageChange: (page: number) => void
  busy: boolean
  disabled: boolean
}) {
  if (!view.history.length) {
    return (
      <Empty className="rounded-xl border border-dashed">
        <EmptyHeader>
          <EmptyMedia>
            <IconHistory aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>ცვლილებები ჯერ არ არის</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-4" aria-busy={busy || undefined}>
      <ul className="flex flex-col gap-3">
        {view.history.map((item) => {
          const status = statuses[item.status]
          return (
            <li
              key={item.version}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col items-start gap-1.5">
                  <Badge variant={status.variant}>
                    {status.label} · {item.version}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {item.actorName} ·{' '}
                    <time dateTime={item.recordedAt}>
                      {formatGeorgianDateTime(item.recordedAt, view.timezone)}
                    </time>
                  </p>
                </div>
                <strong className="text-base font-semibold tabular-nums">
                  {formatSalary({ amountMinor: item.totalMinor })}
                </strong>
              </div>
              <p className="wrap-anywhere">{item.reason}</p>
              <p className="text-muted-foreground">
                {item.salary ? (
                  <>
                    {salaryKindLabels[item.salary.kind]}:{' '}
                    {formatSalary(item.salary)}
                    {item.salary.kind === 'hourly'
                      ? ` · დადასტურებული დრო: ${formatWorkedTime(item.workedSeconds)}`
                      : null}
                  </>
                ) : (
                  'თვის ხელფასი დასადასტურებელია.'
                )}
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-muted/35 p-3 sm:grid-cols-4">
                {(
                  [
                    [
                      monthlySalaryLabels.all,
                      item.salary ? item.baseMinor : null,
                    ],
                    ['ბონუსი', item.bonusMinor],
                    ['პრემია', item.premiumMinor],
                    ['ჯარიმა', item.fineMinor],
                  ] as const
                ).map(([label, amount]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">
                      {amount === null
                        ? '—'
                        : formatSalary({ amountMinor: amount })}
                    </dd>
                  </div>
                ))}
              </dl>
              {item.baseReason ? (
                <p className="wrap-anywhere">{item.baseReason}</p>
              ) : null}
              {item.adjustments.length ? (
                <ul className="flex flex-col gap-1.5 border-t pt-3">
                  {item.adjustments.map((adjustment, index) => (
                    <li
                      key={index}
                      className="flex flex-wrap justify-between gap-x-3 gap-y-1"
                    >
                      <span className="min-w-0 flex-1 wrap-anywhere">
                        {monthlyAdjustmentLabels[adjustment.kind]}
                        {adjustment.reason ? (
                          <span className="block text-muted-foreground">
                            {adjustment.reason}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatSalary(adjustment)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
      {view.total > view.pageSize ? (
        <DataPagination
          page={page}
          total={view.total}
          pageSize={view.pageSize}
          renderLink={(next) => (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => onPageChange(next)}
            />
          )}
        />
      ) : null}
    </div>
  )
}
