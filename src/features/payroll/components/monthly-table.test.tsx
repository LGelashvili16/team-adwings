import { render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MonthlyTable } from './monthly-table'
import type { MonthlyDirectoryRow } from '../monthly.types'

const salary = {
  kind: 'monthly',
  amountMinor: 150000,
  amountBasis: 'net',
  currency: 'GEL',
  effectiveFrom: '2026-11-01',
  version: 1,
} as const

const monthly: MonthlyDirectoryRow = {
  userId: 'worker',
  employeeName: 'ანა თანამშრომელი',
  salary,
  status: 'draft',
  version: 1,
  baseMinor: 75000,
  bonusMinor: null,
  premiumMinor: null,
  fineMinor: 0,
  totalMinor: 75000,
  paidMinor: null,
  baseNeedsConfirmation: false,
  paidAdjustments: null,
  payoutDates: {},
  adjustmentDates: [],
}

it('shows salary type by the name and an independent status for the selected installment', () => {
  const hourly: MonthlyDirectoryRow = {
    ...monthly,
    userId: 'hourly',
    employeeName: 'ნინო თანამშრომელი',
    salary: { ...salary, kind: 'hourly', amountMinor: 1000 },
    baseMinor: null,
    totalMinor: null,
    baseNeedsConfirmation: true,
  }
  const { rerender } = render(
    <MonthlyTable
      records={[monthly, hourly]}
      period="salary"
      onOpen={vi.fn()}
    />,
  )
  const [employee, status] = within(
    screen.getByRole('row', { name: /ანა თანამშრომელი/ }),
  ).getAllByRole('cell')
  expect(within(employee).getByText('ყოველთვიური')).toBeVisible()
  expect(status).toHaveTextContent('არ არის გაცემული')
  const [hourlyEmployee, hourlyStatus] = within(
    screen.getByRole('row', { name: /ნინო თანამშრომელი/ }),
  ).getAllByRole('cell')
  expect(hourlyEmployee).toHaveTextContent('საათობრივი')
  expect(hourlyStatus).toHaveTextContent('არ არის გაცემული')
  expect(hourlyStatus).toHaveTextContent('თვის ხელფასი დასადასტურებელია')

  rerender(
    <MonthlyTable
      period="first"
      records={[
        { ...monthly, paidMinor: 75000 },
        {
          ...hourly,
          baseNeedsConfirmation: false,
          payoutDates: { salary: { paidOn: '2026-12-10' } },
        },
      ]}
      onOpen={vi.fn()}
    />,
  )
  expect(screen.getByText('გაცემულია 750,00 ₾')).toBeVisible()
  expect(screen.getByText('ცალკე გაცემა არ არის')).toBeVisible()
  expect(screen.queryByText('არ არის გაცემული')).not.toBeInTheDocument()
})
