import '@tanstack/react-start/server-only'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { assertPermission } from '#/lib/authorization/access'
import {
  currentAuthorization,
  hasAnyPermission,
  hasPermission,
} from '#/lib/authorization/permissions'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import { currentAccount } from './payroll-settings.repository.server'
import * as salaries from './salary.repository.server'
import * as repository from './rest-day-policy.repository.server'
import {
  readRestDayPolicySchema,
  saveRestDayPolicySchema,
} from '../rest-day-policy.schemas'
import type { Actor } from '#/lib/authorization/actor'
import type { EmployeeRestDayPolicyView } from '../rest-day-policy.types'

export class RestDayPolicyError extends Error {}

async function authorize(
  tx: repository.RestDayPolicyTransaction,
  actor: Actor | null,
  write: boolean,
) {
  if (!actor) throw new AuthorizationError()
  const { account, person } = await currentAccount(tx, actor.id)
  if (!account || account.state !== 'active' || person?.status === 'inactive')
    throw new AuthorizationError()
  const current = { ...actor, ...currentAuthorization(account) }
  assertPermission(current, 'manage.access')
  if (write) {
    assertPermission(current, 'payroll.attendance.review')
  } else if (
    !hasAnyPermission(current, ['payroll.attendance.review', 'payroll.read.all'])
  ) {
    throw new AuthorizationError()
  }
  return current
}

export async function readEmployeeRestDayPolicy(
  actor: Actor | null,
  input: unknown,
): Promise<EmployeeRestDayPolicyView> {
  const data = readRestDayPolicySchema.parse(input)
  return repository.transactRestDayPolicy(
    async (tx) => {
      const currentActor = await authorize(tx, actor, false)
      const target = await salaries.person(tx, data.userId)
      if (!target)
        throw new RestDayPolicyError('თანამშრომლის ჩანაწერი ვერ მოიძებნა.')
      const workday = await getCompanyWorkday(new Date(), tx)
      const [
        version,
        current,
        next,
        rows,
        total,
        currentSalary,
        nextSalary,
      ] = await Promise.all([
        repository.latestRestDayPolicyVersion(tx, target.id),
        repository.readEmployeeRestDayPolicyOnDate(tx, target.id, workday.date),
        repository.readNextRestDayPolicy(tx, target.id, workday.date),
        repository.readRestDayPolicyHistory(tx, target.id, data.page),
        repository.countRestDayPolicyHistory(tx, target.id),
        salaries.applicable(tx, target.id, workday.date),
        salaries.applicable(tx, target.id, workday.date, true),
      ])
      const salaryKind =
        currentSalary?.kind ?? nextSalary?.kind ?? null
      return {
        userId: target.userId,
        salaryKind,
        today: workday.date,
        timezone: workday.timezone,
        version,
        current,
        next,
        history: rows.map((row) => ({
          version: row.version,
          effectiveFrom: row.effectiveFrom,
          restDayClockInAllowed: row.restDayClockInAllowed,
          autoRestDayBonusEnabled: row.autoRestDayBonusEnabled,
          reason: row.reason,
          actorName: row.actorName,
          recordedAt: row.createdAt.toISOString(),
        })),
        total,
        pageSize: repository.policyHistoryPageSize,
        canEdit:
          currentActor.id !== target.userId &&
          hasPermission(currentActor, 'payroll.attendance.review'),
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}

export async function saveEmployeeRestDayPolicy(
  actor: Actor | null,
  input: unknown,
) {
  const data = saveRestDayPolicySchema.parse(input)
  return repository.transactRestDayPolicy(async (tx) => {
    const currentActor = await authorize(tx, actor, true)
    if (currentActor.id === data.userId)
      throw new RestDayPolicyError(
        'საკუთარი დასვენების დღის წესების შეცვლა დაუშვებელია.',
      )
    const target = await salaries.person(tx, data.userId, 'update')
    if (!target)
      throw new RestDayPolicyError('თანამშრომლის ჩანაწერი ვერ მოიძებნა.')
    const version = await repository.latestRestDayPolicyVersion(tx, target.id)
    if (version !== data.expectedVersion)
      throw new RestDayPolicyError(
        'დასვენების დღის წესები სხვა მომხმარებელმა შეცვალა. განაახლეთ გვერდი.',
      )
    const effectiveFrom =
      data.effectiveFrom ?? (await getCompanyWorkday(new Date(), tx)).date
    const existing = await repository.readEmployeeRestDayPolicyOnDate(
      tx,
      target.id,
      effectiveFrom,
    )
    const applicableSalary =
      (await salaries.applicable(tx, target.id, effectiveFrom)) ??
      (await salaries.applicable(tx, target.id, effectiveFrom, true))
    if (applicableSalary?.kind !== 'monthly' && data.autoRestDayBonusEnabled) {
      throw new RestDayPolicyError(
        'დასვენების დღის ავტომატური ბონუსის გადამრთველი მხოლოდ ფიქსირებული ხელფასის მქონე თანამშრომლებისთვისაა. საათობრივ თანამშრომლებს დასვენების დღეს +30% ავტომატურად ერიცხებათ.',
      )
    }
    const autoRestDayBonusEnabled =
      applicableSalary?.kind === 'monthly'
        ? data.autoRestDayBonusEnabled
        : false
    if (
      existing.version > 0 &&
      existing.effectiveFrom === effectiveFrom &&
      existing.restDayClockInAllowed === data.restDayClockInAllowed &&
      existing.autoRestDayBonusEnabled === autoRestDayBonusEnabled
    ) {
      throw new RestDayPolicyError(
        'არჩეულ თარიღზე იგივე პარამეტრები უკვე შენახულია.',
      )
    }
    const nextVersion = version + 1
    await repository.insertRestDayPolicy(tx, {
      employeeId: target.id,
      version: nextVersion,
      effectiveFrom,
      restDayClockInAllowed: data.restDayClockInAllowed,
      autoRestDayBonusEnabled,
      actorId: currentActor.id,
      reason:
        data.reason && data.reason.length >= 5
          ? data.reason
          : 'დასვენების დღის წესები განახლდა.',
    })
    return { version: nextVersion }
  })
}
