import { queryOptions } from '@tanstack/react-query'
import { getNotificationSettings } from './notification-settings.functions'

export const notificationSettingsKey = (actorId: string) =>
  ['notification-settings', actorId] as const
export const notificationSettingsQuery = (actorId: string) =>
  queryOptions({
    queryKey: notificationSettingsKey(actorId),
    queryFn: () => getNotificationSettings(),
    staleTime: 0,
    retry: false,
  })
