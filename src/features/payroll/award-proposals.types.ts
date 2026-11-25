import type { BonusRuleVersion } from './bonus-rules.types'

export type AwardStatus =
  'proposed' | 'withdrawn' | 'approved' | 'rejected' | 'revoked'

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
  allocation?: { poolId: string; totalMinor: number } | null
  evidenceVerified?: boolean
  version: number
  status: AwardStatus
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
  poolId?: string | null
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
  reviewEligible?: boolean
  today: string
  history: AwardVersion[]
  total: number
  pageSize: number
}
