import { z } from 'zod'

const userId = z
  .string({ error: 'თანამშრომელი არასწორია.' })
  .min(1, 'თანამშრომელი არასწორია.')
  .max(128, 'თანამშრომელი არასწორია.')
const page = z.coerce
  .number({ error: 'გვერდი არასწორია.' })
  .int('გვერდი არასწორია.')
  .min(1, 'გვერდი არასწორია.')
  .max(10000, 'გვერდი არასწორია.')
  .default(1)
export const employmentDateSchema = z.iso
  .date({ error: 'აირჩიეთ სწორი თარიღი.' })
  .pipe(
    z
      .string()
      .refine((value) => value >= '1900-01-01', 'თარიღი უნდა იყოს 1900 წლიდან.')
      .refine(
        (value) => value <= '2100-12-31',
        'თარიღი არ უნდა აღემატებოდეს 2100 წელს.',
      ),
  )
const reason = z
  .string({ error: 'მიუთითეთ ცვლილების მიზეზი.' })
  .trim()
  .min(5, 'მიზეზი უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.')
  .max(500, 'მიზეზი არ უნდა აღემატებოდეს 500 სიმბოლოს.')
  .optional()
const revision = z
  .number({ error: 'განაახლეთ მონაცემები.' })
  .int('ვერსია არასწორია.')
  .min(0, 'ვერსია არასწორია.')
  .max(2147483646, 'ვერსიის ლიმიტი ამოწურულია.')

export const employmentSearchSchema = z.object({
  employmentPage: page,
  employmentHistoryPage: page,
})
export const employmentReadSchema = z.object(
  { userId, ...employmentSearchSchema.shape },
  { error: 'მოთხოვნა არასწორია.' },
)
export const employmentPeriodFactsSchema = z.object({
  startDate: employmentDateSchema,
  endDate: employmentDateSchema.nullable(),
  voided: z.boolean(),
})
export const employmentWriteSchema = z
  .strictObject(
    {
      userId,
      expectedRevision: revision,
      periodId: z.uuid({ error: 'პერიოდი არასწორია.' }).nullable(),
      startDate: employmentDateSchema,
      endDate: employmentDateSchema.nullable(),
      reason,
    },
    { error: 'პერიოდის მონაცემები არასწორია.' },
  )
  .refine(
    (value) => value.endDate === null || value.endDate >= value.startDate,
    { path: ['endDate'], message: 'დასრულების თარიღი დაწყებამდე ვერ იქნება.' },
  )
export const employmentVoidSchema = z.strictObject(
  {
    userId,
    periodId: z.uuid({ error: 'პერიოდი არასწორია.' }),
    expectedRevision: revision,
    reason,
  },
  { error: 'მოთხოვნა არასწორია.' },
)
export const employmentFormSchema = z
  .object({
    startDate: employmentDateSchema,
    endDate: z.union([employmentDateSchema, z.literal('')], {
      error: 'აირჩიეთ სწორი თარიღი.',
    }),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    path: ['endDate'],
    message: 'დასრულების თარიღი დაწყებამდე ვერ იქნება.',
  })
export const employmentRangeSchema = z
  .object({
    employeeId: z.uuid({ error: 'თანამშრომელი არასწორია.' }),
    startDate: employmentDateSchema,
    endDate: employmentDateSchema,
  })
  .refine(
    (value) =>
      value.endDate >= value.startDate &&
      Date.parse(value.endDate) - Date.parse(value.startDate) <= 365 * 86400000,
    { path: ['endDate'], message: 'აირჩიეთ სწორი პერიოდი, მაქსიმუმ 366 დღე.' },
  )
