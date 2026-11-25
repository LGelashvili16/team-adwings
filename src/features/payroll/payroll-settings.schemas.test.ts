import { describe, expect, it } from 'vitest'
import {
  formatPercentage,
  payrollSettingsDefaults,
  payrollSettingsFormSchema,
  percentageToBasisPoints,
  savePayrollSettingsSchema,
} from './payroll-settings.schemas'

const draft = payrollSettingsDefaults('2026-11-24')
const request = {
  ...draft,
  incomeTaxBasisPoints: 2000,
  employeePensionBasisPoints: 200,
  employerPensionBasisPoints: 200,
  reason: 'საწყისი წესების განსაზღვრა',
}

describe('payroll settings validation', () => {
  it('keeps suggested statutory rates inactive until an explicit save', () => {
    expect(draft.incomeTaxEnabled).toBe(false)
    expect(draft.pensionEnabled).toBe(false)
    expect(savePayrollSettingsSchema.parse(request)).toEqual(request)
  })
  it.each(['', '-1', '0', '100.01', '1.001', 'NaN', 'Infinity', '20%'])(
    'rejects malformed percentage %s',
    (value) => {
      expect(
        payrollSettingsFormSchema.safeParse({
          ...draft,
          incomeTaxBasisPoints: value,
        }).success,
      ).toBe(false)
    },
  )
  it.each([
    ['20', 2000],
    ['2.5', 250],
    ['0.01', 1],
    ['99.99', 9999],
    ['100', 10000],
  ] as const)(
    'round-trips %s as exact integer basis points',
    (value, points) => {
      expect(percentageToBasisPoints(value)).toBe(points)
      expect(formatPercentage(points)).toBe(value)
    },
  )
  it.each([
    { effectiveFrom: '2026-02-30' },
    { expectedVersion: -1 },
    { incomeTaxBasisPoints: 20.5 },
    { employeePensionBasisPoints: 10001 },
    { pensionEnabled: 'true' },
    { amountBasis: 'arbitrary' },
    { dayBasis: 'arbitrary' },
    { reason: ' ' },
    { actorId: 'forged' },
  ])('rejects invalid server input %j', (change) => {
    expect(
      savePayrollSettingsSchema.safeParse({ ...request, ...change }).success,
    ).toBe(false)
  })
})
