import '@tanstack/react-start/server-only'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { assertPermissions } from '#/lib/authorization/access'
import { currentAuthorization } from '#/lib/authorization/permissions'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import { currentAccount } from './payroll-settings.repository.server'
import * as repository from './bonus-rules.repository.server'
import {
  bonusRuleDetailSchema,
  bonusRuleSearchSchema,
  saveBonusRuleSchema,
} from '../bonus-rules.schemas'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { Actor } from '#/lib/authorization/actor'
import type { BonusRuleDetail, BonusRuleDirectory } from '../bonus-rules.types'

export class BonusRuleError extends Error {}
async function authorize(tx: PayrollTransaction, actor: Actor | null) {
  if (!actor) throw new AuthorizationError()
  const { account, person } = await currentAccount(tx, actor.id)
  if (!account || account.state !== 'active' || person?.status === 'inactive')
    throw new AuthorizationError()
  const current = { ...actor, ...currentAuthorization(account) }
  assertPermissions(current, ['manage.access', 'payroll.configure'])
  return current
}
export async function readBonusRules(
  actor: Actor | null,
  input: unknown,
): Promise<BonusRuleDirectory> {
  const data = bonusRuleSearchSchema.parse(input)
  return repository.transactBonusRules(
    async (tx) => {
      await authorize(tx, actor)
      const { date } = await getCompanyWorkday(new Date(), tx)
      return { today: date, ...(await repository.directory(tx, data, date)) }
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function readBonusRule(
  actor: Actor | null,
  input: unknown,
): Promise<BonusRuleDetail> {
  const data = bonusRuleDetailSchema.parse(input)
  return repository.transactBonusRules(
    async (tx) => {
      await authorize(tx, actor)
      const latest = await repository.latest(tx, data.ruleId)
      if (!latest) throw new BonusRuleError('წახალისების წესი ვერ მოიძებნა.')
      const { date, timezone } = await getCompanyWorkday(new Date(), tx)
      const { current, next } = await repository.states(tx, [data.ruleId], date)
      const history = await repository.history(
        tx,
        data.ruleId,
        data.page,
        data.q,
      )
      return {
        ruleId: data.ruleId,
        today: date,
        timezone,
        latest,
        current: current.get(data.ruleId) ?? null,
        next: next.get(data.ruleId) ?? null,
        total: history.total,
        pageSize: repository.historyPageSize,
        history: history.rows.map(({ createdAt, ...row }) => ({
          ...row,
          recordedAt: createdAt.toISOString(),
        })),
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function saveBonusRule(actor: Actor | null, input: unknown) {
  const data = saveBonusRuleSchema.parse(input)
  return repository.transactBonusRules(async (tx) => {
    const current = await authorize(tx, actor)
    await repository.lockCommand(tx, current.id, data.requestId)
    const prior = await repository.command(tx, current.id, data.requestId)
    if (prior) {
      const fields = [
        'name',
        'effectiveFrom',
        'kind',
        'calculation',
        'unitLabel',
        'qualification',
        'amountBasis',
        'amountMinor',
        'currency',
        'enabled',
        'reason',
      ] as const
      if (
        fields.some((field) => prior[field] !== data[field]) ||
        (data.ruleId !== null && prior.ruleId !== data.ruleId) ||
        prior.version !== data.expectedVersion + 1
      )
        throw new BonusRuleError(
          'ამ მოთხოვნის მონაცემები შეიცვალა. განაახლეთ გვერდი და გადაამოწმეთ წესი.',
        )
      return { ruleId: prior.ruleId, version: prior.version }
    }
    const { date } = await getCompanyWorkday(new Date(), tx)
    if (data.effectiveFrom < date)
      throw new BonusRuleError(
        'წესის ცვლილება ძალაში უნდა შევიდეს დღეს ან მომავალში.',
      )
    const ruleId = data.ruleId ?? (await repository.createRule(tx))
    if (!(await repository.lockRule(tx, ruleId)))
      throw new BonusRuleError('წახალისების წესი ვერ მოიძებნა.')
    const previous = await repository.latest(tx, ruleId)
    if ((previous?.version ?? 0) !== data.expectedVersion)
      throw new BonusRuleError(
        'წესი სხვა მომხმარებელმა შეცვალა. განაახლეთ მონაცემები და გადაამოწმეთ ცვლილებები.',
      )
    // Full immutable decisions preserve future changes when an earlier effective date is corrected.
    await repository.insertVersion(tx, {
      ruleId,
      version: data.expectedVersion + 1,
      actorId: current.id,
      requestId: data.requestId,
      name: data.name,
      effectiveFrom: data.effectiveFrom,
      kind: data.kind,
      calculation: data.calculation,
      unitLabel: data.unitLabel,
      qualification: data.qualification,
      amountBasis: data.amountBasis,
      amountMinor: data.amountMinor,
      currency: data.currency,
      enabled: data.enabled,
      reason: data.reason,
    })
    return { ruleId, version: data.expectedVersion + 1 }
  })
}
