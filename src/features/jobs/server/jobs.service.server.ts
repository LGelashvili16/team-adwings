import { deliverNotifications } from '#/features/notifications/server/notifications.service.server'
import { readJobNotificationRoles } from '#/features/notifications/server/notification-settings.service.server'
import { signalRealtime } from '#/lib/realtime/postgres-events.server'
import '@tanstack/react-start/server-only'
import {
  createJobSchema,
  editJobSchema,
  jobLookupSchema,
  jobSearchSchema,
  jobTransitionSchema,
} from '../jobs.schemas'
import {
  hasJobCoordinates,
  JobConflictError,
  JobWorkflowError,
} from '../jobs.rules'
import {
  assertJobManager,
  assertJobTransition,
  requireJobActor,
} from './jobs.policy.server'
import * as repository from './jobs.repository.server'
import { resolveJobStreet } from './job-locations.service.server'
import type { ResolvedLocation } from '../job-locations.types'
import type { Actor } from '#/lib/authorization/actor'
import type { JobDetail, JobsWorkspace } from '../jobs.types'
import { formatJobDay } from '../jobs.dates'

function validateInput<T>(
  schema: {
    safeParse: (
      input: unknown,
    ) => { success: true; data: T } | { success: false }
  },
  input: unknown,
): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success)
    throw new JobWorkflowError(
      'მოთხოვნა არასწორია. გადაამოწმეთ შეყვანილი მონაცემები.',
    )
  return parsed.data
}
export async function listCompanyJobs(
  actor: Actor | null,
  input: unknown,
): Promise<JobsWorkspace> {
  const search = validateInput(jobSearchSchema, input)
  return repository.transactJobs(
    async (tx) => {
      const current = await requireJobActor(tx, actor)
      const result = await repository.listJobs(tx, current.id, search)
      return {
        ...result,
        items: result.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}
export async function getCompanyJob(
  actor: Actor | null,
  input: unknown,
): Promise<JobDetail> {
  const { id } = validateInput(jobLookupSchema, input)
  return repository.transactJobs(
    async (tx) => {
      await requireJobActor(tx, actor)
      const record = await repository.readJob(tx, id)
      if (!record) throw new JobWorkflowError('სამუშაო ვერ მოიძებნა.')
      return {
        ...record,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        locationResolvedAt: record.locationResolvedAt?.toISOString() ?? null,
        history: record.history.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        })),
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}
export async function createCompanyJob(actor: Actor | null, input: unknown) {
  const data = validateInput(createJobSchema, input)
  await repository.transactJobs(async (tx) => {
    assertJobManager(await requireJobActor(tx, actor))
  })
  const location = hasJobCoordinates(data) ? await resolveJobStreet(data) : null
  return repository.transactJobs(async (tx) => {
    const current = await requireJobActor(tx, actor, true)
    assertJobManager(current)
    const record = await repository.insertJob(tx, {
      title: data.title,
      notes: data.notes,
      address: data.address,
      kind: data.kind,
      deadline: data.deadline,
      longitude: data.longitude,
      latitude: data.latitude,
      requestId: data.requestId,
      createdBy: current.id,
      ...locationFields(location),
    })
    if (record.inserted) {
      await signalRealtime(tx, { topic: 'jobs', subjectId: record.id })
      await repository.appendJobEvent(tx, {
        jobId: record.id,
        actorId: current.id,
        action: 'created',
        status: 'pending',
      })
      await notifyJobEvent(tx, current, {
        jobId: record.id,
        eventKey: `job:${record.id}:created`,
        title: 'ახალი სამუშაო დაემატა',
        body: 'ახალი სამუშაო ხელმისაწვდომია. დეტალების სანახავად გახსენით სამუშაო.',
      })
    }
    return {
      id: record.id,
      streetNamesAvailable:
        !hasJobCoordinates(data) ||
        Boolean(location?.streetNameKa && location.streetNameEn),
    }
  })
}
async function currentJob(
  tx: repository.JobsTransaction,
  id: string,
  version: number,
) {
  const record = await repository.lockJob(tx, id)
  if (!record) throw new JobWorkflowError('სამუშაო ვერ მოიძებნა.')
  if (record.version !== version)
    throw new JobConflictError(
      'სამუშაო უკვე შეიცვალა. განაახლეთ მონაცემები და სცადეთ ხელახლა.',
    )
  return record
}
export async function editCompanyJob(actor: Actor | null, input: unknown) {
  const data = validateInput(editJobSchema, input)
  const before = await repository.transactJobs(async (tx) => {
    assertJobManager(await requireJobActor(tx, actor))
    const record = await currentJob(tx, data.id, data.version)
    if (record.status === 'completed' || record.status === 'rejected')
      throw new JobWorkflowError('რედაქტირებამდე სამუშაო თავიდან დაგეგმეთ.')
    return record
  })
  const needsLookup =
    before.longitude !== data.longitude ||
    before.latitude !== data.latitude ||
    !before.locationResolvedAt
  const location =
    needsLookup && hasJobCoordinates(data) ? await resolveJobStreet(data) : null
  return repository.transactJobs(async (tx) => {
    const current = await requireJobActor(tx, actor, true)
    assertJobManager(current)
    const record = await currentJob(tx, data.id, data.version)
    if (record.status === 'completed' || record.status === 'rejected')
      throw new JobWorkflowError('რედაქტირებამდე სამუშაო თავიდან დაგეგმეთ.')
    const materialChange =
      record.address !== data.address ||
      record.deadline !== data.deadline ||
      record.notes !== data.notes ||
      record.longitude !== data.longitude ||
      record.latitude !== data.latitude
    const changed =
      materialChange || record.title !== data.title || record.kind !== data.kind
    if (!changed && !needsLookup)
      return {
        id: record.id,
        streetNamesAvailable:
          !hasJobCoordinates(data) ||
          Boolean(record.streetNameKa && record.streetNameEn),
      }
    await repository.updateJob(tx, record.id, {
      title: data.title,
      notes: data.notes,
      address: data.address,
      kind: data.kind,
      deadline: data.deadline,
      longitude: data.longitude,
      latitude: data.latitude,
      version: record.version + 1,
      ...(needsLookup ? locationFields(location) : {}),
    })
    await repository.appendJobEvent(tx, {
      jobId: record.id,
      actorId: current.id,
      action: 'edited',
      status: record.status,
    })
    await signalRealtime(tx, { topic: 'jobs', subjectId: record.id })
    if (changed)
      await notifyJobEvent(tx, current, {
        eventKey: `job:${record.id}:${record.version + 1}:edited`,
        jobId: record.id,
        title: 'სამუშაოს დეტალები შეიცვალა',
        body: 'გადაამოწმეთ სამუშაოს მისამართი, ვადა და ინსტრუქცია.',
      })
    return {
      id: record.id,
      streetNamesAvailable:
        !hasJobCoordinates(data) ||
        (needsLookup
          ? Boolean(location?.streetNameKa && location.streetNameEn)
          : Boolean(record.streetNameKa && record.streetNameEn)),
    }
  })
}
function locationFields(location: ResolvedLocation | null) {
  return {
    streetNameKa: location?.streetNameKa ?? null,
    streetNameEn: location?.streetNameEn ?? null,
    locationLabelKa: location?.labelKa ?? null,
    locationLabelEn: location?.labelEn ?? null,
    locationResolvedAt: location ? new Date() : null,
  }
}
export async function transitionCompanyJob(
  actor: Actor | null,
  input: unknown,
) {
  const data = validateInput(jobTransitionSchema, input)
  return repository.transactJobs(async (tx) => {
    const current = await requireJobActor(tx, actor, true)
    const record = await currentJob(tx, data.id, data.version)
    assertJobTransition(current, record, data.status)
    const assigneeId =
      data.status === 'pending'
        ? null
        : record.status === 'pending' && data.status === 'en_route'
          ? current.id
          : record.assigneeId
    await repository.updateJob(tx, record.id, {
      status: data.status,
      assigneeId,
      version: record.version + 1,
    })
    await repository.appendJobEvent(tx, {
      jobId: record.id,
      actorId: current.id,
      action: 'status_changed',
      status: data.status,
      note: data.note,
    })
    await signalRealtime(tx, { topic: 'jobs', subjectId: record.id })
    await notifyJobEvent(tx, current, {
      jobId: record.id,
      eventKey: `job:${record.id}:${record.version + 1}:${data.status}`,
      title: jobStatusNotificationTitles[data.status],
      body: `${record.title}${data.note ? `. ${data.note}` : ''}`.slice(
        0,
        2000,
      ),
    })
    return { id: record.id }
  })
}

const jobStatusNotificationTitles = {
  pending: 'სამუშაო თავიდან დაიგეგმა',
  en_route: 'სამუშაო აღებულია',
  on_site: 'თანამშრომელი ადგილზე მივიდა',
  completed: 'სამუშაო დასრულდა',
  rejected: 'სამუშაო უარყოფილია',
}

/** Each job change uses one policy and one deduplicated delivery path inside the owning transaction. */
async function notifyJobEvent(
  tx: repository.JobsTransaction,
  actor: Actor,
  event: {
    jobId: string
    eventKey: string
    title: string
    body: string
  },
) {
  const roles = await readJobNotificationRoles(tx)
  if (!roles.length) return
  const job = await repository.jobNotificationDetails(tx, event.jobId)
  if (!job) throw new JobWorkflowError('სამუშაო ვერ მოიძებნა.')
  const body = [
    `სამუშაო: ${job.title}`,
    `შემქმნელი: ${job.creatorName}`,
    `მისამართი: ${job.address || 'არ არის მითითებული'}`,
    ...(job.deadline ? [`ვადა: ${formatJobDay(job.deadline)}`] : []),
    event.body,
  ]
    .join('\n')
    .slice(0, 2000)
  const includeOwn = actor.roles.some(
    (role) => role === 'admin' || role === 'owner',
  )
  let afterId: string | undefined
  do {
    const page = await repository.jobNotificationCandidates(tx, roles, afterId)
    const delivery = {
      eventKey: event.eventKey,
      title: event.title,
      body,
      destination: { kind: 'job' as const, jobId: event.jobId },
    }
    await deliverNotifications(tx, {
      ...delivery,
      recipientIds: page.recipientIds,
      actorId: actor.id,
    })
    if (includeOwn && page.recipientIds.includes(actor.id)) {
      // The existing action toast confirms the write; keep the administrator's own inbox entry without a second toast.
      await deliverNotifications(tx, {
        ...delivery,
        recipientIds: [actor.id],
        liveToast: false,
      })
    }
    afterId = page.afterId
  } while (afterId)
}
