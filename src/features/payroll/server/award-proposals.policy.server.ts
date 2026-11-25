import '@tanstack/react-start/server-only'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { assertPermissions } from '#/lib/authorization/access'
import { currentAuthorization } from '#/lib/authorization/permissions'
import { currentAccount } from './payroll-settings.repository.server'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { Actor } from '#/lib/authorization/actor'

export class AwardProposalError extends Error {}
export async function authorizeAward(
  tx: PayrollTransaction,
  actor: Actor | null,
  action: 'read' | 'propose' | 'review' = 'read',
) {
  if (!actor) throw new AuthorizationError()
  const { account, person } = await currentAccount(tx, actor.id)
  if (!account || account.state !== 'active' || person?.status === 'inactive')
    throw new AuthorizationError()
  const current = { ...actor, ...currentAuthorization(account) }
  assertPermissions(current, [
    'manage.access',
    'payroll.read.all',
    ...(action === 'propose'
      ? ['payroll.awards.propose' as const]
      : action === 'review'
        ? ['payroll.awards.review' as const]
        : []),
  ])
  return current
}
