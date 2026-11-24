/** General Labour Code Article 30 holidays, checked 2026-11-25 against https://matsne.gov.ge/ka/document/view/1155567.
 * Substitutions and additional government-declared dates require explicit company reconciliation.
 */
export const GEORGIAN_HOLIDAY_RULE_VERSION = 'labour-code-30-2026-11-25'
/** Verified financial baseline, not an assertion that today's holiday list applied to earlier years. */
export const GEORGIAN_HOLIDAY_CALENDAR_FROM = '2025-01-01'
export function georgianPublicHolidays(year: number) {
  const dates = new Set(
    [
      '01-01',
      '01-02',
      '01-07',
      '01-19',
      '03-03',
      '03-08',
      '04-09',
      '05-09',
      '05-12',
      '05-17',
      '05-26',
      '08-28',
      '10-14',
      '11-23',
    ].map((day) => `${year}-${day}`),
  )
  // Julian computus converted to Gregorian dates; payroll calendar input is bounded to 2000-2100.
  const d = (19 * (year % 19) + 15) % 30
  const e = (2 * (year % 4) + 4 * (year % 7) - d + 34) % 7
  const month = Math.floor((d + e + 114) / 31)
  const day = ((d + e + 114) % 31) + 1
  const shift = Math.floor(year / 100) - Math.floor(year / 400) - 2
  const easter = Date.UTC(year, month - 1, day + shift)
  for (const offset of [-2, -1, 0, 1])
    dates.add(new Date(easter + offset * 86400000).toISOString().slice(0, 10))
  return dates
}
