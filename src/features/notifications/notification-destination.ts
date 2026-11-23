import { notificationDestinationSchema } from './notifications.schemas'
import type { NotificationItem } from './notifications.types'

/** Only known application routes can be composed from persisted destination data. */
export function notificationDestination(input: unknown, actorId: string) {
  const parsed = notificationDestinationSchema.safeParse(input)
  if (!parsed.success) return null
  const value = parsed.data
  switch (value.kind) {
    case 'leave':
      return {
        to: value.review ? '/manage/leave' : '/leave',
        search: { requestId: value.requestId },
      } as const
    case 'schedule':
      return { to: '/schedule' } as const
    case 'job':
      return { to: '/jobs', search: { pin: value.jobId } } as const
    case 'jobs':
      return { to: '/jobs' } as const
    case 'devices':
      return { to: '/manage/devices' } as const
    case 'security':
      return { to: '/settings/security' } as const
    case 'attendance_clock':
      return { to: '/attendance' } as const
    case 'attendance':
      return value.userId === actorId
        ? ({
            to: '/timesheets',
            search: { month: value.workDate.slice(0, 7) },
          } as const)
        : ({
            to: '/manage/attendance/$userId',
            params: { userId: value.userId },
            search: { date: value.workDate },
          } as const)
  }
}

/** Resolves a safe internal route for any notification, including legacy rows created before typed destinations. */
export function resolveNotificationLink(
  item: NotificationItem,
  actorId: string,
) {
  const typed = notificationDestination(item.destination, actorId)
  if (typed) return typed
  if (item.announcementId) {
    return {
      to: '/announcements',
      search: { announcementId: item.announcementId },
    } as const
  }
  if (item.complaintId) {
    return {
      to: item.complaintReview ? '/manage/complaints' : '/complaints',
      search: { complaintId: item.complaintId },
    } as const
  }
  if (item.title === 'მოწყობილობის დადასტურება') {
    return { to: '/manage/devices' } as const
  }
  if (item.title.includes('მოწყობილობ')) {
    return { to: '/settings/security' } as const
  }
  if (
    item.title.includes('სამუშაოს დაწყებ') ||
    item.title.includes('დასწრებ')
  ) {
    return { to: '/attendance' } as const
  }
  if (item.title.includes('განრიგ')) {
    return { to: '/schedule' } as const
  }
  return null
}
