import { z } from 'zod'

export const amountBasisLabels = {
  gross: 'დარიცხული თანხა',
  net: 'ხელზე ასაღები თანხა',
} as const
export const dayBasisLabels = {
  scheduled_workdays: 'თვის სამუშაო დღეებით',
  calendar_days: 'თვის კალენდარული დღეებით',
  fixed_30: 'ფიქსირებული 30 დღით',
} as const

const basisPoints = z
  .number({ error: 'მიუთითეთ პროცენტი.' })
  .int('პროცენტს შეიძლება ჰქონდეს მაქსიმუმ ორი ათწილადი.')
  .min(1, 'პროცენტი უნდა იყოს მინიმუმ 0.01.')
  .max(10000, 'პროცენტი არ უნდა აღემატებოდეს 100-ს.')

export const payrollPolicySchema = z.object({
  effectiveFrom: z.iso.date({ error: 'მიუთითეთ სწორი თარიღი.' }),
  amountBasis: z.enum(['gross', 'net'], { error: 'აირჩიეთ თანხის ტიპი.' }),
  dayBasis: z.enum(['scheduled_workdays', 'calendar_days', 'fixed_30'], {
    error: 'აირჩიეთ დღიური თანხის გამოთვლის წესი.',
  }),
  incomeTaxEnabled: z.boolean({
    error: 'აირჩიეთ საშემოსავლოს გამოთვლის რეჟიმი.',
  }),
  incomeTaxBasisPoints: basisPoints,
  pensionEnabled: z.boolean({ error: 'აირჩიეთ საპენსიოს გამოთვლის რეჟიმი.' }),
  employeePensionBasisPoints: basisPoints,
  employerPensionBasisPoints: basisPoints,
})

const revision = z
  .number({ error: 'განაახლეთ პარამეტრები.' })
  .int('ვერსია არასწორია.')
  .min(0, 'ვერსია არასწორია.')
  .max(2147483646, 'ვერსიის ლიმიტი ამოწურულია.')
const reason = z
  .string({ error: 'მიუთითეთ ცვლილების მიზეზი.' })
  .trim()
  .min(5, 'მიზეზი უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.')
  .max(500, 'მიზეზი არ უნდა აღემატებოდეს 500 სიმბოლოს.')

export const savePayrollSettingsSchema = z.strictObject(
  {
    ...payrollPolicySchema.shape,
    expectedVersion: revision,
    reason,
  },
  { error: 'ხელფასების პარამეტრები არასწორია.' },
)

export function percentageToBasisPoints(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
export function formatPercentage(value: number) {
  return (value / 100).toFixed(2).replace(/\.?0+$/, '')
}
const percentage = z
  .string({ error: 'მიუთითეთ პროცენტი.' })
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, 'მიუთითეთ პროცენტი მაქსიმუმ ორი ათწილადით.')
  .refine((value) => {
    const parsed = percentageToBasisPoints(value)
    return parsed >= 1 && parsed <= 10000
  }, 'პროცენტი უნდა იყოს 0.01-დან 100-მდე.')

export const payrollSettingsFormSchema = savePayrollSettingsSchema.extend({
  incomeTaxBasisPoints: percentage,
  employeePensionBasisPoints: percentage,
  employerPensionBasisPoints: percentage,
})

export type PayrollPolicy = z.infer<typeof payrollPolicySchema>
export type PayrollSettingsFormValues = z.infer<
  typeof payrollSettingsFormSchema
>

/** Suggested values are an unsaved draft, not an active payroll policy. */
export function payrollSettingsDefaults(
  today: string,
): PayrollSettingsFormValues {
  return {
    effectiveFrom: today,
    amountBasis: 'gross',
    dayBasis: 'scheduled_workdays',
    incomeTaxEnabled: false,
    incomeTaxBasisPoints: '20',
    pensionEnabled: false,
    employeePensionBasisPoints: '2',
    employerPensionBasisPoints: '2',
    expectedVersion: 0,
    reason: '',
  }
}
