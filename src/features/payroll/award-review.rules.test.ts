import { describe, it, expect } from 'vitest'
import { equalAwardShares } from './award-proposals.rules'
import { reviewAwardSchema, saveAwardPoolSchema } from './award-review.schemas'

describe('award review and allocation inputs', () => {
  it('preserves every tetri and stable remainders across reordered beneficiaries', () => {
    expect(equalAwardShares(100, ['c', 'a', 'b'])).toEqual([
      { userId: 'c', amountMinor: 33 },
      { userId: 'a', amountMinor: 34 },
      { userId: 'b', amountMinor: 33 },
    ])
    expect(
      equalAwardShares(100, ['a', 'b', 'c']).reduce(
        (sum, r) => sum + r.amountMinor,
        0,
      ),
    ).toBe(100)
    expect(() => equalAwardShares(1, ['a', 'b'])).toThrow()
    expect(() => equalAwardShares(100, ['a', 'a'])).toThrow()
  })
  it('requires an explicit attestation and reason for approval', () => {
    const input = {
      proposalId: '10000000-0000-4000-8000-000000000001',
      expectedVersion: 1,
      requestId: '10000000-0000-4000-8000-000000000002',
      reason: 'დამოუკიდებელი გადამოწმება',
      decision: 'approved',
      evidenceVerified: false,
    }
    expect(reviewAwardSchema.safeParse(input).success).toBe(false)
    expect(
      reviewAwardSchema.safeParse({ ...input, evidenceVerified: true }).success,
    ).toBe(true)
    expect(
      reviewAwardSchema.safeParse({ ...input, decision: 'rejected' }).success,
    ).toBe(true)
    expect(
      reviewAwardSchema.safeParse({
        ...input,
        evidenceVerified: true,
        actorId: 'untrusted',
      }).success,
    ).toBe(false)
  })
  it('rejects repeated beneficiaries before persistence', () => {
    expect(
      saveAwardPoolSchema.shape.allocations.safeParse([
        { userId: 'a', amountMinor: 1 },
        { userId: 'a', amountMinor: 1 },
      ]).success,
    ).toBe(false)
  })
})
