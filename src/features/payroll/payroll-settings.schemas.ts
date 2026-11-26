import { z } from 'zod'

export const payStageSchema = z.enum(['first', 'salary', 'adjustments'], {
  error: 'აირჩიეთ გადახდის ეტაპი.',
})
export const fineStageSchema = z.enum(['salary', 'adjustments'], {
  error: 'აირჩიეთ ჯარიმის დაქვითვის ეტაპი.',
})
const payStageLabels = {
  first: 'ხელფასის პირველი ნაწილი',
  salary: 'ხელფასის მეორე ნაწილი',
  adjustments: 'ბონუსები და პრემიები',
} as const
export function payStageLabel(stage: PayStage, twice: boolean) {
  return stage === 'salary' && !twice
    ? 'ხელფასის გადახდა'
    : payStageLabels[stage]
}

const day = z
  .number({ error: 'მიუთითეთ თვის დღე.' })
  .int('მიუთითეთ მთელი რიცხვი.')
  .min(1, 'დღე უნდა იყოს 1-დან 31-მდე.')
  .max(31, 'დღე უნდა იყოს 1-დან 31-მდე.')
const windowSchema = z
  .strictObject(
    {
      offset: z.union([z.literal(0), z.literal(1)], { error: 'აირჩიეთ თვე.' }),
      start: day,
      end: day,
    },
    { error: 'მიუთითეთ გაცემის თვე და დღეები.' },
  )
  .refine(({ start, end }) => start <= end, {
    path: ['end'],
    message: 'ბოლო დღე საწყის დღეზე ადრე ვერ იქნება.',
  })

export const paymentScheduleSchema = z
  .strictObject(
    {
      first: windowSchema.nullable(),
      salary: windowSchema,
      adjustments: windowSchema,
      fineStage: fineStageSchema,
    },
    { error: 'გაცემის გრაფიკი არასწორია.' },
  )
  .superRefine((value, context) => {
    const { first, salary } = value
    if (
      first &&
      first.offset * 31 + first.end >= salary.offset * 31 + salary.start
    )
      context.addIssue({
        code: 'custom',
        path: ['salary', 'start'],
        message:
          'მეორე ნაწილის გაცემა პირველი ნაწილის პერიოდის შემდეგ უნდა დაიწყოს.',
      })
  })

export const savePayrollSettingsSchema = z.strictObject(
  {
    schedule: paymentScheduleSchema,
    expectedVersion: z
      .number({ error: 'განაახლეთ პარამეტრები.' })
      .int('ვერსია არასწორია.')
      .min(0, 'ვერსია არასწორია.')
      .max(2147483646, 'ვერსიის ლიმიტი ამოწურულია.'),
  },
  { error: 'ხელფასების პარამეტრები არასწორია.' },
)

export type PayStage = z.infer<typeof payStageSchema>
export type FineStage = z.infer<typeof fineStageSchema>
export type PaymentSchedule = z.infer<typeof paymentScheduleSchema>
export type PaymentWindow = NonNullable<PaymentSchedule['first']>

export const firstPaymentDefault: PaymentWindow = {
  offset: 0,
  start: 25,
  end: 29,
}
export const paymentScheduleDefaults: PaymentSchedule = {
  first: firstPaymentDefault,
  salary: { offset: 1, start: 10, end: 15 },
  adjustments: { offset: 1, start: 15, end: 20 },
  fineStage: 'salary',
}
