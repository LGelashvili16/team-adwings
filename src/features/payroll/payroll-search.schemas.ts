import { z } from 'zod'
import { salaryDirectorySchema } from './salary.schemas'

export const payrollEmployeeSearchSchema = salaryDirectorySchema.pick({
  page: true,
  q: true,
})
export const payrollSearchFormSchema = z.object({
  q: payrollEmployeeSearchSchema.shape.q.removeDefault(),
})
