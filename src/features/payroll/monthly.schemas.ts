import { z } from 'zod'
import { fineStageSchema, payStageSchema } from './payroll-settings.schemas'
import {
  payrollMonthSchema,
  salaryDetailSchema,
  salaryDirectorySchema,
  salaryToMinor,
} from './salary.schemas'

export { payrollMonthSchema } from './salary.schemas'
export const monthlyPeriodSchema = z.enum(['all', 'first', 'salary'], {
  error: 'აირჩიეთ სახელფასო პერიოდი.',
})
export const monthlySearchSchema = z.object(
  {
    view: z.literal('bonuses', { error: 'განყოფილება არასწორია.' }).optional(),
    month: payrollMonthSchema.optional(),
    period: monthlyPeriodSchema.optional(),
    page: salaryDirectorySchema.shape.page,
    q: salaryDirectorySchema.shape.q,
    sort: salaryDirectorySchema.shape.sort,
  },
  { error: 'უწყისის ფილტრები არასწორია.' },
)
export const monthlyDetailSchema = z.strictObject(
  {
    month: payrollMonthSchema,
    userId: salaryDetailSchema.shape.userId,
    page: salaryDirectorySchema.shape.page,
  },
  { error: 'თანამშრომლის უწყისის მოთხოვნა არასწორია.' },
)
const reasonText = z
  .string({ error: 'მიუთითეთ მიზეზი.' })
  .trim()
  .max(500, 'მიზეზი არ უნდა აღემატებოდეს 500 სიმბოლოს.')
const shortReason = 'მიზეზი უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.'
const reason = reasonText.min(5, shortReason)
const money = z
  .number({ error: 'მიუთითეთ სწორი თანხა.' })
  .int('თანხა მიუთითეთ თეთრებში.')
  .min(0, 'თანხა უარყოფითი ვერ იქნება.')
  .max(100000000, 'თანხა არ უნდა აღემატებოდეს 1 000 000 ლარს.')
const adjustmentNote = z
  .string({ error: 'შენიშვნა არასწორია.' })
  .trim()
  .max(500, 'შენიშვნა არ უნდა აღემატებოდეს 500 სიმბოლოს.')
const paymentDate = z.iso.date({ error: 'აირჩიეთ სწორი გადახდის თარიღი.' })
const paymentDatesSchema = z.strictObject(
  {
    salary: paymentDate.optional(),
    adjustments: paymentDate.optional(),
  },
  { error: 'გადახდის თარიღები არასწორია.' },
)
export type MonthlyPaymentDates = z.infer<typeof paymentDatesSchema>
const hasFineReason = (item: { kind: string; reason: string }) =>
  item.kind !== 'fine' || item.reason.length >= 5
const fineReasonError = {
  path: ['reason'],
  message: 'ჯარიმის შენიშვნა უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.',
}
export const monthlyAdjustmentSchema = z
  .strictObject(
    {
      kind: z.enum(['bonus', 'premium', 'fine'], {
        error: 'აირჩიეთ ჩანაწერის ტიპი.',
      }),
      amountMinor: money.min(1, 'თანხა უნდა იყოს ნულზე მეტი.'),
      reason: adjustmentNote.default(''),
    },
    { error: 'ბონუსის, პრემიის ან ჯარიმის ჩანაწერი არასწორია.' },
  )
  .refine(hasFineReason, fineReasonError)
const requestId = z
  .uuid({ error: 'განაახლეთ ფორმა.' })
  .transform((v) => v.toLowerCase())
export const monthlySaveSchema = z
  .strictObject(
    {
      month: payrollMonthSchema,
      userId: salaryDetailSchema.shape.userId,
      expectedVersion: z
        .number({ error: 'განაახლეთ ჩანაწერი.' })
        .int('ვერსია არასწორია.')
        .min(0, 'ვერსია არასწორია.')
        .max(2147483646, 'ვერსია ამოწურულია.'),
      sourceToken: z
        .string({ error: 'განაახლეთ ხელფასის მონაცემები.' })
        .regex(/^[a-f0-9]{64}$/, 'განაახლეთ ხელფასის მონაცემები.'),
      workedSeconds: z
        .number({ error: 'მიუთითეთ დადასტურებული საათები.' })
        .int('დრო არასწორია.')
        .min(0, 'დრო უარყოფითი ვერ იქნება.')
        .max(2678400, 'საათების რაოდენობა არასწორია.')
        .refine(
          (value) => value % 36 === 0,
          'საათები მიუთითეთ მაქსიმუმ ორი ათწილადით.',
        ),
      baseOverrideMinor: money.nullable(),
      firstPaymentMinor: money.nullable().optional(),
      fineStage: fineStageSchema.nullable().optional(),
      paymentDates: paymentDatesSchema.optional(),
      baseReason: z
        .string({ error: 'მიუთითეთ თვის ხელფასის საფუძველი.' })
        .trim()
        .max(500, 'მიზეზი არ უნდა აღემატებოდეს 500 სიმბოლოს.')
        .optional(),
      adjustments: z
        .array(monthlyAdjustmentSchema, { error: 'ჩანაწერები არასწორია.' })
        .max(20, 'დაამატეთ მაქსიმუმ 20 ჩანაწერი.'),
      reason: reason.optional(),
      requestId,
    },
    { error: 'უწყისის მონაცემები არასწორია.' },
  )
  .refine(
    (v) =>
      v.baseOverrideMinor === null ||
      v.baseReason === undefined ||
      v.baseReason.length >= 5,
    {
      path: ['baseReason'],
      message: 'მიუთითეთ თვის ხელფასის საფუძველი, მინიმუმ 5 სიმბოლო.',
    },
  )
