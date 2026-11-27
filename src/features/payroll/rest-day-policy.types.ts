export type RestDayPolicySnapshot = {
  version: number
  effectiveFrom: string | null
  restDayClockInAllowed: boolean
  autoRestDayBonusEnabled: boolean
}

export type RestDayPolicyHistoryEntry = {
  version: number
  effectiveFrom: string
  restDayClockInAllowed: boolean
  autoRestDayBonusEnabled: boolean
  reason: string
  actorName: string
  recordedAt: string
}

export type EmployeeRestDayPolicyView = {
  userId: string
  salaryKind: 'monthly' | 'hourly' | null
  today: string
  timezone: string
  version: number
  current: RestDayPolicySnapshot
  next: RestDayPolicySnapshot | null
  history: RestDayPolicyHistoryEntry[]
  total: number
  pageSize: number
  canEdit: boolean
}
