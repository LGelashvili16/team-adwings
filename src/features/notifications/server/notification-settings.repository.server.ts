import '@tanstack/react-start/server-only'
import { eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import { notificationPolicy, notificationPolicyAudit } from '#/db/schema'
import type { NotificationTransaction } from './notifications.repository.server'
import {
  defaultJobNotificationRoles,
  notificationSettingsSchema,
} from '../notification-settings.schemas'
import type { Role } from '#/lib/authorization/permissions'

export const transactNotificationSettings = db.transaction.bind(db)

export async function readNotificationPolicy(tx: NotificationTransaction) {
  const row = (
    await tx
      .select({ jobNotificationRoles: notificationPolicy.jobNotificationRoles })
      .from(notificationPolicy)
      .where(eq(notificationPolicy.id, 'company'))
  ).at(0)
  return notificationSettingsSchema.parse(
    row ?? { jobNotificationRoles: defaultJobNotificationRoles },
  )
}

export async function saveNotificationPolicy(
  tx: NotificationTransaction,
  actorId: string,
  jobNotificationRoles: Array<Role>,
) {
  // Serialize the first insert as well as subsequent edits so audit before-values are accurate.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('team-adwings-notification-policy'))`,
  )
  const before = await readNotificationPolicy(tx)
  if (
    JSON.stringify(before.jobNotificationRoles) ===
    JSON.stringify(jobNotificationRoles)
  )
    return before
  await tx
    .insert(notificationPolicy)
    .values({ id: 'company', jobNotificationRoles })
    .onConflictDoUpdate({
      target: notificationPolicy.id,
      set: { jobNotificationRoles },
    })
  await tx.insert(notificationPolicyAudit).values({
    actorId,
    beforeRoles: before.jobNotificationRoles,
    afterRoles: jobNotificationRoles,
  })
  return { jobNotificationRoles }
}
