import '@tanstack/react-start/server-only'
import { assertPermissions } from '#/lib/authorization/access'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { currentAuthorization } from '#/lib/authorization/permissions'
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
      return {
        revision: target.revision,
        today: workday.date,
        timezone: workday.timezone,
        confirmed: periodTotal > 0,
        periods: await repository.readPeriods(
          tx,
          target.id,
          data.employmentPage,
        ),
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
  const current = await authorize(tx, actor, true)
  if (current.id === userId) throw new AuthorizationError()
  const target = await repository.targetEmployee(tx, userId, true)
  if (!target) throw new EmploymentError('თანამშრომელი ვერ მოიძებნა.')
  if (target.revision !== expectedRevision)
    throw new EmploymentError(
      'დასაქმების პერიოდები შეიცვალა. განაახლეთ გვერდი და გადაამოწმეთ მონაცემები.',
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
    const before = data.periodId
      ? await repository.periodById(tx, target.id, data.periodId)
      : null
    if (data.periodId && !before)
      throw new EmploymentError('პერიოდი ვერ მოიძებნა ან უკვე გაუქმებულია.')
    if (
      await repository.hasOverlap(
        tx,
        target.id,
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
          target.id,
          data.startDate,
          data.endDate,
        )
    await repository.recordChange(tx, {
      employeeId: target.id,
      periodId: after.id,
      actorId,
      action: before ? 'updated' : 'created',
      before: before ? facts(before) : null,
      after: facts(after),
      reason: data.reason,
    })
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
      reason: data.reason,
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
