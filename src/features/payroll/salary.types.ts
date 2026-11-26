import type { PublishedPayment } from './monthly.types'

export type SalaryTerm = {
  version: number
  effectiveFrom: string
  kind: 'monthly' | 'hourly'
  amountBasis: 'gross' | 'net'
  amountMinor: number
  currency: 'GEL'
}
export type SalaryHistoryEntry = SalaryTerm & {
  recordedAt: string
  audit: { actorName: string; reason: string } | null
}
export type SalaryEmployee = {
  userId: string
  name: string
  jobTitle: string | null
  username: string | null
  status: string
  version: number
  current: SalaryTerm | null
  next: SalaryTerm | null
}
export type SalaryDetail = {
  employee: SalaryEmployee
  today: string
  timezone: string
  history: SalaryHistoryEntry[]
  total: number
  pageSize: number
}
export type SalaryStatement = {
  month: string
  amountBasis: SalaryTerm['amountBasis']
  baseMinor: number
  bonusMinor: number
  premiumMinor: number
  fineMinor: number
  totalMinor: number
  payments?: PublishedPayment[]
}
export type MySalaryDetail = SalaryDetail & {
  statements: {
    records: SalaryStatement[]
    total: number
    page: number
    pageSize: number
  }
}
export type SalaryDirectory = {
  today: string
  records: SalaryEmployee[]
  total: number
  pageSize: number
  counts: { monthly: number; hourly: number; unconfigured: number }
}
