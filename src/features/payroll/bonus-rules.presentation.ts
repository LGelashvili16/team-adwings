import type { BonusRuleVersion } from './bonus-rules.types'

export const bonusKindLabels = { bonus: 'ბონუსი', premium: 'პრემია' }
export const bonusCalculationLabels = {
  fixed: 'ფიქსირებული თანხა',
  job: 'შესრულებული სამუშაოს მიხედვით',
  task: 'შესრულებული დავალების მიხედვით',
  additional_work: 'დამატებითი სამუშაოს მიხედვით',
}
export function bonusUnitLabel(rule: BonusRuleVersion) {
  return rule.calculation === 'additional_work'
    ? rule.unitLabel
    : { fixed: 'ერთ მინიჭებაზე', job: 'ერთ სამუშაოზე', task: 'ერთ დავალებაზე' }[
        rule.calculation
      ]
}
