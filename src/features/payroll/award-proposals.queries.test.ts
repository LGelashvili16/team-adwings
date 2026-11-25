import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { awardQuery } from './award-proposals.queries'
import { awardPoolQuery } from './award-pools.queries'
import type { AwardPoolDetail } from './award-pools.types'
import type { AwardDetail, AwardVersion } from './award-proposals.types'

vi.mock('./award-proposals.functions', () => ({
  getAwardProposal: vi.fn(),
  getAwardProposals: vi.fn(),
  getAwardChoices: vi.fn(),
}))
vi.mock('./award-pools.functions', () => ({ getAwardPool: vi.fn() }))
const current: AwardVersion = {
  version: 1,
  status: 'proposed',
  workDate: '2026-11-25',
  quantityMilli: 1000,
  amountMinor: 12345,
  reference: 'ACT-001',
  evidence: 'დადასტურებული შესრულება',
  reason: 'მომზადების საფუძველი',
  actorName: 'ბუღალტერი',
  recordedAt: '2026-11-25T08:00:00Z',
  completionEventId: null,
  sourceSnapshot: { employmentRevision: 1, timezone: 'Asia/Tbilisi' },
  rule: {
    version: 1,
    effectiveFrom: '2026-11-01',
    name: 'ბონუსი',
    kind: 'bonus',
    calculation: 'fixed',
    unitLabel: '',
    qualification: 'დადასტურებული შედეგი',
    amountMinor: 12345,
    amountBasis: 'gross',
    currency: 'GEL',
    enabled: true,
  },
}
const detail: AwardDetail = {
  proposalId: 'proposal-a',
  employeeName: 'თანამშრომელი',
  userId: 'worker',
  ruleId: 'rule-a',
  sourceType: 'external',
  sourceKey: 'act-001',
  jobId: null,
  current,
  today: '2026-11-25',
  history: [current],
  total: 1,
  pageSize: 10,
}
it('retains history context only for the same actor and proposal', () => {
  const client = new QueryClient(),
    options = awardQuery('accountant', 'proposal-a', 1, ''),
    previous = { ok: true as const, value: detail }
  client.setQueryData(options.queryKey, previous)
  for (const [actorId, proposalId, keep] of [
    ['accountant', 'proposal-a', true],
    ['other-actor', 'proposal-a', false],
    ['accountant', 'proposal-b', false],
  ] as const) {
    const observer = new QueryObserver(client, options)
    observer.setOptions(awardQuery(actorId, proposalId, 2, 'ავტორი'))
    expect(observer.getCurrentResult().data).toBe(keep ? previous : undefined)
    expect(observer.getCurrentResult().isPlaceholderData).toBe(keep)
    observer.destroy()
  }
  client.clear()
})
it('never carries pool history into a different actor or pool', () => {
  const value: AwardPoolDetail = {
    poolId: 'pool-a',
    ruleId: 'rule-a',
    sourceType: 'external',
    jobId: null,
    today: '2026-11-25',
    timezone: 'Asia/Tbilisi',
    members: [],
    history: [],
    total: 1,
    pageSize: 10,
    reviewEligible: true,
    preparationEligible: false,
    current: {
      ...current,
      totalMinor: 100,
      evidenceVerified: false,
      allocations: [
        { userId: 'worker', name: 'თანამშრომელი', amountMinor: 50 },
        { userId: 'other', name: 'თანამშრომელი', amountMinor: 50 },
      ],
    },
  }
  const client = new QueryClient(),
    options = awardPoolQuery('accountant', 'pool-a', 1, ''),
    previous = { ok: true as const, value }
  client.setQueryData(options.queryKey, previous)
  for (const [actorId, poolId, keep] of [
    ['accountant', 'pool-a', true],
    ['other-actor', 'pool-a', false],
    ['accountant', 'pool-b', false],
  ] as const) {
    const observer = new QueryObserver(client, options)
    observer.setOptions(awardPoolQuery(actorId, poolId, 2, 'ავტორი'))
    expect(observer.getCurrentResult().data).toBe(keep ? previous : undefined)
    observer.destroy()
  }
  client.clear()
})
