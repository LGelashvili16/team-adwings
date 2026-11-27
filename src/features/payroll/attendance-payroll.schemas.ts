import { z } from 'zod'
import { payrollMonthSchema, salaryDetailSchema, salaryDirectorySchema, salaryToMinor } from './salary.schemas'

export const attendancePayrollItemKindSchema = z.enum(
  [
    'fixed_rest_day_bonus',
    'missing_scheduled_day',
    'hourly_earning',
    'gps_job_earning',
    'gps_conflict',
  ],
  { error: 'ჩანაწერის ტიპი არასწორია.' },
)

export const attendancePayrollActionSchema = z.enum(
  ['approved', 'overridden', 'voided', 'resolved'],
  { error: 'გადაწყვეტილების ტიპი არასწორია.' },
)

export const attendancePayrollReviewSearchSchema = z.object(
  {
    month: payrollMonthSchema.optional(),
    q: salaryDirectorySchema.shape.q,
    onlyFlagged: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .optional()
      .transform((value) => value === true || value === 'true'),
    page: salaryDirectorySchema.shape.page,
  },
  { error: 'გადამოწმების ფილტრები არასწორია.' },
)

export const attendancePayrollDetailSchema = z.strictObject(
  {
    month: payrollMonthSchema,
    userId: salaryDetailSchema.shape.userId,
  },
  { error: 'თანამშრომლის გამოთვლების მოთხოვნა არასწორია.' },
)

const decisionReason = z
  .string({ error: 'მიუთითეთ გადაწყვეტილების მიზეზი.' })
  .trim()
  .min(5, 'მიზეზი უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.')
  .max(500, 'მიზეზი არ უნდა აღემატებოდეს 500 სიმბოლოს.')

const noteText = z
  .string({ error: 'შენიშვნა არასწორია.' })
  .trim()
  .max(500, 'შენიშვნა არ უნდა აღემატებოდეს 500 სიმბოლოს.')
const optionalNote = noteText.default('')

const money = z
  .number({ error: 'მიუთითეთ სწორი თანხა.' })
  .int('თანხა მიუთითეთ თეთრებში.')
  .min(0, 'თანხა უარყოფითი ვერ იქნება.')
  .max(100000000, 'თანხა არ უნდა აღემატებოდეს 1 000 000 ლარს.')

export const saveAttendancePayrollDecisionSchema = z
  .strictObject(
    {
      month: payrollMonthSchema,
      userId: salaryDetailSchema.shape.userId,
      itemKey: z
        .string({ error: 'ჩანაწერის იდენტიფიკატორი არასწორია.' })
        .trim()
        .min(3, 'ჩანაწერის იდენტიფიკატორი არასწორია.')
        .max(160, 'ჩანაწერის იდენტიფიკატორი არასწორია.'),
      itemKind: attendancePayrollItemKindSchema,
      expectedVersion: z
        .number({ error: 'განაახლეთ ჩანაწერი.' })
        .int('ვერსია არასწორია.')
        .min(0, 'ვერსია არასწორია.')
        .max(2147483646, 'ვერსია ამოწურულია.'),
      sourceHash: z
        .string({ error: 'განაახლეთ გამოთვლის მონაცემები.' })
        .regex(/^[a-f0-9]{64}$/, 'განაახლეთ გამოთვლის მონაცემები.'),
      action: attendancePayrollActionSchema,
      overrideAmountMinor: money.nullable().optional(),
      overrideSeconds: z
        .number({ error: 'დრო არასწორია.' })
        .int('დრო არასწორია.')
        .min(0, 'დრო უარყოფითი ვერ იქნება.')
        .max(2678400, 'დროის მნიშვნელობა დასაშვებ საზღვარს აღემატება.')
        .nullable()
        .optional(),
      note: optionalNote.optional(),
      reason: decisionReason,
      requestId: z
        .uuid({ error: 'განაახლეთ ფორმა.' })
        .transform((value) => value.toLowerCase()),
    },
    { error: 'გადაწყვეტილების მონაცემები არასწორია.' },
  )
  .refine(
    (value) =>
      value.action !== 'overridden' || value.overrideAmountMinor != null,
    {
      path: ['overrideAmountMinor'],
      message: 'კორექტირებისას მიუთითეთ ახალი თანხა.',
    },
  )

const decimalText = z
  .string({ error: 'მიუთითეთ სწორი რიცხვი.' })
  .trim()
  .regex(/^\d{1,7}([.,]\d{1,2})?$/, 'რიცხვი მიუთითეთ მაქსიმუმ ორი ათწილადით.')

export const attendancePayrollDecisionFormSchema = z
  .object({
    action: attendancePayrollActionSchema,
    overrideAmount: z.union([
      decimalText.refine(
        (value) => salaryToMinor(value) <= 100000000,
        'თანხა არ უნდა აღემატებოდეს 1 000 000 ლარს.',
      ),
      z.literal(''),
    ]),
    overrideHours: z.union([
      decimalText.refine(
        (value) => salaryToMinor(value) <= 74400,
        'საათები უნდა იყოს 0-დან 744-მდე.',
      ),
      z.literal(''),
    ]),
    note: noteText,
    reason: decisionReason,
  })
  .refine((value) => value.action !== 'overridden' || value.overrideAmount !== '', {
    path: ['overrideAmount'],
    message: 'კორექტირებისას მიუთითეთ ახალი თანხა ლარში.',
  })

export type AttendancePayrollReviewSearch = z.infer<
  typeof attendancePayrollReviewSearchSchema
>
export type SaveAttendancePayrollDecisionInput = z.infer<
  typeof saveAttendancePayrollDecisionSchema
>
