import { act, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SalaryStatements } from './salary-statements'
import type { SalaryStatement } from '../salary.types'

afterEach(() => vi.useRealTimers())

it('marks only the newly recorded installment and expires its badge while open', () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'))
  const amounts = {
    baseMinor: 75000,
    bonusMinor: 0,
    premiumMinor: 0,
    fineMinor: 0,
    totalMinor: 75000,
  }
  const records: SalaryStatement[] = [
    {
      ...amounts,
      month: '2026-11',
      amountBasis: 'net',
      baseMinor: 150000,
      totalMinor: 150000,
      payments: [
        { ...amounts, stage: 'first', paidOn: '2026-11-25' },
        {
          ...amounts,
          stage: 'salary',
          paidOn: '2026-11-26',
          recentUntil: Date.now() + 1000,
        },
      ],
    },
  ]

  render(
    <SalaryStatements
      records={records}
      filter={null}
      loading={false}
      filtered={false}
    />,
  )
  const payments = within(screen.getByRole('table'))
  const badge = payments.getByText('ახლახანს გაცემული')
  expect(badge.closest('li')).toHaveTextContent('ხელფასის მეორე ნაწილი')
  expect(payments.queryByText('ხელზე ასაღები')).not.toBeInTheDocument()

  act(() => vi.advanceTimersByTime(1000))
  expect(payments.queryByText('ახლახანს გაცემული')).not.toBeInTheDocument()
  expect(payments.getByText('ხელფასის მეორე ნაწილი')).toBeInTheDocument()
})
