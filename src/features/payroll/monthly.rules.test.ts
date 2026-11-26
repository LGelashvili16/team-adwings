import { expect, it } from 'vitest'
import {
  hourlyBase,
  monthlyBounds,
  monthlyTotals,
  paymentWindow,
  firstSalaryPayment,
  formatMonthlyPayrollCsv,
} from './monthly.rules'
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

it('exports matching salary columns, earning month and scheduled and actual dates', () => {
  const records = [
    {
      employeeName: ' ="ანა, გია"',
      baseMinor: 12345,
      bonusMinor: 1000,
      premiumMinor: 500,
      fineMinor: 0,
      totalMinor: 12345,
      paidMinor: 12345,
      payoutDates: {
        first: { start: '2026-11-25', end: '2026-11-29', paidOn: '2026-11-26' },
        salary: { start: '2026-12-12', end: '2026-12-12' },
        adjustments: { start: '2026-12-15', end: '2026-12-20' },
      },
    },
  ]
  const input = {
    month: '2026-11',
    records,
    paymentWindows: [
      { stage: 'first' as const, start: '2026-11-25', end: '2026-11-29' },
    ],
  }
  const first = formatMonthlyPayrollCsv({ ...input, period: 'first' })
  expect(first.filename).toBe('payroll-2026-11-first.csv')
  const [firstHeader, firstRow] = first.csv.split('\r\n')
  expect(firstHeader).toContain(
    '"ხელფასი(1/2)","ჯარიმები","ჯამი","გაცემული თანხა"',
  )
  expect(firstRow).toBe(
    `"' =""ანა, გია""","2026-11","123.45","0.00","123.45","123.45","2026-11-25","2026-11-29","2026-11-26"`,
  )
  const second = formatMonthlyPayrollCsv({ ...input, period: 'salary' }).csv
  expect(second).toContain('"ხელფასი(2/2)"')
  expect(second).toContain('"2026-12-12","2026-12-12",""')
  expect(second).not.toContain('2026-11-26')
  const full = formatMonthlyPayrollCsv({ ...input, period: 'all' }).csv
  expect(full).toContain('"ხელფასი(თვე)","ბონუსები","პრემიები"')
  expect(full).toContain(
    '"2026-11-25","2026-11-29","2026-11-26","2026-12-12","2026-12-12","","2026-12-15","2026-12-20",""',
  )
  const single = formatMonthlyPayrollCsv({
    ...input,
    period: 'all',
    paymentWindows: [],
  }).csv
  expect(single).not.toContain('ხელფასი(1/2)')
  expect(single).toContain('ხელფასი(თვე) - გაცემის თარიღი')
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
    paymentDates: { salary: '', adjustments: '' },
    firstPayment: '',
    fineStage: null,
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

it('clamps next-month windows and gives the final payment the odd tetri', () => {
  expect(paymentWindow('2028-01', { offset: 1, start: 28, end: 31 })).toEqual({
    start: '2028-02-28',
    end: '2028-02-29',
  })
  expect(
    paymentWindow('2026-12', { offset: 1, start: 10, end: 15 }).start,
  ).toBe('2027-01-10')
  expect(firstSalaryPayment(100001, null)).toBe(50000)
  expect(firstSalaryPayment(100001, 40001)).toBe(40001)
  expect(firstSalaryPayment(100001, 0)).toBe(0)
})
