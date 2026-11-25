import type { AwardStatus, AwardSummary } from './award-proposals.types'
import type { BonusRuleVersion } from './bonus-rules.types'

export type PoolVersion = {
  version: number
  status: AwardStatus
  workDate: string
  quantityMilli: number
  totalMinor: number
  reference: string
  evidence: string
  reason: string
  actorName: string
  recordedAt: string
  evidenceVerified: boolean
  rule: BonusRuleVersion
  allocations: Array<{ userId: string; name: string; amountMinor: number }>
}
export type AwardPoolDetail = {
  poolId: string
  ruleId: string
  sourceType: 'job' | 'external'
  jobId: string | null
  today: string
  current: PoolVersion
  members: AwardSummary[]
  history: PoolVersion[]
  total: number
  pageSize: number
  reviewEligible: boolean
  preparationEligible: boolean
  timezone: string
}
