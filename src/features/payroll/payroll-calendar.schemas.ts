import { z } from 'zod'
import { scheduleWeekdaySchema } from '#/features/scheduling/scheduling.schemas'

export const calendarDateSchema = z.iso
  .date({ error: 'აირჩიეთ სწორი თარიღი.' })
  .pipe(
    z
      .string()
      .refine(
        (date) => date >= '2000-01-01' && date <= '2100-12-31',
        'თარიღი უნდა იყოს 2000 წლიდან 2100 წლის ჩათვლით.',
      ),
  )
const userId = z
  .string({ error: 'თანამშრომელი არასწორია.' })
  .min(1, 'თანამშრომელი არასწორია.')
  .max(128, 'თანამშრომელი არასწორია.')
const reason = z
  .string({ error: 'მიუთითეთ ცვლილების მიზეზი.' })
  .trim()
  .min(5, 'მიზეზი უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.')
  .max(500, 'მიზეზი არ უნდა აღემატებოდეს 500 სიმბოლოს.')
export const calendarKindSchema = z.enum(['working', 'day_off', 'inherit'], {
  error: 'აირჩიეთ დღის წესი.',
})
const page = z.coerce
  .number({ error: 'გვერდი არასწორია.' })
  .int('გვერდი არასწორია.')
  .min(1, 'გვერდი არასწორია.')
  .max(10000, 'გვერდი არასწორია.')
  .default(1)
export const payrollCalendarSearchSchema = z.object(
  {
    month: z
      .string({ error: 'თვე არასწორია.' })
      .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/, 'აირჩიეთ სწორი თვე.')
      .optional(),
    userId: userId.nullable().default(null),
    historyPage: page,
    historyQ: z
      .string({ error: 'ძიება არასწორია.' })
      .trim()
      .max(100, 'ძიება არ უნდა აღემატებოდეს 100 სიმბოლოს.')
      .default(''),
  },
  { error: 'კალენდრის მოთხოვნა არასწორია.' },
)
export const calendarPeopleSchema = z.object(
  {
    q: z
      .string({ error: 'ძიება არასწორია.' })
      .trim()
      .max(100, 'ძიება არ უნდა აღემატებოდეს 100 სიმბოლოს.')
      .default(''),
    page,
  },
  { error: 'ძიება არასწორია.' },
)
export const calendarPeopleFormSchema = z.object({
  q: calendarPeopleSchema.shape.q.removeDefault(),
})
export const calendarMonthFormSchema = z.object({
  year: z
    .string({ error: 'წელი არასწორია.' })
    .regex(/^(20\d{2}|2100)$/, 'წელი არასწორია.'),
  month: z
    .string({ error: 'თვე არასწორია.' })
    .regex(/^(0[1-9]|1[0-2])$/, 'თვე არასწორია.'),
})
export const saveCalendarExceptionSchema = z
  .strictObject(
    {
      userId: userId.nullable(),
      date: calendarDateSchema,
      kind: calendarKindSchema,
      hours: scheduleWeekdaySchema.shape.hours,
      expectedRevision: z
        .number({ error: 'განაახლეთ კალენდარი.' })
        .int('ვერსია არასწორია.')
        .min(0, 'ვერსია არასწორია.')
        .max(2147483646, 'ვერსია ამოწურულია.'),
      reason,
    },
    { error: 'გამონაკლისის მონაცემები არასწორია.' },
  )
  .refine((value) => (value.kind === 'working') === (value.hours !== null), {
    path: ['hours'],
    message:
      'სამუშაო დღეს მიუთითეთ დრო, სხვა შემთხვევაში დრო ცარიელი უნდა იყოს.',
  })
export const calendarExceptionFormSchema = z
  .object({
    kind: calendarKindSchema,
    start: z.string(),
    end: z.string(),
    reason,
  })
  .superRefine((value, context) => {
    if (value.kind !== 'working') return
    const parsed = scheduleWeekdaySchema.shape.hours.safeParse({
      start: value.start,
      end: value.end,
    })
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({
          code: 'custom',
          path: issue.path,
          message: issue.message,
        })
  })
export const payrollCalendarRangeSchema = z
  .object(
    {
      employeeId: z.uuid({ error: 'თანამშრომელი არასწორია.' }),
      startDate: calendarDateSchema,
      endDate: calendarDateSchema,
    },
    { error: 'პერიოდი არასწორია.' },
  )
  .refine(
    (value) =>
      value.startDate <= value.endDate &&
      Date.parse(value.endDate) - Date.parse(value.startDate) <= 365 * 86400000,
    { path: ['endDate'], message: 'აირჩიეთ სწორი პერიოდი, მაქსიმუმ 366 დღე.' },
  )
export type PayrollCalendarSearch = z.infer<typeof payrollCalendarSearchSchema>
