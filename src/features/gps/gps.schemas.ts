import { z } from 'zod'

export const gpsPageSize = 20
export const gpsSearchText = z
  .string()
  .trim()
  .max(80, 'ძიება უნდა შეიცავდეს მაქსიმუმ 80 სიმბოლოს.')
export const gpsMapLimit = 200
export const gpsSearchSchema = z.object({
  q: gpsSearchText.catch('').default(''),
})
export type GpsSearch = z.output<typeof gpsSearchSchema>
export const gpsMapSchema = gpsSearchSchema.extend({
  includeDisabled: z.boolean().default(false),
})

export const gpsDeviceParams = z.object({
  deviceId: z.uuid({ error: 'მოწყობილობის იდენტიფიკატორი არასწორია.' }),
})
export const gpsTimeZone = 'Asia/Tbilisi'
const historyDay = z.iso
  .date({ error: 'აირჩიეთ თარიღი.' })
  .refine((day) => day >= '0001-01-01', 'აირჩიეთ სწორი თარიღი.')
export const gpsHistoryRange = z
  .object({ from: historyDay, to: historyDay })
  .refine(
    ({ from, to }) => {
      const span = Date.parse(to) - Date.parse(from)
      return span >= 0 && span < 7 * 86_400_000
    },
    { path: ['to'], error: 'აირჩიეთ პერიოდი ერთიდან შვიდ დღემდე.' },
  )
const historyPage = z.number().int().min(1)
export const gpsHistoryInput = gpsHistoryRange.safeExtend({
  ...gpsDeviceParams.shape,
  page: historyPage,
})
export const gpsHistorySearch = z
  .object({
    from: z.unknown().optional(),
    to: z.unknown().optional(),
    page: historyPage.catch(1).default(1),
  })
  .transform(({ page, ...dates }) => {
    const range = gpsHistoryRange.safeParse(dates)
    if (range.success) return { ...range.data, page }
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: gpsTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    return { from: today, to: today, page: 1 }
  })
export type GpsHistorySearch = z.output<typeof gpsHistorySearch>

export const GPS_PHONE_PREFIX = '+995'

export function stripGpsPhonePrefix(value: string) {
  return value.trimStart().replace(/^\+995[\s-]*/, '')
}

export const gpsPhoneSchema = z
  .string()
  .trim()
  .max(32, 'ტელეფონის ნომერი ძალიან გრძელია.')
  .transform((value) => {
    const local = stripGpsPhonePrefix(value).trim()
    return local ? `${GPS_PHONE_PREFIX} ${local}` : ''
  })
  .refine((value) => {
    if (value === '') return true
    if (value.length > 32) return false
    if (!/^\+995 [0-9][0-9 ()-]{4,25}[0-9]$/.test(value)) return false
    const localDigits = value.slice(GPS_PHONE_PREFIX.length).replace(/\D/g, '')
    return localDigits.length === 9
  }, 'მიუთითეთ სწორი ტელეფონის ნომერი.')
  .default('')

export const gpsDeviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'მიუთითეთ მოწყობილობის სახელი.')
    .max(100, 'სახელი უნდა შეიცავდეს მაქსიმუმ 100 სიმბოლოს.'),
  reportedId: z
    .string()
    .trim()
    .regex(
      /^(?=[0-9]*[1-9])[0-9]{5,20}$/,
      'მიუთითეთ მოწყობილობის 5-დან 20-მდე ციფრიანი იდენტიფიკატორი.',
    ),
  phone: gpsPhoneSchema,
  enabled: z.boolean({ error: 'მიუთითეთ მოწყობილობის სტატუსი.' }),
})
export const gpsCreateDeviceSchema = gpsDeviceSchema.extend({
  phone: gpsPhoneSchema.refine(
    (value) => value !== '',
    'მიუთითეთ ტელეფონის ნომერი.',
  ),
})
export const gpsSaveSchema = z.union(
  [
    gpsCreateDeviceSchema.extend({ id: z.null(), version: z.null() }),
    gpsDeviceSchema.extend({
      id: z.uuid({ error: 'მოწყობილობა არასწორია.' }),
      version: z
        .number()
        .int()
        .positive({ error: 'მოწყობილობის ვერსია არასწორია.' }),
    }),
  ],
  { error: 'მოწყობილობის მონაცემები არასწორია.' },
)
