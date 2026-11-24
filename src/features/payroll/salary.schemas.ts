import { z } from 'zod'

export const salaryDateSchema = z.iso
  .date({ error: 'აირჩიეთ სწორი თარიღი.' })
  .pipe(
    z
      .string()
      .refine(
        (value) => value >= '1900-01-01' && value <= '2100-12-31',
        'თარიღი უნდა იყოს 1900 წლიდან 2100 წლის ჩათვლით.',
      ),
  )
const page = z.coerce
  .number({ error: 'გვერდი არასწორია.' })
  .int('გვერდი არასწორია.')
  .min(1, 'გვერდი არასწორია.')
  .max(10000, 'გვერდი არასწორია.')
  .default(1)
export const salaryKindSchema = z.enum(['monthly', 'hourly'], {
  error: 'აირჩიეთ ხელფასის ტიპი.',
})
export const salaryBasisSchema = z.enum(['gross', 'net'], {
  error: 'აირჩიეთ თანხის საფუძველი.',
})
export const salaryDirectorySchema = z.object(
  {
    page,
    q: z
      .string({ error: 'ძიება არასწორია.' })
      .trim()
      .max(100, 'ძიება არ უნდა აღემატებოდეს 100 სიმბოლოს.')
      .default(''),
    kind: z
      .enum(['all', 'monthly', 'hourly', 'unconfigured'], {
        error: 'ფილტრი არასწორია.',
      })
      .default('all'),
    status: z
      .enum(['active', 'inactive', 'all'], { error: 'სტატუსი არასწორია.' })
      .default('active'),
    sort: z
      .enum(['name', 'name_desc'], { error: 'დალაგება არასწორია.' })
      .default('name'),
  },
  { error: 'მოთხოვნა არასწორია.' },
)
export const salaryHistorySearchSchema = z.object({ page })
export const salarySelfReadSchema = z.strictObject(
  { page },
  { error: 'მოთხოვნა არასწორია.' },
)
export const salaryFilterFormSchema = z.object({
  page: z
    .number({ error: 'გვერდი არასწორია.' })
    .int('გვერდი არასწორია.')
    .min(1, 'გვერდი არასწორია.'),
  q: salaryDirectorySchema.shape.q.removeDefault(),
  kind: salaryDirectorySchema.shape.kind.removeDefault(),
  status: salaryDirectorySchema.shape.status.removeDefault(),
  sort: salaryDirectorySchema.shape.sort.removeDefault(),
})
export const salaryDetailSchema = z.object(
  {
    userId: z
      .string({ error: 'თანამშრომელი არასწორია.' })
      .min(1, 'თანამშრომელი არასწორია.')
      .max(128, 'თანამშრომელი არასწორია.'),
    page,
  },
  { error: 'მოთხოვნა არასწორია.' },
)
const target = z.strictObject(
  {
    userId: salaryDetailSchema.shape.userId,
    expectedVersion: z
      .number({ error: 'განაახლეთ მონაცემები.' })
      .int('ვერსია არასწორია.')
      .min(0, 'ვერსია არასწორია.')
      .max(2147483646, 'ვერსია ამოწურულია.'),
  },
  { error: 'თანამშრომლის მონაცემები არასწორია.' },
)
export const salarySaveSchema = z.strictObject(
  {
    targets: z
      .array(target, { error: 'აირჩიეთ თანამშრომლები.' })
      .min(1, 'აირჩიეთ თანამშრომელი.')
      .max(100, 'ერთად აირჩიეთ მაქსიმუმ 100 თანამშრომელი.')
      .refine(
        (items) =>
          new Set(items.map((item) => item.userId)).size === items.length,
        'თანამშრომლები არ უნდა განმეორდეს.',
      ),
    effectiveFrom: salaryDateSchema,
    kind: salaryKindSchema,
    amountBasis: salaryBasisSchema,
    amountMinor: z
      .number({ error: 'მიუთითეთ სწორი თანხა.' })
      .int('თანხა უნდა შეიცავდეს მაქსიმუმ ორ ათწილადს.')
      .min(1, 'თანხა უნდა იყოს ნულზე მეტი.')
      .max(100000000, 'თანხა არ უნდა აღემატებოდეს 1 000 000 ლარს.'),
    currency: z.literal('GEL', { error: 'ვალუტა უნდა იყოს ლარი.' }),
    reason: z
      .string({ error: 'მიუთითეთ ცვლილების მიზეზი.' })
      .trim()
      .min(5, 'მიზეზი უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.')
      .max(500, 'მიზეზი არ უნდა აღემატებოდეს 500 სიმბოლოს.'),
  },
  { error: 'ხელფასის მონაცემები არასწორია.' },
)
const amount = z
  .string({ error: 'მიუთითეთ თანხა.' })
  .trim()
  .regex(/^\d{1,7}([.,]\d{1,2})?$/, 'თანხა მიუთითეთ მაქსიმუმ ორი ათწილადით.')
  .refine((value) => {
    const minor = salaryToMinor(value)
    return minor > 0 && minor <= 100000000
  }, 'თანხა უნდა იყოს ნულზე მეტი და მაქსიმუმ 1 000 000 ლარი.')
export const salaryFormSchema = z.object({
  effectiveFrom: salaryDateSchema,
  kind: salaryKindSchema,
  amountBasis: salaryBasisSchema,
  amount,
  reason: salarySaveSchema.shape.reason,
})
/** Parse decimal text into exact integer tetri without binary floating-point rounding. */
export function salaryToMinor(value: string) {
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
export function salaryAmountInput(minor: number) {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`
}
export type SalaryDirectorySearch = z.infer<typeof salaryDirectorySchema>
