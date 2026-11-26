import type { SalaryTerm } from './salary.types'

export const salaryKindLabels = {
  monthly: 'ფიქსირებული ყოველთვიური',
  hourly: 'საათობრივი',
}
export const salaryBasisLabels = {
  gross: 'დარიცხული თანხა',
  net: 'ხელზე ასაღები',
}
/** Explicit lari formatting remains Georgian when a browser's ICU lacks the ka locale. */
export function formatSalary(term: Pick<SalaryTerm, 'amountMinor'>) {
  const whole = String(Math.floor(term.amountMinor / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    '\u00a0',
  )
  return `${whole},${String(term.amountMinor % 100).padStart(2, '0')} ₾`
}
