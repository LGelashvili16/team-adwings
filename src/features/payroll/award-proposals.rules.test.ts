import { expect, it } from 'vitest'
import { proposedAwardAmount } from './award-proposals.rules'
import { formatAwardQuantity } from './award-proposals.presentation'
import {
  awardFormSchema,
  normalizeAwardReference,
  quantityToMilli,
  saveAwardSchema,
} from './award-proposals.schemas'

it('calculates exact rates with one half-up rounding step and bounded totals', () => {
  expect(quantityToMilli('1,005')).toBe(1005)
  expect(formatAwardQuantity(1005)).toBe('1,005')
  expect(proposedAwardAmount(100, 1005, 'additional_work')).toBe(101)
  expect(proposedAwardAmount(12345, 1250, 'additional_work')).toBe(15431)
  expect(proposedAwardAmount(29, 1000, 'fixed')).toBe(29)
  for (const [rate, quantity, kind] of [
    [1, 1, 'additional_work'],
    [100000000, 100000000, 'additional_work'],
    [10, 1500, 'task'],
    [10, 2000, 'job'],
    [1.5, 1000, 'fixed'],
  ] as const)
    expect(() => proposedAwardAmount(rate, quantity, kind)).toThrow()
})
it('normalizes stable external references without admitting forged monetary or audit fields', () => {
  expect(normalizeAwardReference('  ACT-００１  Part  A ')).toBe(
    'act-001 part a',
  )
  const value = {
    proposalId: null,
    expectedVersion: 0,
    requestId: '019ab984-7000-7000-8000-000000000001',
    userId: 'worker',
    ruleId: '019ab984-7000-7000-8000-000000000002',
    workDate: '2026-11-25',
    expectedRuleVersion: 1,
    jobId: null,
    reference: 'ACT-001',
    quantityMilli: 1250,
    evidence: 'დადასტურებული შესრულება',
    reason: 'განაცხადის მომზადება',
  }
  expect(saveAwardSchema.safeParse(value).success).toBe(true)
  expect(
    saveAwardSchema.parse({
      ...value,
      requestId: value.requestId.toUpperCase(),
    }).requestId,
  ).toBe(value.requestId)
  expect(
    saveAwardSchema.safeParse({ ...value, reference: 'ACT\u200b-001' }).success,
  ).toBe(false)
  for (const extra of [
    { amountMinor: 1 },
    { actorId: 'admin' },
    { status: 'approved' },
    { quantityMilli: 0.5 },
    { workDate: '2026-02-30' },
  ])
    expect(saveAwardSchema.safeParse({ ...value, ...extra }).success).toBe(
      false,
    )
  const { quantityMilli, ...form } = value
  expect(
    awardFormSchema.safeParse({
      ...form,
      calculation: 'task',
      quantity: '1.25',
    }).success,
  ).toBe(false)
  const missingJob = awardFormSchema.safeParse({
    ...form,
    calculation: 'job',
    quantity: '1',
    reference: '',
  })
  expect(missingJob.success).toBe(false)
  if (!missingJob.success)
    expect(
      missingJob.error.issues.some((issue) => issue.path[0] === 'jobId'),
    ).toBe(true)
  expect(quantityMilli).toBe(1250)
})
