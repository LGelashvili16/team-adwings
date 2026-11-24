import { z } from 'zod'

export const jobAwardEvidenceSchema = z.object(
  {
    jobId: z.uuid({ error: 'სამუშაო არასწორია.' }),
    userId: z
      .string({ error: 'თანამშრომელი არასწორია.' })
      .min(1, 'აირჩიეთ თანამშრომელი.')
      .max(128, 'თანამშრომელი არასწორია.'),
  },
  { error: 'სამუშაოს მტკიცებულების მოთხოვნა არასწორია.' },
)
export const jobAwardSearchSchema = jobAwardEvidenceSchema
  .omit({ jobId: true })
  .extend({
    q: z
      .string({ error: 'ძიება არასწორია.' })
      .trim()
      .max(100, 'ძიება არ უნდა აღემატებოდეს 100 სიმბოლოს.'),
    page: z
      .number({ error: 'გვერდი არასწორია.' })
      .int('გვერდი არასწორია.')
      .min(1, 'გვერდი არასწორია.')
      .max(10000, 'გვერდი არასწორია.'),
    workDate: z.iso.date({ error: 'თარიღი არასწორია.' }),
  })
