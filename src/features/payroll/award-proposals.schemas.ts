import { z } from 'zod'
import { calendarDateSchema } from './payroll-calendar.schemas'
import {
  bonusRuleSearchSchema,
  bonusCalculationSchema,
} from './bonus-rules.schemas'
import { salarySaveSchema } from './salary.schemas'

const id = z
  .uuid({ error: 'ჩანაწერის იდენტიფიკატორი არასწორია.' })
  .transform((value) => value.toLowerCase())
const userId = z
  .string({ error: 'აირჩიეთ თანამშრომელი.' })
  .min(1, 'აირჩიეთ თანამშრომელი.')
  .max(128, 'თანამშრომელი არასწორია.')
export const awardSearchSchema = z.object(
  {
    page: bonusRuleSearchSchema.shape.page,
    q: bonusRuleSearchSchema.shape.q,
    status: z
      .enum(
        ['all', 'proposed', 'withdrawn', 'approved', 'rejected', 'revoked'],
        { error: 'სტატუსი არასწორია.' },
      )
      .default('proposed'),
    sort: z
      .enum(['newest', 'oldest'], { error: 'დალაგება არასწორია.' })
      .default('newest'),
  },
  { error: 'განაცხადების მოთხოვნა არასწორია.' },
)
export const awardFilterSchema = z.object({
  q: awardSearchSchema.shape.q.removeDefault(),
  status: awardSearchSchema.shape.status.removeDefault(),
  sort: awardSearchSchema.shape.sort.removeDefault(),
})
export const awardIdSchema = z.object(
  { proposalId: id },
  { error: 'განაცხადის იდენტიფიკატორი არასწორია.' },
)
export const awardHistorySchema = z.object(
  {
    page: bonusRuleSearchSchema.shape.page,
    q: bonusRuleSearchSchema.shape.q,
  },
  { error: 'ისტორიის მოთხოვნა არასწორია.' },
)
export const awardDetailSchema = awardIdSchema.extend(awardHistorySchema.shape)
export const awardLookupSchema = z.object(
  {
    ruleId: id.nullable().default(null),
    kind: z.enum(['employee', 'rule', 'job'], { error: 'არჩევანი არასწორია.' }),
    q: bonusRuleSearchSchema.shape.q,
    page: bonusRuleSearchSchema.shape.page,
    workDate: calendarDateSchema,
    userId: userId.nullable().default(null),
  },
  { error: 'არჩევანის მოთხოვნა არასწორია.' },
)
export const awardLookupFormSchema = z.object({
  q: bonusRuleSearchSchema.shape.q.removeDefault(),
})
export const awardQuantitySchema = z
  .string({ error: 'მიუთითეთ მიღებული რაოდენობა.' })
  .trim()
  .regex(
    /^\d{1,6}([.,]\d{1,3})?$/,
    'რაოდენობა მიუთითეთ მაქსიმუმ სამი ათწილადით.',
  )
  .refine((value) => {
    const n = quantityToMilli(value)
    return n > 0 && n <= 100000000
  }, 'რაოდენობა უნდა იყოს ნულზე მეტი და მაქსიმუმ 100 000 ერთეული.')
