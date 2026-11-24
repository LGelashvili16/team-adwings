import type { z } from 'zod'
import type { employmentPeriodFactsSchema } from './employment.schemas'

export type EmploymentPeriodFacts = z.infer<typeof employmentPeriodFactsSchema>
export type EmploymentPeriod = {
  id: string
  startDate: string
  endDate: string | null
}
export type EmploymentAuditEntry = {
  id: string
  action: 'created' | 'updated' | 'voided'
  before: EmploymentPeriodFacts | null
  after: EmploymentPeriodFacts
  actorName: string
  reason: string
  createdAt: string
}
export type EmploymentView = {
  revision: number
  today: string
  timezone: string
  confirmed: boolean
  periods: Array<EmploymentPeriod>
  periodTotal: number
  history: Array<EmploymentAuditEntry>
  historyTotal: number
  pageSize: number
}
