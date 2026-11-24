export type BonusRuleVersion = {
  version: number
  effectiveFrom: string
  name: string
  kind: 'bonus' | 'premium'
  calculation: 'fixed' | 'job' | 'task' | 'additional_work'
  unitLabel: string
  qualification: string
  amountMinor: number
  amountBasis: 'gross' | 'net'
  currency: 'GEL'
  enabled: boolean
}
export type BonusRuleSummary = {
  ruleId: string
  latest: BonusRuleVersion
  current: BonusRuleVersion | null
  next: BonusRuleVersion | null
}
export type BonusRuleDirectory = {
  today: string
  items: BonusRuleSummary[]
  total: number
  pageSize: number
}
export type BonusRuleDetail = BonusRuleSummary & {
  today: string
  timezone: string
  history: Array<
    BonusRuleVersion & { actorName: string; reason: string; recordedAt: string }
  >
  total: number
  pageSize: number
}
