import { z } from 'zod'
import { payrollMonthSchema } from '#/features/payroll/salary.schemas'

export const markAllNotificationsSeenSchema = z.strictObject(
  {},
  { error: 'მოთხოვნა არასწორია.' },
)

const accountId = z.string().min(1).max(256)
/** Destinations are data, never persisted URLs. Routes independently authorize access. */
export const notificationDestinationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('leave'),
      requestId: z.uuid(),
      review: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal('schedule') }).strict(),
  z
    .object({
      kind: z.literal('attendance'),
      userId: accountId,
      workDate: z.iso.date(),
    })
    .strict(),
  z.object({ kind: z.literal('job'), jobId: z.uuid() }).strict(),
  z.object({ kind: z.literal('jobs') }).strict(),
  z.object({ kind: z.literal('devices') }).strict(),
  z.object({ kind: z.literal('security') }).strict(),
  z.object({ kind: z.literal('attendance_clock') }).strict(),
  z.strictObject({ kind: z.literal('payroll'), month: payrollMonthSchema }),
])
export const deliverNotificationsSchema = z
  .object({
    eventKey: z.string().trim().min(1).max(256),
    recipientIds: z.array(accountId).max(10000),
    actorId: accountId.optional(),
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(2000),
    destination: notificationDestinationSchema.optional(),
    liveToast: z.boolean().default(true),
  })
  .strict()
export const notificationRealtimeSchema = z
  .object({
    recipientId: accountId,
    changed: z.boolean(),
    notification: z
      .object({
        id: z.uuid(),
        title: z.string().min(1).max(160),
        destination: notificationDestinationSchema.nullable(),
        liveToast: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
export type NotificationDestination = z.infer<
  typeof notificationDestinationSchema
>
export type DeliverNotificationsInput = z.input<
  typeof deliverNotificationsSchema
>

export const notificationListSchema = z.object({
  limit: z
    .number({ error: 'რაოდენობა არასწორია.' })
    .int({ error: 'რაოდენობა მთელი რიცხვი უნდა იყოს.' })
    .min(1, 'მინიმუმ ერთი ჩანაწერი აირჩიეთ.')
    .max(50, 'მაქსიმუმ 50 ჩანაწერის მოთხოვნაა შესაძლებელი.'),
  offset: z
    .number({ error: 'გვერდი არასწორია.' })
    .int({ error: 'გვერდი არასწორია.' })
    .min(0, 'გვერდი არასწორია.')
    .max(100000, 'გვერდების ზღვარი მიღწეულია.'),
  scope: z.enum(['all', 'popup']).optional(),
  unreadOnly: z.boolean().optional(),
})

export const notificationPageSearchSchema = z.object({
  page: z.coerce
    .number()
    .int('გვერდი არასწორია.')
    .min(1, 'გვერდი არასწორია.')
    .max(5000, 'გვერდი არასწორია.')
    .default(1),
  filter: z.enum(['all', 'unread']).default('all'),
})

export const markNotificationsSeenSchema = z.object({
  ids: z
    .array(z.uuid({ error: 'შეტყობინების იდენტიფიკატორი არასწორია.' }), {
      error: 'აირჩიეთ შეტყობინებები.',
    })
    .min(1, 'აირჩიეთ შეტყობინება.')
    .max(50, 'ერთდროულად მაქსიმუმ 50 შეტყობინება მონიშნეთ.'),
})

export const deleteNotificationSchema = z.strictObject({
  id: z.uuid({ error: 'შეტყობინების იდენტიფიკატორი არასწორია.' }),
})

export const deleteAllNotificationsSchema = z.strictObject(
  {},
  { error: 'მოთხოვნა არასწორია.' },
)
