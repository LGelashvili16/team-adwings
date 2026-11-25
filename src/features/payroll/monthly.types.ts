import type { MonthlyAdjustment } from './monthly.schemas'
import type { SalaryTerm } from './salary.types'

export type MonthlyEntry = {
  userId: string
  employeeName: string
  version: number
  status: 'draft' | 'finalized' | 'voided'
  salary: SalaryTerm | null
  workedSeconds: number
  baseMinor: number
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
  current: MonthlyEntry | null
  history: MonthlyEntry[]
  total: number
  pageSize: number
  closed: boolean
}
export type MonthlyDirectory = {
  entryCount: number
  month: string
  closed: boolean
  token: string
  records: MonthlyDirectoryRow[]
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
}
