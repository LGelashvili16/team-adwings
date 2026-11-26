import { expect, it } from 'vitest'
import {
  salaryAmountInput,
  salaryDirectorySchema,
  salaryFormSchema,
  salarySaveSchema,
  salaryToMinor,
} from './salary.schemas'

const form = {
  kind: 'monthly',
  amount: '2500.29',
  effectiveFrom: '2026-11-25',
}
it('converts validated decimal amounts exactly into integer tetri', () => {
  for (const [amount, minor] of [
    ['2500.29', 250029],
    ['0.01', 1],
    ['12,50', 1250],
    ['1000000', 100000000],
  ] as const) {
    expect(salaryFormSchema.safeParse({ ...form, amount }).success).toBe(true)
    expect(salaryToMinor(amount)).toBe(minor)
    expect(salaryToMinor(salaryAmountInput(minor))).toBe(minor)
  }
})
it.each(['', '0', '-1', '1e3', '12.345', 'NaN', '1 000', '1000000.01'])(
  'rejects unsupported money input %s',
  (amount) =>
    expect(salaryFormSchema.safeParse({ ...form, amount }).success).toBe(false),
)
it('validates boundary payloads, dates and unique bulk target revisions', () => {
  const input = {
    targets: [{ userId: 'worker', expectedVersion: 0 }],
    effectiveFrom: form.effectiveFrom,
    amountMinor: 250029,
    kind: form.kind,
    currency: 'GEL',
  }
  expect(salarySaveSchema.safeParse(input).success).toBe(true)
  for (const override of [
    { actorId: 'admin' },
    { amountBasis: 'gross' },
    { amountMinor: 2.5 },
    { amountMinor: 0 },
    { currency: 'USD' },
    { effectiveFrom: '2026-02-30' },
    { targets: [...input.targets, ...input.targets] },
  ])
    expect(salarySaveSchema.safeParse({ ...input, ...override }).success).toBe(
      false,
    )
  expect(salaryDirectorySchema.parse({})).toMatchObject({
    page: 1,
    kind: 'all',
    status: 'active',
    sort: 'name',
    q: '',
  })
  expect(salaryDirectorySchema.safeParse({ sort: 'sql' }).success).toBe(false)
  expect(salaryDirectorySchema.safeParse({ page: -1 }).success).toBe(false)
})
