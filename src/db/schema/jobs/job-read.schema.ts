import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { user } from '../auth/auth.schema'
import { createdAt } from '../_shared/columns'
import { job } from './job.schema'

/** One account's first successful detail view of a job. Other accounts retain their own unread state. */
export const jobRead = pgTable(
  'job_read',
  {
    /** Authenticated viewer; removed with the account. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Viewed job; removed if the owning job is deleted. */
    jobId: uuid('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'cascade' }),
    /** Database-time UTC instant of the first detail view. */
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.jobId] })],
)
