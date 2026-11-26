import { expect, it } from 'vitest'
import {
  paymentScheduleDefaults,
  paymentScheduleSchema,
  savePayrollSettingsSchema,
} from './payroll-settings.schemas'

it('accepts one or two payments and rejects overlapping or malformed schedules', () => {
  const defaults = paymentScheduleDefaults
  expect(paymentScheduleSchema.safeParse(defaults).success).toBe(true)
  expect(defaults.adjustments.offset).toBe(1)
  expect(
    paymentScheduleSchema.safeParse({
      ...defaults,
      adjustments: { ...defaults.adjustments, offset: 0 },
    }).success,
  ).toBe(true)
  expect(
    paymentScheduleSchema.safeParse({ ...defaults, first: null }).success,
  ).toBe(true)
  for (const update of [
    { salary: { offset: 0, start: 25, end: 27 } },
    { salary: { offset: 1, start: 20, end: 10 } },
    { adjustments: { offset: 2, start: 15, end: 20 } },
    { adjustments: { offset: 1, start: 15, end: 32 } },
    { fineStage: 'first' },
  ])
    expect(
      paymentScheduleSchema.safeParse({ ...defaults, ...update }).success,
    ).toBe(false)
  expect(
    savePayrollSettingsSchema.safeParse({
      schedule: defaults,
      expectedVersion: 0,
      incomeTaxEnabled: true,
    }).success,
  ).toBe(false)
})
