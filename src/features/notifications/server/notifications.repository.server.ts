import '@tanstack/react-start/server-only'
import {
  and,
  count,
  gt,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
  notExists,
} from 'drizzle-orm'
import { db } from '#/db'
import {
  signalRealtime,
  signalRealtimeBatch,
} from '#/lib/realtime/postgres-events.server'
import {
  announcement,
  announcementRecipient,
  notification,
  employee,
  user,
} from '#/db/schema'
import type { DeliverNotificationsInput } from '../notifications.schemas'

export type NotificationTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

type LegacyDelivery = {
  complaintId?: string
  complaintActivityId?: string
  announcementId?: string
  allowInvited?: boolean
}
export async function insertDelivery(
  tx: NotificationTransaction,
  value: DeliverNotificationsInput,
  legacy?: LegacyDelivery,
) {
  const rows = await insertDeliveries(tx, [value], legacy)
  return rows.map(({ id, recipientId }) => ({ id, recipientId }))
}
export async function insertDeliveries(
  tx: NotificationTransaction,
  values: Array<DeliverNotificationsInput>,
  legacy?: LegacyDelivery,
) {
  const candidates = values.flatMap((value) =>
    [...new Set(value.recipientIds)]
      .filter((id) => id !== value.actorId)
      .map((recipientId) => ({
        recipientId,
        eventKey: value.eventKey,
        title: value.title,
        body: value.body,
        destination: value.destination ?? null,
        liveToast: value.liveToast ?? true,
        complaintId: legacy?.complaintId,
        complaintActivityId: legacy?.complaintActivityId,
        announcementId: legacy?.announcementId,
      })),
  )
  const ids = [...new Set(candidates.map((row) => row.recipientId))]
  if (!ids.length) return []
  const recipients = await tx
    .select({ id: user.id })
    .from(user)
    .leftJoin(employee, eq(employee.userId, user.id))
    .where(
      and(
        inArray(user.id, ids),
        legacy?.allowInvited
          ? inArray(user.accessState, ['active', 'invited'])
          : eq(user.accessState, 'active'),
        sql`(${employee.id} is null or ${employee.status} = 'active')`,
      ),
    )
  if (!recipients.length) return []
  const eligible = new Set(recipients.map((row) => row.id))
  const rows = candidates.filter((row) => eligible.has(row.recipientId))
  const inserted: Array<{
    id: string
    recipientId: string
    eventKey: string | null
  }> = []
  for (let offset = 0; offset < rows.length; offset += 1000) {
    const batch = await tx
      .insert(notification)
      .values(rows.slice(offset, offset + 1000))
      .onConflictDoNothing()
      .returning({
        id: notification.id,
        recipientId: notification.recipientId,
        eventKey: notification.eventKey,
      })
    inserted.push(...batch)
  }
  await signalRealtimeBatch(
    tx,
    inserted.map((item) => ({
      topic: 'notifications',
      recipientId: item.recipientId,
      subjectId: item.id,
    })),
  )
  return inserted
}

export function announcementRecipients(
  tx: NotificationTransaction,
  id: string,
  afterId?: string,
) {
  return tx
    .select({ id: announcementRecipient.userId })
    .from(announcementRecipient)
    .where(
      and(
        eq(announcementRecipient.announcementId, id),
        afterId ? gt(announcementRecipient.userId, afterId) : undefined,
      ),
    )
    .orderBy(announcementRecipient.userId)
    .limit(1000)
}

export async function acknowledgeRelated(
  tx: NotificationTransaction,
  actorId: string,
  related: { complaintId: string } | { announcementId: string },
) {
  const updated = await tx
    .update(notification)
    .set({ seenAt: sql`now()` })
    .where(
      and(
        eq(notification.recipientId, actorId),
        isNull(notification.deletedAt),
        isNull(notification.seenAt),
        'complaintId' in related
          ? eq(notification.complaintId, related.complaintId)
          : eq(notification.announcementId, related.announcementId),
      ),
    )
    .returning({ id: notification.id })
  if (updated.length)
    await signalRealtime(tx, { topic: 'notifications', recipientId: actorId })
}

export async function liveNotification(recipientId: string, id: string) {
  const [item] = await db
    .select({
      id: notification.id,
      title: notification.title,
      liveToast: notification.liveToast,
      destination: notification.destination,
    })
    .from(notification)
    .innerJoin(user, eq(user.id, notification.recipientId))
    .leftJoin(employee, eq(employee.userId, user.id))
    .where(
      and(
        eq(notification.id, id),
        eq(notification.recipientId, recipientId),
        isNull(notification.deletedAt),
        sql`(${notification.liveToast} or ${notification.destination} is not null)`,
        isNull(notification.seenAt),
        eq(user.accessState, 'active'),
        sql`(${employee.id} is null or ${employee.status} = 'active')`,
      ),
    )
  return item
}

