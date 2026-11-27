import { z } from 'zod'
import { recordIdSchema } from '#/lib/route-schemas'

const policyDate = z.iso.date({ error: 'მიუთითეთ მოქმედების სწორი თარიღი.' })
const policyReason = z
  .string({ error: 'მიუთითეთ ცვლილების მიზეზი.' })
  .trim()
  .max(500, 'მიზეზი არ უნდა აღემატებოდეს 500 სიმბოლოს.')
  .refine(
    (value) => value.length === 0 || value.length >= 5,
    'მიზეზი უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.',
  )

export const readRestDayPolicySchema = z.strictObject(
  {
    userId: recordIdSchema,
    page: z.coerce
      .number({ error: 'გვერდის ნომერი არასწორია.' })
      .int('გვერდის ნომერი არასწორია.')
      .min(1, 'გვერდის ნომერი არასწორია.')
      .max(1000, 'გვერდის ნომერი არასწორია.')
      .default(1),
  },
  { error: 'დასვენების დღის წესების მოთხოვნა არასწორია.' },
)

export const saveRestDayPolicySchema = z.strictObject(
  {
    userId: recordIdSchema,
    expectedVersion: z
      .number({ error: 'განაახლეთ ჩანაწერი.' })
      .int('ვერსია არასწორია.')
      .min(0, 'ვერსია არასწორია.')
      .max(2147483646, 'ვერსია ამოწურულია.'),
    effectiveFrom: policyDate
      .refine(
        (value) => value >= '1900-01-01' && value <= '2100-12-31',
        'მოქმედების თარიღი დასაშვებ საზღვრებში უნდა იყოს.',
      )
      .optional(),
    restDayClockInAllowed: z.boolean({
      error: 'მიუთითეთ დასვენების დღეს შესვლის ნებართვა.',
    }),
    autoRestDayBonusEnabled: z.boolean({
      error: 'მიუთითეთ ავტომატური ბონუსის პარამეტრი.',
    }),
    reason: policyReason.optional(),
  },
  { error: 'დასვენების დღის წესების მონაცემები არასწორია.' },
)

export const restDayPolicyFormSchema = z.object(
  {
    restDayClockInAllowed: z.boolean({
      error: 'მიუთითეთ დასვენების დღეს შესვლის ნებართვა.',
    }),
    autoRestDayBonusEnabled: z.boolean({
      error: 'მიუთითეთ ავტომატური ბონუსის პარამეტრი.',
    }),
  },
  { error: 'დასვენების დღის წესების ფორმა არასწორია.' },
)
