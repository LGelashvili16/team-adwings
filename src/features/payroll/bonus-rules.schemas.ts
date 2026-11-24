import { z } from 'zod'
import { calendarDateSchema } from './payroll-calendar.schemas'
import {
  salaryBasisSchema,
  salaryFormSchema,
  salarySaveSchema,
} from './salary.schemas'

export const bonusKindSchema = z.enum(['bonus', 'premium'], {
  error: 'აირჩიეთ წახალისების ტიპი.',
})
export const bonusCalculationSchema = z.enum(
  ['fixed', 'job', 'task', 'additional_work'],
  { error: 'აირჩიეთ გამოთვლის წესი.' },
)
const page = z.coerce
  .number({ error: 'გვერდი არასწორია.' })
  .int('გვერდი არასწორია.')
  .min(1, 'გვერდი არასწორია.')
  .max(10000, 'გვერდი არასწორია.')
  .default(1)
export const bonusRuleSearchSchema = z.object({
  page,
  q: z
    .string({ error: 'ძიება არასწორია.' })
    .trim()
    .max(100, 'ძიება არ უნდა აღემატებოდეს 100 სიმბოლოს.')
    .default(''),
  kind: z
    .enum(['all', 'bonus', 'premium'], { error: 'ტიპი არასწორია.' })
    .default('all'),
  sort: z
    .enum(['name', 'name_desc'], { error: 'დალაგება არასწორია.' })
    .default('name'),
})
export const bonusRuleFilterSchema = z.object({
  q: bonusRuleSearchSchema.shape.q.removeDefault(),
  kind: bonusRuleSearchSchema.shape.kind.removeDefault(),
  sort: bonusRuleSearchSchema.shape.sort.removeDefault(),
})
export const bonusRuleIdSchema = z.object({
  ruleId: z.uuid({ error: 'წესის იდენტიფიკატორი არასწორია.' }),
})
export const bonusRuleHistorySchema = z.object({
  page,
  q: bonusRuleSearchSchema.shape.q,
})
export const bonusRuleHistoryFilterSchema = z.object({
  q: bonusRuleSearchSchema.shape.q.removeDefault(),
})
export const bonusRuleDetailSchema = bonusRuleIdSchema.extend(
  bonusRuleHistorySchema.shape,
)
const fields = {
  name: z
    .string({ error: 'მიუთითეთ დასახელება.' })
    .trim()
    .min(3, 'დასახელება უნდა შეიცავდეს მინიმუმ 3 სიმბოლოს.')
    .max(120, 'დასახელება არ უნდა აღემატებოდეს 120 სიმბოლოს.'),
  effectiveFrom: calendarDateSchema,
  kind: bonusKindSchema,
  calculation: bonusCalculationSchema,
  unitLabel: z
    .string({ error: 'მიუთითეთ ერთეული.' })
    .trim()
    .max(60, 'ერთეული არ უნდა აღემატებოდეს 60 სიმბოლოს.'),
  qualification: z
    .string({ error: 'მიუთითეთ მინიჭების პირობა.' })
    .trim()
    .min(5, 'პირობა უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.')
    .max(1000, 'პირობა არ უნდა აღემატებოდეს 1000 სიმბოლოს.'),
  amountBasis: salaryBasisSchema,
  enabled: z.boolean({ error: 'აირჩიეთ წესის მდგომარეობა.' }),
  reason: salarySaveSchema.shape.reason,
}
function compatible(
  value: { kind: string; calculation: string; unitLabel: string },
  ctx: z.RefinementCtx,
) {
  if (value.kind === 'premium' && value.calculation !== 'fixed')
    ctx.addIssue({
      code: 'custom',
      path: ['calculation'],
      message: 'პრემია უნდა იყოს ფიქსირებული თანხა.',
    })
  if (
    value.calculation === 'additional_work'
      ? value.unitLabel.length < 2
      : value.unitLabel !== ''
  )
    ctx.addIssue({
      code: 'custom',
      path: ['unitLabel'],
      message:
        'დამატებითი სამუშაოსთვის მიუთითეთ ერთეული, სხვა შემთხვევაში დატოვეთ ცარიელი.',
    })
}
export const bonusRuleFormSchema = z
  .object({ ...fields, amount: salaryFormSchema.shape.amount })
  .superRefine(compatible)
export const saveBonusRuleSchema = z
  .strictObject(
    {
      ...fields,
      ruleId: bonusRuleIdSchema.shape.ruleId.nullable(),
      expectedVersion: z
        .number({ error: 'განაახლეთ წესი.' })
        .int('ვერსია არასწორია.')
        .min(0, 'ვერსია არასწორია.')
        .max(2147483646, 'ვერსია ამოწურულია.'),
      requestId: z.uuid({ error: 'მოთხოვნის იდენტიფიკატორი არასწორია.' }),
      amountMinor: salarySaveSchema.shape.amountMinor,
      currency: salarySaveSchema.shape.currency,
    },
    { error: 'წესის მონაცემები არასწორია.' },
  )
  .superRefine((value, ctx) => {
    compatible(value, ctx)
    if ((value.ruleId === null) !== (value.expectedVersion === 0))
      ctx.addIssue({
        code: 'custom',
        path: ['expectedVersion'],
        message:
          'ახალი წესისთვის ვერსია უნდა იყოს ნული, ცვლილებისთვის განაახლეთ მონაცემები.',
      })
  })
export type BonusRuleSearch = z.infer<typeof bonusRuleSearchSchema>
export type SaveBonusRule = z.infer<typeof saveBonusRuleSchema>