export async function listForRecipient(
  recipientId: string,
  limit: number,
  offset: number,
  options?: { scope?: 'all' | 'popup'; unreadOnly?: boolean },
) {
  const scope = options?.scope ?? 'all'
  const unreadOnly = options?.unreadOnly ?? false
  return db.transaction(
    async (tx) => {
      // Also hides self-delivery rows from publications created before author exclusion.
      const baseVisible = and(
        eq(notification.recipientId, recipientId),
        isNull(notification.deletedAt),
        scope === 'popup' ? isNull(notification.popupDismissedAt) : undefined,
        notExists(
          tx
            .select({ id: announcement.id })
            .from(announcement)
            .where(
              and(
                eq(announcement.id, notification.announcementId),
                eq(announcement.authorId, recipientId),
              ),
            ),
        ),
      )
      const listFilter = unreadOnly
        ? and(baseVisible, isNull(notification.seenAt))
        : baseVisible
      const items = await tx
        .select({
          id: notification.id,
          title: notification.title,
          body: notification.body,
          destination: notification.destination,
          announcementId: notification.announcementId,
          complaintId: notification.complaintId,
          createdAt: notification.createdAt,
          seenAt: notification.seenAt,
        })
        .from(notification)
        .where(listFilter)
        .orderBy(desc(notification.createdAt), desc(notification.id))
        .limit(limit + 1)
        .offset(offset)
      const [unseenSummary, totalSummary] = await Promise.all([
        tx
          .select({ value: count() })
          .from(notification)
          .where(and(baseVisible, isNull(notification.seenAt))),
        tx.select({ value: count() }).from(notification).where(listFilter),
      ])
      return {
        items,
        unseenCount: unseenSummary[0].value,
        totalCount: totalSummary[0].value,
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}

export async function dismissPopupForRecipient(recipientId: string) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(notification)
      .set({ popupDismissedAt: sql`now()` })
      .where(
        and(
          eq(notification.recipientId, recipientId),
          isNull(notification.deletedAt),
          isNull(notification.popupDismissedAt),
        ),
      )
      .returning({ id: notification.id })
    if (updated.length)
      await signalRealtime(tx, { topic: 'notifications', recipientId })
    return { clearedCount: updated.length }
  })
}

export function markSeenForRecipient(recipientId: string, ids: Array<string>) {
  return setSeenForRecipient(recipientId, ids, true)
}
export function markAllSeenForRecipient(recipientId: string) {
  return setSeenForRecipient(recipientId, undefined, true)
}
export function markUnseenForRecipient(
  recipientId: string,
  ids: Array<string>,
) {
  return setSeenForRecipient(recipientId, ids, false)
}
async function setSeenForRecipient(
  recipientId: string,
  ids: Array<string> | undefined,
  seen: boolean,
) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(notification)
      .set({ seenAt: seen ? sql`now()` : null })
      .where(
        and(
          eq(notification.recipientId, recipientId),
          isNull(notification.deletedAt),
          ids ? inArray(notification.id, ids) : undefined,
          seen ? isNull(notification.seenAt) : isNotNull(notification.seenAt),
        ),
      )
      .returning({ id: notification.id, complaintId: notification.complaintId })
    // Reading on any device reconciles the recipient's complaint dot after commit.
    if (updated.length)
      await signalRealtime(tx, { topic: 'notifications', recipientId })
    if (updated.some((item) => item.complaintId !== null))
      await signalRealtime(tx, { topic: 'complaints', recipientId })
    return { updatedCount: updated.length }
  })
}

export async function deleteForRecipient(recipientId: string, id: string) {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .update(notification)
      .set({
        deletedAt: sql`now()`,
        seenAt: sql`coalesce(${notification.seenAt}, now())`,
      })
      .where(
        and(
          eq(notification.recipientId, recipientId),
          eq(notification.id, id),
          isNull(notification.deletedAt),
        ),
      )
      .returning({ id: notification.id, complaintId: notification.complaintId })
    if (deleted.length)
      await signalRealtime(tx, { topic: 'notifications', recipientId })
    if (deleted.some((item) => item.complaintId !== null))
      await signalRealtime(tx, { topic: 'complaints', recipientId })
    return { deletedCount: deleted.length }
  })
}

export async function deleteAllForRecipient(recipientId: string) {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .update(notification)
      .set({
        deletedAt: sql`now()`,
        seenAt: sql`coalesce(${notification.seenAt}, now())`,
      })
      .where(
        and(
          eq(notification.recipientId, recipientId),
          isNull(notification.deletedAt),
        ),
      )
      .returning({ id: notification.id, complaintId: notification.complaintId })
    if (deleted.length)
      await signalRealtime(tx, { topic: 'notifications', recipientId })
    if (deleted.some((item) => item.complaintId !== null))
      await signalRealtime(tx, { topic: 'complaints', recipientId })
    return { deletedCount: deleted.length }
  })
}
