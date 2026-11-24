/** Quantity is thousandths of the configured unit. Round once, half up, to integer tetri. */
export function proposedAwardAmount(
  rateMinor: number,
  quantityMilli: number,
  calculation: 'fixed' | 'job' | 'task' | 'additional_work',
) {
  if (
    !Number.isSafeInteger(rateMinor) ||
    rateMinor < 1 ||
    rateMinor > 100000000 ||
    !Number.isSafeInteger(quantityMilli) ||
    quantityMilli < 1 ||
    quantityMilli > 100000000
  )
    throw new Error('მიუთითეთ სწორი ტარიფი და რაოდენობა.')
  if (
    (calculation === 'fixed' || calculation === 'job') &&
    quantityMilli !== 1000
  )
    throw new Error(
      'ფიქსირებული და სამუშაოს ბონუსისთვის რაოდენობა უნდა იყოს ერთი.',
    )
  if (calculation === 'task' && quantityMilli % 1000 !== 0)
    throw new Error('დავალებების რაოდენობა უნდა იყოს მთელი რიცხვი.')
  const amount = Number(
    (BigInt(rateMinor) * BigInt(quantityMilli) + 500n) / 1000n,
  )
  if (amount < 1 || amount > 100000000)
    throw new Error(
      'განაცხადის თანხა უნდა იყოს ნულზე მეტი და მაქსიმუმ 1 000 000 ლარი.',
    )
  return amount
}
