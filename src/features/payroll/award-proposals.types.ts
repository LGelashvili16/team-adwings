import type { BonusRuleVersion } from './bonus-rules.types'

export type AwardChoice = {
  id: string
  label: string
  description: string
  rule: BonusRuleVersion | null
}
export type AwardSourceSnapshot = {
  jobTitle?: string
  jobVersion?: number
  completedAt?: string
  completedBy?: string
  assigneeId?: string
  employmentRevision: number
  timezone: string
}
export type AwardVersion = {
  version: number
  status: 'proposed' | 'withdrawn'
  workDate: string
  quantityMilli: number
  amountMinor: number
  reference: string
  evidence: string
  reason: string
  actorName: string
  recordedAt: string
  rule: BonusRuleVersion
  completionEventId: string | null
  sourceSnapshot: AwardSourceSnapshot
}
export type AwardSummary = {
  proposalId: string
  employeeName: string
  userId: string
  ruleId: string
  sourceType: 'job' | 'external'
  sourceKey: string
  jobId: string | null
  current: AwardVersion
}
export type AwardDirectory = {
  today: string
  items: AwardSummary[]
  total: number
  pageSize: number
}
export type AwardDetail = AwardSummary & {
  today: string
  history: AwardVersion[]
  total: number
  pageSize: number
}
