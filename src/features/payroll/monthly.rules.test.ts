import { expect, it } from 'vitest'
import { hourlyBase, monthlyBounds, monthlyTotals } from './monthly.rules'
import {
  monthlyFormSchema,
  monthlySaveSchema,
  monthlySearchSchema,
} from './monthly.schemas'

it('uses exact hourly products and one half-up rounding with separate additions and fines', () => {
  expect(hourlyBase(12345, 4788)).toBe(16419)
  expect(hourlyBase(1, 1800)).toBe(1)
  expect(
    monthlyTotals(100000, [
      { kind: 'bonus', amountMinor: 10001, reason: 'საფუძველი' },
      { kind: 'premium', amountMinor: 20002, reason: 'საფუძველი' },
      { kind: 'fine', amountMinor: 3003, reason: 'საფუძველი' },
    ]),
  ).toEqual({
    bonusMinor: 10001,
    premiumMinor: 20002,
    fineMinor: 3003,
    totalMinor: 127000,
  })
  expect(monthlyBounds('2028-02')).toEqual({
    start: '2028-02-01',
    end: '2028-02-29',
  })
})
it('validates bounded URL state, exact amounts and required fine reasons', () => {
  expect(monthlySearchSchema.safeParse({ month: '2026-13' }).success).toBe(
    false,
  )
  expect(monthlySearchSchema.safeParse({ page: -1 }).success).toBe(false)
  const form = {
    hours: '1.33',
    base: '1000',
    manualBase: false,
    baseReason: '',
    reason: 'მომზადება',
    adjustments: [],
  }
  expect(monthlyFormSchema.safeParse(form).success).toBe(true)
  expect(monthlyFormSchema.safeParse({ ...form, hours: '1.333' }).success).toBe(
    false,
  )
  expect(
    monthlyFormSchema.safeParse({ ...form, manualBase: true, base: '' })
      .success,
  ).toBe(false)
  expect(
    monthlyFormSchema.safeParse({
      ...form,
      adjustments: [{ kind: 'fine', amount: '10', reason: '' }],
    }).success,
  ).toBe(false)
  expect(monthlySaveSchema.safeParse({}).success).toBe(false)
})
