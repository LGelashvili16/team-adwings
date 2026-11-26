import type { MonthlyAdjustment } from './monthly.schemas'
import type { MonthlyDirectory, MonthlyDirectoryRow } from './monthly.types'
import type { PaymentWindow, PayStage } from './payroll-settings.schemas'

export function monthlyBounds(month: string) {
  const last = new Date(`${month}-01T12:00:00Z`)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  return { start: `${month}-01`, end: last.toISOString().slice(0, 10) }
}
export function paymentWindow(month: string, window: PaymentWindow) {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 1 + window.offset, 1))
  const datePrefix = first.toISOString().slice(0, 7)
  const last = Number(monthlyBounds(datePrefix).end.slice(-2))
  const day = (value: number) =>
    `${datePrefix}-${String(Math.min(last, value)).padStart(2, '0')}`
  return { start: day(window.start), end: day(window.end) }
}

export function paymentDateIssue(
  month: string,
  date: string,
  opening?: string,
) {
  const latest = paymentWindow(month, { offset: 1, start: 1, end: 31 }).end
  if (date < `${month}-01` || date > latest)
    return 'აირჩიეთ თარიღი სახელფასო ან მომდევნო თვეში.'
  if (opening && date < opening)
    return 'თარიღი გრაფიკით დადგენილ საწყის დღეზე ადრე ვერ იქნება.'
  return null
}

export function firstSalaryPayment(baseMinor: number, override: number | null) {
  return override ?? Math.floor(baseMinor / 2)
}
/** Round the exact hourly product once, half up, to integer tetri. */
export function hourlyBase(rateMinor: number, seconds: number) {
  return Number((BigInt(rateMinor) * BigInt(seconds) + 1800n) / 3600n)
}
export function monthlyTotals(
  baseMinor: number,
  adjustments: MonthlyAdjustment[],
) {
  const sum = (kind: MonthlyAdjustment['kind']) =>
    adjustments
      .filter((a) => a.kind === kind)
      .reduce((total, a) => total + a.amountMinor, 0)
  const bonusMinor = sum('bonus'),
    premiumMinor = sum('premium'),
    fineMinor = sum('fine')
  return {
    bonusMinor,
    premiumMinor,
    fineMinor,
    totalMinor: baseMinor + bonusMinor + premiumMinor - fineMinor,
  }
}
export const monthlyAdjustmentLabels = {
  bonus: 'ბონუსი',
  premium: 'პრემია',
  fine: 'ჯარიმა',
} as const

export const monthlySalaryLabels = {
  all: 'ხელფასი(თვე)',
  first: 'ხელფასი(1/2)',
  salary: 'ხელფასი(2/2)',
} as const

export const monthlyAdjustmentColumns = [
  ['bonusMinor', 'ბონუსები'],
  ['premiumMinor', 'პრემიები'],
  ['fineMinor', 'ჯარიმები'],
] as const

export function monthlyPayrollColumns(period: MonthlyDirectory['period']) {
  return [
    ['baseMinor', monthlySalaryLabels[period]],
    ...(period === 'all'
      ? monthlyAdjustmentColumns
      : [monthlyAdjustmentColumns[2]]),
    ['totalMinor', 'ჯამი'],
  ] as const
}

export function monthlyPayrollExportStages({
  period,
  paymentWindows,
}: Pick<MonthlyDirectory, 'period' | 'paymentWindows'>) {
  const split = paymentWindows.some((window) => window.stage === 'first')
  const stageLabels = {
    first: monthlySalaryLabels.first,
    salary:
      split || period === 'salary'
        ? monthlySalaryLabels.salary
        : monthlySalaryLabels.all,
    adjustments: 'ბონუსები, პრემიები და ჯარიმები',
  } as const
  const stages: PayStage[] =
    period === 'all'
      ? [...(split ? ['first' as const] : []), 'salary', 'adjustments']
      : [period]
  return stages.map((stage) => [stage, stageLabels[stage]] as const)
}

export function formatMonthlyPayrollCsv({
  month,
  period,
  records,
  paymentWindows,
}: {
  month: string
  period: MonthlyDirectory['period']
  paymentWindows: MonthlyDirectory['paymentWindows']
  records: Pick<
    MonthlyDirectoryRow,
    | 'employeeName'
    | 'baseMinor'
    | 'bonusMinor'
    | 'premiumMinor'
    | 'fineMinor'
    | 'totalMinor'
    | 'paidMinor'
    | 'payoutDates'
  >[]
}) {
  const amount = (minor: number | null) =>
    minor === null ? '' : (minor / 100).toFixed(2)
  const columns = monthlyPayrollColumns(period)
  const stages = monthlyPayrollExportStages({ period, paymentWindows })
  const headings = [
    'თანამშრომელი',
    'სახელფასო თვე',
    ...columns.map(([, label]) => label),
    'გაცემული თანხა',
    ...stages.flatMap(([, label]) => [
      `${label} - დაგეგმილი დასაწყისი`,
      `${label} - დაგეგმილი დასასრული`,
      `${label} - გაცემის თარიღი`,
    ]),
  ]
  const rows = records.map((row) => [
    /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(row.employeeName)
      ? `'${row.employeeName}`
      : row.employeeName,
    month,
    ...columns.map(([key]) => amount(row[key])),
    amount(row.paidMinor),
    ...stages.flatMap(([stage]) => {
      const dates = row.payoutDates[stage]
      return [dates?.start ?? '', dates?.end ?? '', dates?.paidOn ?? '']
    }),
  ])
  const csv = [headings, ...rows]
    .map((row) =>
      row.map((value) => `"${value.replaceAll('"', '""')}"`).join(','),
    )
    .join('\r\n')
  return { filename: `payroll-${month}-${period}.csv`, csv: `\uFEFF${csv}` }
}
