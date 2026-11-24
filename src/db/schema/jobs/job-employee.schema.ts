import { index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { user } from '../auth/auth.schema'
import { job } from './job.schema'

/** Planned crew is independent of the account that claims the job's progress workflow. */
export const jobEmployee = pgTable(
  'job_employee',
  {
    /** Owning job. */
    jobId: uuid('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'cascade' }),
    /** Assigned account, retained while referenced by a job. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.userId] }),
    index('job_employee_user').on(t.userId, t.jobId),
  ],
)
