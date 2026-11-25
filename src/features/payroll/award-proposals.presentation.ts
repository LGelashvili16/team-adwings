export const awardStatusLabels = {
  proposed: 'განხილვის მოლოდინში',
  withdrawn: 'გაუქმებული',
  approved: 'დამტკიცებული',
  rejected: 'უარყოფილი',
  revoked: 'დამტკიცება გაუქმებულია',
}
export const awardStatusVariants = {
  proposed: 'orange',
  withdrawn: 'secondary',
  approved: 'green',
  rejected: 'red',
  revoked: 'secondary',
} as const
export function formatAwardQuantity(value: number) {
  const whole = String(Math.floor(value / 1000)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    '\u00a0',
  )
  const fraction = String(value % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole},${fraction}` : whole
}
