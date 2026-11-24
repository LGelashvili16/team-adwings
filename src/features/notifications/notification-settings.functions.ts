import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { permissionsMiddleware } from '#/lib/auth/auth.middleware'
import { notificationSettingsSchema } from './notification-settings.schemas'
import {
  readNotificationSettings,
  saveNotificationSettings,
} from './server/notification-settings.service.server'

export const getNotificationSettings = createServerFn({ method: 'GET' })
  .middleware([permissionsMiddleware('notifications.configure')])
  .handler(async ({ context }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    return readNotificationSettings(context.actor)
  })

export const updateNotificationSettings = createServerFn({ method: 'POST' })
  .middleware([permissionsMiddleware('notifications.configure')])
  .validator(notificationSettingsSchema)
  .handler(async ({ context, data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    return saveNotificationSettings(context.actor, data)
  })
