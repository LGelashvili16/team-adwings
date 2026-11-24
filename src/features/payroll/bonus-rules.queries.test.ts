import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { bonusRuleQuery } from './bonus-rules.queries'
import type { BonusRuleDetail, BonusRuleVersion } from './bonus-rules.types'

vi.mock('./bonus-rules.functions', () => ({
  getBonusRule: vi.fn(),
  getBonusRules: vi.fn(),
}))
const rule: BonusRuleVersion = {
  version: 1,
  name: 'სამუშაოს ბონუსი',
  kind: 'bonus',
  calculation: 'fixed',
  unitLabel: '',
  qualification: 'დადასტურებული შესრულება',
  amountMinor: 12345,
  currency: 'GEL',
  amountBasis: 'gross',
  enabled: true,
  effectiveFrom: '2026-11-25',
}
const view: BonusRuleDetail = {
  ruleId: 'rule-a',
  current: rule,
  next: null,
  latest: rule,
  today: '2026-11-25',
  timezone: 'Asia/Tbilisi',
  history: [],
  total: 0,
  pageSize: 10,
}
it('retains the same rule context during history search without crossing actor or rule identities', () => {
  const client = new QueryClient(),
    options = bonusRuleQuery('accountant', 'rule-a', 1, '')
  const previous = { ok: true as const, value: view }
  client.setQueryData(options.queryKey, previous)
  for (const [actorId, ruleId, keep] of [
    ['accountant', 'rule-a', true],
    ['other-actor', 'rule-a', false],
    ['accountant', 'rule-b', false],
  ] as const) {
    const observer = new QueryObserver(client, options)
    observer.setOptions(bonusRuleQuery(actorId, ruleId, 2, 'ავტორი'))
    expect(observer.getCurrentResult().data).toBe(keep ? previous : undefined)
    expect(observer.getCurrentResult().isPlaceholderData).toBe(keep)
    observer.destroy()
  }
  client.clear()
})
