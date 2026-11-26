import '@tanstack/react-start/server-only'
import { assertPermissions } from '#/lib/authorization/access'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { currentAuthorization } from '#/lib/authorization/permissions'
import { lockAccountManagement } from '#/lib/auth/account-management-lock.server'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import type { Actor } from '#/lib/authorization/actor'
import type { EmploymentPeriodFacts, EmploymentView } from '../employment.types'
import {
  employmentRangeSchema,
  employmentReadSchema,
  employmentVoidSchema,
  employmentWriteSchema,
} from '../employment.schemas'
import * as repository from './employment.repository.server'
import type { endEmploymentSchema } from '../employment.schemas'
import type { z } from 'zod'

export class EmploymentError extends Error {}
async function authorize(
  tx: repository.EmploymentTransaction,
  actor: Actor | null,
  write = false,
) {
  if (!actor) throw new AuthorizationError()
  const { account, person } = await repository.currentAccount(tx, actor.id)
  if (!account || account.state !== 'active' || person?.status === 'inactive')
    throw new AuthorizationError()
  const current = { ...actor, ...currentAuthorization(account) }
  assertPermissions(current, ['manage.access', 'employees.manage'])
  if (write) assertPermissions(current, ['employees.employment.manage'])
  return current
}
export async function readEmployeeEmployment(
  actor: Actor | null,
  input: unknown,
): Promise<EmploymentView> {
  const data = employmentReadSchema.parse(input)
  return repository.transactEmployment(
    async (tx) => {
      await authorize(tx, actor)
      const target = await repository.targetEmployee(tx, data.userId)
      if (!target) throw new EmploymentError('თანამშრომელი ვერ მოიძებნა.')
      const workday = await getCompanyWorkday(new Date(), tx)
      const periodTotal = await repository.periodCount(tx, target.id)
      const historyTotal = await repository.historyCount(tx, target.id)
      const periods = await repository.readPeriods(
        tx,
        target.id,
        data.employmentPage,
      )
      return {
        revision: target.revision,
        today: workday.date,
        timezone: workday.timezone,
        confirmed: periodTotal > 0,
        departureScheduled: target.departureScheduled,
        latestPeriod:
          data.employmentPage === 1
            ? (periods[0] ?? null)
            : await repository.latestPeriod(tx, target.id),
        periods,
        periodTotal,
        history: (
          await repository.readHistory(
            tx,
            target.id,
            data.employmentHistoryPage,
          )
        ).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        historyTotal,
        pageSize: repository.pageSize,
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
async function lockTarget(
  tx: repository.EmploymentTransaction,
  actor: Actor | null,
  userId: string,
  expectedRevision: number,
) {
  await lockAccountManagement(tx)
  const current = await authorize(tx, actor, true)
  if (current.id === userId) throw new AuthorizationError()
  const target = await repository.targetEmployee(tx, userId, true)
  if (!target) throw new EmploymentError('თანამშრომელი ვერ მოიძებნა.')
  if (target.revision !== expectedRevision)
    throw new EmploymentError(
      'დასაქმების პერიოდები შეიცვალა. განაახლეთ გვერდი და გადაამოწმეთ მონაცემები.',
    )
  if (target.departureEffectiveAt)
    throw new EmploymentError(
      'დაგეგმილი ბოლო სამუშაო დღე შეცვალეთ დასაქმების დასრულების ფანჯრიდან.',
    )
  return { target, actorId: current.id }
}
const facts = (row: {
  startDate: string
  endDate: string | null
  voidedAt: Date | null
}): EmploymentPeriodFacts => ({
  startDate: row.startDate,
  endDate: row.endDate,
  voided: row.voidedAt !== null,
})

export function createInitialEmployeeEmployment(
  tx: repository.EmploymentTransaction,
  employeeId: string,
  manager: Actor,
  startDate: string,
) {
  assertPermissions(manager, ['employees.employment.manage'])
  return writeEmploymentPeriod(tx, employeeId, manager.id, {
    periodId: null,
    startDate,
    endDate: null,
  })
}

async function writeEmploymentPeriod(
  tx: repository.EmploymentTransaction,
  employeeId: string,
  actorId: string,
  data: {
    periodId: string | null
    startDate: string
    endDate: string | null
    reason?: string
  },
) {
  const before = data.periodId
    ? await repository.periodById(tx, employeeId, data.periodId)
    : null
  if (data.periodId && !before)
    throw new EmploymentError('პერიოდი ვერ მოიძებნა ან უკვე გაუქმებულია.')
  if (
    await repository.hasOverlap(
      tx,
      employeeId,
      data.startDate,
      data.endDate,
      data.periodId,
    )
  )
    throw new EmploymentError(
      'არჩეული თარიღები სხვა დადასტურებულ პერიოდს ემთხვევა. გადაამოწმეთ დაწყება და დასრულება.',
    )
  const after = data.periodId
    ? await repository.updatePeriod(tx, data.periodId, {
        startDate: data.startDate,
        endDate: data.endDate,
      })
    : await repository.insertPeriod(
        tx,
        employeeId,
        data.startDate,
        data.endDate,
      )
  await repository.recordChange(tx, {
    employeeId,
    periodId: after.id,
    actorId,
    action: before ? 'updated' : 'created',
    before: before ? facts(before) : null,
    after: facts(after),
    reason:
      data.reason ??
      (before ? 'დასაქმების პერიოდი განახლდა.' : 'დასაქმების პერიოდი დაემატა.'),
  })
}

/** The account workflow owns the transaction and holds the target employee lock. */
export async function closeEmploymentForDeparture(
  tx: repository.EmploymentTransaction,
  manager: Actor,
  target: { id: string; employmentRevision: number },
  data: z.infer<typeof endEmploymentSchema>,
) {
  assertPermissions(manager, ['employees.employment.manage'])
  if (target.employmentRevision !== data.expectedRevision)
    throw new EmploymentError(
      'დასაქმების პერიოდები შეიცვალა. განაახლეთ გვერდი და გადაამოწმეთ მონაცემები.',
    )
  const { date: today, timezone } = await getCompanyWorkday(new Date(), tx)
  const scheduled = data.endDate > today
  const period = await repository.latestPeriod(tx, target.id)
  const startDate = period?.startDate ?? data.startDate
  if (!startDate || startDate > data.endDate)
    throw new EmploymentError(
      'გადაამოწმეთ დასაქმების დაწყების თარიღი და ბოლო სამუშაო დღე.',
    )
  if (
    await repository.hasAttendanceBlockingDeparture(
      tx,
      target.id,
      data.endDate,
      !scheduled,
    )
  )
    throw new EmploymentError(
      'დახურეთ ღია დასწრება და გადაამოწმეთ ბოლო სამუშაო დღის შემდეგ ჩაწერილი დასწრებები.',
    )
  await writeEmploymentPeriod(tx, target.id, manager.id, {
    periodId: period?.id ?? null,
    startDate,
    endDate: data.endDate,
    reason: data.reason,
  })
  return scheduled
    ? repository.departureCutoff(tx, data.endDate, timezone)
    : null
}

export async function saveEmployeeEmployment(
  actor: Actor | null,
  input: unknown,
) {
  const data = employmentWriteSchema.parse(input)
  return repository.transactEmployment(async (tx) => {
    const { target, actorId } = await lockTarget(
      tx,
      actor,
      data.userId,
      data.expectedRevision,
    )
    await writeEmploymentPeriod(tx, target.id, actorId, data)
    return { revision: target.revision + 1 }
  })
}
export async function voidEmployeeEmployment(
  actor: Actor | null,
  input: unknown,
) {
  const data = employmentVoidSchema.parse(input)
  return repository.transactEmployment(async (tx) => {
    const { target, actorId } = await lockTarget(
      tx,
      actor,
      data.userId,
      data.expectedRevision,
    )
    const before = await repository.periodById(tx, target.id, data.periodId)
    if (!before)
      throw new EmploymentError('პერიოდი ვერ მოიძებნა ან უკვე გაუქმებულია.')
    const after = await repository.updatePeriod(tx, data.periodId, {
      voidedAt: new Date(),
    })
    await repository.recordChange(tx, {
      employeeId: target.id,
      periodId: after.id,
      actorId,
      action: 'voided',
      before: facts(before),
      after: facts(after),
      reason: data.reason ?? 'დასაქმების პერიოდი გაუქმდა.',
    })
    return { revision: target.revision + 1 }
  })
}

/** Private payroll interface. The caller authorizes the target employee and owns the consistent read transaction. Unknown legacy dates must block financial conclusions. */
export async function readEmploymentEligibility(
  tx: repository.EmploymentTransaction,
  input: unknown,
) {
  const data = employmentRangeSchema.parse(input)
  const result = await repository.eligibilityPeriods(
    tx,
    data.employeeId,
    data.startDate,
    data.endDate,
  )
  if (!result.confirmed)
    return {
      status: 'unknown' as const,
      revision: result.revision,
      periods: [],
    }
  return {
    status: 'confirmed' as const,
    revision: result.revision,
    periods: result.periods,
  }
}
