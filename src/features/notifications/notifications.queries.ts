import { queryOptions } from '@tanstack/react-query'
import { getOwnNotifications } from './notifications.functions'

export const notificationKeys = {
  own: (actorId: string) => ['notifications', actorId] as const,
}

export const notificationsQueryOptions = (
  actorId: string,
  limit = 5,
  offset = 0,
  options?: { scope?: 'all' | 'popup'; unreadOnly?: boolean },
) => {
  const scope = options?.scope ?? 'all'
  const unreadOnly = options?.unreadOnly ?? false
  return queryOptions({
    queryKey: [
      ...notificationKeys.own(actorId),
      limit,
      offset,
      scope,
      unreadOnly,
    ],
    queryFn: async () => {
      const result = await getOwnNotifications({
        data: {
          limit,
          offset,
          ...(scope !== 'all' ? { scope } : {}),
          ...(unreadOnly ? { unreadOnly } : {}),
        },
      })
      if (!result.ok) throw new Error(result.message)
      return result.value
    },
    staleTime: 30_000,
    retry: false,
  })
}
