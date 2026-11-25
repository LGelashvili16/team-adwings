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

/** Distribute the remaining tetri in stable identity order, independent of picker order. */
export function equalAwardShares(totalMinor: number, userIds: string[]) {
  if (
    !Number.isSafeInteger(totalMinor) ||
    totalMinor > 100000000 ||
    userIds.length < 2 ||
    userIds.length > 20 ||
    totalMinor < userIds.length ||
    new Set(userIds).size !== userIds.length
  )
    throw new Error(
      'აირჩიეთ განსხვავებული ბენეფიციარები და თითოეულისთვის მინიმუმ ერთი თეთრი.',
    )
  const sorted = [...userIds].sort(),
    base = Math.floor(totalMinor / userIds.length),
    remainder = totalMinor % userIds.length
  return userIds.map((userId) => ({
    userId,
    amountMinor: base + (sorted.indexOf(userId) < remainder ? 1 : 0),
  }))
}
