import '@tanstack/react-start/server-only'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { assertPermissions } from '#/lib/authorization/access'
import { currentAuthorization } from '#/lib/authorization/permissions'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import type { Actor } from '#/lib/authorization/actor'
import { savePayrollSettingsSchema } from '../payroll-settings.schemas'
import * as repository from './payroll-settings.repository.server'

export class PayrollSettingsError extends Error {}

async function authorize(
  tx: repository.PayrollTransaction,
  actor: Actor | null,
) {
  if (!actor) throw new AuthorizationError()
  const { account, person } = await repository.currentAccount(tx, actor.id)
  if (!account || account.state !== 'active' || person?.status === 'inactive')
    throw new AuthorizationError()
  assertPermissions({ ...actor, ...currentAuthorization(account) }, [
    'manage.access',
    'payroll.configure',
  ])
  return actor.id
}

function view(row: Awaited<ReturnType<typeof repository.latestPolicy>>) {
  if (!row) return null
  return { ...row, createdAt: row.createdAt.toISOString() }
}
export async function readPayrollSettings(actor: Actor | null) {
  return repository.transactPayrollSettings(
    async (tx) => {
      await authorize(tx, actor)
      const { date: today } = await getCompanyWorkday(new Date(), tx)
      const latest = await repository.latestPolicy(tx)
      const current = await repository.effectivePolicy(tx, today)
      return { today, latest: view(latest), current: view(current) }
    },
    { isolationLevel: 'repeatable read' },
  )
}

export async function savePayrollSettings(actor: Actor | null, input: unknown) {
  const data = savePayrollSettingsSchema.parse(input)
  return repository.transactPayrollSettings(async (tx) => {
    await repository.lockPolicy(tx)
    const actorId = await authorize(tx, actor)
    const latest = await repository.latestPolicy(tx)
    if ((latest?.version ?? 0) !== data.expectedVersion)
      throw new PayrollSettingsError(
        'პარამეტრები სხვა მომხმარებელმა შეცვალა. განაახლეთ გვერდი და გადაამოწმეთ ცვლილებები.',
      )
    const { date: today } = await getCompanyWorkday(new Date(), tx)
    if (data.effectiveFrom < today)
      throw new PayrollSettingsError(
        'მოქმედების თარიღი დღევანდელ დღეზე ადრე ვერ იქნება.',
      )
    const { expectedVersion, reason, ...policy } = data
    // The policy row is also the atomic audit record. No previous version is updated or deleted.
    return view(
      await repository.insertPolicy(tx, {
        ...policy,
        version: expectedVersion + 1,
        actorId,
        reason: reason ?? 'ხელფასების პარამეტრები შენახულია.',
      }),
    )
  })
}
