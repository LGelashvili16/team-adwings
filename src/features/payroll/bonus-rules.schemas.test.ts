import { expect, it } from 'vitest'
import {
  bonusRuleFormSchema,
  bonusRuleSearchSchema,
  saveBonusRuleSchema,
} from './bonus-rules.schemas'
import { salaryToMinor } from './salary.schemas'

const value = {
  name: 'სამუშაოს ბონუსი',
  kind: 'bonus',
  calculation: 'job',
  unitLabel: '',
  qualification: 'მიღებული სამუშაოს შესრულება',
  amount: '0,29',
  amountBasis: 'gross',
  enabled: true,
  effectiveFrom: '2026-11-25',
  reason: 'დადასტურებული შეთანხმება',
}
it('validates exact rates and requires fixed premiums or explicit extra-work units', () => {
  expect(bonusRuleFormSchema.parse(value).amount).toBe('0,29')
  expect(salaryToMinor(value.amount)).toBe(29)
  for (const extra of [
    { kind: 'premium' },
    { calculation: 'additional_work' },
    { unitLabel: 'მეტრი' },
    { amount: '1.123' },
    { amount: '0' },
    { amount: '1e3' },
    { qualification: '' },
  ])
    expect(bonusRuleFormSchema.safeParse({ ...value, ...extra }).success).toBe(
      false,
    )
  expect(
    bonusRuleFormSchema.safeParse({
      ...value,
      calculation: 'additional_work',
      unitLabel: 'მეტრი',
    }).success,
  ).toBe(true)
})
it('validates URL pagination and rejects forged command fields and revision mismatches', () => {
  expect(
    bonusRuleSearchSchema.parse({ q: '  ტესტი ', page: '2' }),
  ).toMatchObject({ q: 'ტესტი', page: 2 })
  for (const page of [0, -1, 1.2, 10001])
    expect(bonusRuleSearchSchema.safeParse({ page }).success).toBe(false)
  const { amount, ...fields } = value
  const command = {
    ...fields,
    ruleId: null,
    expectedVersion: 0,
    requestId: '019ab984-7000-7000-8000-000000000001',
    amountMinor: salaryToMinor(amount),
    currency: 'GEL',
  }
  expect(saveBonusRuleSchema.safeParse(command).success).toBe(true)
  expect(
    saveBonusRuleSchema.safeParse({ ...command, actorId: 'forged' }).success,
  ).toBe(false)
  expect(
    saveBonusRuleSchema.safeParse({ ...command, expectedVersion: 1 }).success,
  ).toBe(false)
})
