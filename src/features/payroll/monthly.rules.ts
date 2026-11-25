import type { MonthlyAdjustment } from './monthly.schemas'

export function monthlyBounds(month: string) {
  const last = new Date(`${month}-01T12:00:00Z`)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  return { start: `${month}-01`, end: last.toISOString().slice(0, 10) }
}
/** Round the exact hourly product once, half up, to integer tetri. */
export function hourlyBase(rateMinor: number, seconds: number) {
  return Number((BigInt(rateMinor) * BigInt(seconds) + 1800n) / 3600n)
}
export function monthlyTotals(
  baseMinor: number,
  adjustments: MonthlyAdjustment[],
) {
  const sum = (kind: MonthlyAdjustment['kind']) =>
    adjustments
      .filter((a) => a.kind === kind)
      .reduce((total, a) => total + a.amountMinor, 0)
  const bonusMinor = sum('bonus'),
    premiumMinor = sum('premium'),
    fineMinor = sum('fine')
  return {
    bonusMinor,
    premiumMinor,
    fineMinor,
    totalMinor: baseMinor + bonusMinor + premiumMinor - fineMinor,
  }
}
export const monthlyAdjustmentLabels = {
  bonus: 'ბონუსი',
  premium: 'პრემია',
  fine: 'ჯარიმა',
} as const
