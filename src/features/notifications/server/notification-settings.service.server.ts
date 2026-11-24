import '@tanstack/react-start/server-only'
import { assertPermissions } from '#/lib/authorization/access'
import type { Actor } from '#/lib/authorization/actor'
import { notificationSettingsSchema } from '../notification-settings.schemas'
import * as repository from './notification-settings.repository.server'
import type { NotificationTransaction } from './notifications.repository.server'

export async function readNotificationSettings(actor: Actor) {
  assertPermissions(actor, ['notifications.configure'])
  return repository.transactNotificationSettings(
    repository.readNotificationPolicy,
  )
}

export async function saveNotificationSettings(actor: Actor, input: unknown) {
  assertPermissions(actor, ['notifications.configure'])
  const { jobNotificationRoles } = notificationSettingsSchema.parse(input)
  return repository.transactNotificationSettings((tx) =>
    repository.saveNotificationPolicy(tx, actor.id, jobNotificationRoles),
  )
}

/** Job workflows own their transactions; notification preferences never grant job access. */
export async function readJobNotificationRoles(tx: NotificationTransaction) {
  return (await repository.readNotificationPolicy(tx)).jobNotificationRoles
}