export const paymentPreviewSchema = z.strictObject({
  month: payrollMonthSchema,
  stage: payStageSchema,
  userId: salaryDetailSchema.shape.userId.optional(),
})
export const publishPaymentsSchema = paymentPreviewSchema.extend({
  expectedToken: z
    .string({ error: 'განაახლეთ გასაცემი თანხები.' })
    .regex(/^[a-f0-9]{64}$/, 'განაახლეთ გასაცემი თანხები.'),
  requestId,
})
export const monthlyAdjustmentsSaveSchema = z.strictObject(
  {
    month: payrollMonthSchema,
    userId: monthlySaveSchema.shape.userId,
    expectedVersion: monthlySaveSchema.shape.expectedVersion,
    requestId,
    fineStage: fineStageSchema.nullable().optional(),
    paymentDates: paymentDatesSchema.optional(),
    adjustments: z
      .array(monthlyAdjustmentSchema, { error: 'ჩანაწერები არასწორია.' })
      .max(20, 'დაამატეთ მაქსიმუმ 20 ჩანაწერი.'),
  },
  { error: 'დამატებითი ჩანაწერების მონაცემები არასწორია.' },
)
const decimal = z
  .string({ error: 'მიუთითეთ რიცხვი.' })
  .trim()
  .regex(/^\d{1,7}([.,]\d{1,2})?$/, 'რიცხვი მიუთითეთ მაქსიმუმ ორი ათწილადით.')
export const monthlyFormSchema = z
  .object(
    {
      hours: decimal.refine(
        (v) => salaryToMinor(v) <= 74400,
        'საათები უნდა იყოს 0-დან 744-მდე.',
      ),
      base: z.union(
        [
          decimal.refine(
            (v) => salaryToMinor(v) <= 100000000,
            'თანხა არ უნდა აღემატებოდეს 1 000 000 ლარს.',
          ),
          z.literal(''),
        ],
        { error: 'მიუთითეთ თვის ხელფასის სწორი თანხა.' },
      ),
      manualBase: z.boolean({ error: 'აირჩიეთ თვის ხელფასის დადასტურება.' }),
      firstPayment: z.union([
        decimal.refine(
          (value) => salaryToMinor(value) <= 100000000,
          'თანხა არ უნდა აღემატებოდეს 1 000 000 ლარს.',
        ),
        z.literal(''),
      ]),
      fineStage: fineStageSchema.nullable(),
      paymentDates: z.object({
        salary: paymentDate.or(z.literal('')),
        adjustments: paymentDate.or(z.literal('')),
      }),
      adjustments: z
        .array(
          z
            .object(
              {
                kind: monthlyAdjustmentSchema.shape.kind,
                amount: decimal.refine(
                  (v) => salaryToMinor(v) > 0 && salaryToMinor(v) <= 100000000,
                  'მიუთითეთ დადებითი თანხა, მაქსიმუმ 1 000 000 ლარი.',
                ),
                reason: adjustmentNote,
              },
              { error: 'დამატებითი ჩანაწერი არასწორია.' },
            )
            .refine(hasFineReason, fineReasonError),
          { error: 'დამატებითი ჩანაწერების სია არასწორია.' },
        )
        .max(20, 'დაამატეთ მაქსიმუმ 20 ჩანაწერი.'),
    },
    { error: 'უწყისის ფორმა არასწორია.' },
  )
  .refine((v) => !v.manualBase || v.base !== '', {
    path: ['base'],
    message: 'მიუთითეთ თვის ხელფასი.',
  })
const removalReason = reasonText.refine(
  (value) => !value || value.length >= 5,
  shortReason,
)
export const monthlyRemoveFormSchema = z.object({ reason: removalReason })
export const monthlyRemoveSchema = z.strictObject(
  {
    month: payrollMonthSchema,
    userId: salaryDetailSchema.shape.userId,
    expectedVersion: monthlySaveSchema.shape.expectedVersion,
    reason: removalReason.default(''),
    requestId,
  },
  { error: 'ჩანაწერის მონაცემები არასწორია.' },
)
export type MonthlySearch = z.infer<typeof monthlySearchSchema>
export type MonthlyAdjustment = z.infer<typeof monthlyAdjustmentSchema>
