import type { MonthlyAdjustment, MonthlyPaymentDates } from './monthly.schemas'
import type { SalaryTerm } from './salary.types'
import type { FineStage, PayStage } from './payroll-settings.schemas'

export type PaymentAmounts = {
  baseMinor: number
  bonusMinor: number
  premiumMinor: number
  fineMinor: number
  totalMinor: number
}
export type PublishedPayment = PaymentAmounts & {
  stage: PayStage
  paidOn: string
}
export type PayStageWindow = { stage: PayStage; start: string; end: string }
export type PayrollPayoutDates = {
  start?: string
  end?: string
  paidOn?: string
}

export type MonthlyEntry = {
  userId: string
  employeeName: string
  version: number
  status: 'draft' | 'finalized' | 'voided'
  salary: SalaryTerm | null
  workedSeconds: number
  baseMinor: number
  firstPaymentMinor: number | null
  fineStage: FineStage | null
  paymentDates: MonthlyPaymentDates | null
  baseReason: string
  manualBase: boolean
  adjustments: MonthlyAdjustment[]
  bonusMinor: number
  premiumMinor: number
  fineMinor: number
  totalMinor: number
  reason: string
  actorName: string
  recordedAt: string
}
export type MonthlySource = {
  employeeName: string
  salary: SalaryTerm
  sourceToken: string
  requiresBaseConfirmation: boolean
}
export type MonthlyDetail = {
  timezone: string
  source: MonthlySource | null
  sourceMessage: string | null
  salaryMissing: boolean
  employmentNeedsReview: boolean
  canOpenEmployeeProfile: boolean
  current: MonthlyEntry | null
  history: MonthlyEntry[]
  total: number
  pageSize: number
  closed: boolean
  payments: PublishedPayment[]
  firstPaymentEnabled: boolean
  defaultFineStage: FineStage
  paymentWindows: PayStageWindow[]
}
export type MonthlyDirectory = {
  entryCount: number
  month: string
  closed: boolean
  paymentWindows: PayStageWindow[]
  records: MonthlyDirectoryRow[]
  period: 'all' | 'first' | 'salary'
  nextPeriodChangeAt: number | null
  total: number
  pageSize: number
}

export type MonthlyDirectoryRow = Pick<
  MonthlyEntry,
  'userId' | 'employeeName' | 'salary'
> & {
  version: number | null
  status: MonthlyEntry['status'] | null
  baseMinor: number | null
  bonusMinor: number | null
  premiumMinor: number | null
  fineMinor: number | null
  totalMinor: number | null
  paidMinor: number | null
  paidAdjustments: boolean | null
  baseNeedsConfirmation: boolean
  payoutDates: Partial<Record<PayStage, PayrollPayoutDates>>
  adjustmentDates: {
    stage: FineStage
    start: string
    end?: string
    paid: boolean
  }[]
}