export function quantityToMilli(value: string) {
  const [whole, fraction = ''] = value.replace(',', '.').split('.')
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))
}
export function quantityInput(value: number) {
  return `${Math.floor(value / 1000)}.${String(value % 1000).padStart(3, '0')}`
}
export function normalizeAwardReference(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ka-GE')
}
const fields = {
  userId,
  ruleId: id,
  workDate: calendarDateSchema,
  jobId: id.nullable(),
  reference: z
    .string({ error: 'მიუთითეთ წყაროს ნომერი.' })
    .trim()
    .max(160, 'ნომერი არ უნდა აღემატებოდეს 160 სიმბოლოს.')
    .refine(
      (value) => !/[\p{Cc}\p{Cf}]/u.test(value),
      'ნომერი არ უნდა შეიცავდეს უხილავ ან საკონტროლო სიმბოლოებს.',
    ),
  evidence: z
    .string({ error: 'მიუთითეთ შესრულების მტკიცებულება.' })
    .trim()
    .min(5, 'მტკიცებულება უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.')
    .max(1000, 'მტკიცებულება არ უნდა აღემატებოდეს 1000 სიმბოლოს.'),
  reason: salarySaveSchema.shape.reason,
  expectedRuleVersion: z
    .number({ error: 'ხელახლა აირჩიეთ წესი.' })
    .int('ვერსია არასწორია.')
    .min(1, 'ხელახლა აირჩიეთ წესი.')
    .max(2147483647, 'ვერსია არასწორია.'),
}
export const awardInputFields = fields
const source = (
  v: { jobId: string | null; reference: string },
  ctx: z.RefinementCtx,
) => {
  if (v.jobId === null && normalizeAwardReference(v.reference).length > 160)
    ctx.addIssue({
      code: 'custom',
      path: ['reference'],
      message: 'წყაროს ნორმალიზებული ნომერი არ უნდა აღემატებოდეს 160 სიმბოლოს.',
    })
  if (v.jobId === null && normalizeAwardReference(v.reference).length < 3)
    ctx.addIssue({
      code: 'custom',
      path: ['reference'],
      message: 'მიუთითეთ მინიმუმ 3 სიმბოლოსგან შემდგარი წყაროს ნომერი.',
    })
  if (v.jobId !== null && v.reference !== '')
    ctx.addIssue({
      code: 'custom',
      path: ['reference'],
      message: 'სამუშაოს წყარო შეირჩევა სამუშაოების სიიდან.',
    })
}
export const validateAwardSourceReference = source
export const awardFormSchema = z
  .object({
    ...fields,
    quantity: awardQuantitySchema,
    calculation: bonusCalculationSchema,
  })
  .omit({ expectedRuleVersion: true })
  .superRefine((v, ctx) => {
    if (v.calculation === 'job' && v.jobId === null)
      ctx.addIssue({
        code: 'custom',
        path: ['jobId'],
        message: 'აირჩიეთ დასრულებული სამუშაო.',
      })
    if (v.calculation !== 'job') source(v, ctx)
    const quantity = quantityToMilli(v.quantity)
    if (
      (v.calculation === 'fixed' || v.calculation === 'job') &&
      quantity !== 1000
    )
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'ამ წესისთვის რაოდენობა უნდა იყოს ერთი.',
      })
    if (v.calculation === 'task' && quantity % 1000 !== 0)
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'დავალებების რაოდენობა უნდა იყოს მთელი რიცხვი.',
      })
  })
export const saveAwardSchema = z
  .strictObject(
    {
      ...fields,
      proposalId: id.nullable(),
      expectedVersion: z
        .number({ error: 'განაახლეთ განაცხადი.' })
        .int('ვერსია არასწორია.')
        .min(0, 'ვერსია არასწორია.')
        .max(2147483646, 'ვერსია ამოწურულია.'),
      requestId: id,
      quantityMilli: z
        .number({ error: 'რაოდენობა არასწორია.' })
        .int('რაოდენობა არასწორია.')
        .min(1, 'მიუთითეთ მიღებული რაოდენობა.')
        .max(100000000, 'რაოდენობა აღემატება დაშვებულ ზღვარს.'),
    },
    { error: 'განაცხადის მონაცემები არასწორია.' },
  )
  .superRefine((v, ctx) => {
    source(v, ctx)
    if ((v.proposalId === null) !== (v.expectedVersion === 0))
      ctx.addIssue({
        code: 'custom',
        path: ['expectedVersion'],
        message: 'განაახლეთ განაცხადის ვერსია.',
      })
  })
export const withdrawAwardSchema = z.strictObject(
  {
    proposalId: id,
    expectedVersion: z
      .number({ error: 'განაახლეთ განაცხადი.' })
      .int('ვერსია არასწორია.')
      .min(1, 'ვერსია არასწორია.')
      .max(2147483646, 'ვერსია ამოწურულია.'),
    requestId: id,
    reason: salarySaveSchema.shape.reason,
  },
  { error: 'გაუქმების მონაცემები არასწორია.' },
)
export type AwardSearch = z.infer<typeof awardSearchSchema>
