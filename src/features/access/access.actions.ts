import { hasEveryPermission, parseRoles } from '#/lib/authorization/permissions'
import type { Actor } from '#/lib/authorization/actor'
import type { AccountAction } from './components/account-action-content'
import type { EmployeeAccountSummary } from './access.types'

/**
 * Interface guidance only: the server re-checks every rule. Mirrors checkTarget in the service:
 * Targeted account administration excludes self. Owner accounts need an owner;
 * administrator and accountant accounts need platform account authority.
 */
export function canManageAccount(
  record: Pick<EmployeeAccountSummary, 'userId' | 'roles'>,
  actor: Actor,
) {
  const targetRoles = parseRoles(record.roles)
  const privileged = targetRoles.includes('owner')
    ? !actor.roles.includes('owner')
    : (targetRoles.includes('admin') || targetRoles.includes('accountant')) &&
      !hasEveryPermission(actor, ['admin.access', 'users.manage'])
  return (
    hasEveryPermission(actor, ['manage.access', 'employees.manage']) &&
    record.userId !== actor.id &&
    !privileged
  )
}

export function canEditOwnEmployeeProfile(actor: Actor) {
  return (
    hasEveryPermission(actor, ['manage.access', 'employees.manage']) &&
    actor.roles.some(
      (role) => role === 'owner' || role === 'admin' || role === 'hr_manager',
    )
  )
}

/** Inactive employment allows suspension only; codes and restoration need an active employee. */
export function availableAccountActions(
  record: Pick<EmployeeAccountSummary, 'state' | 'employmentStatus'>,
): Array<AccountAction> {
  const actions: Array<AccountAction> =
    record.state === 'suspended'
      ? ['restore']
      : record.state === 'invited'
        ? ['issue_activation', 'suspend']
        : ['issue_reset', 'suspend']
  return record.employmentStatus === 'active'
    ? actions
    : actions.filter((action) => action === 'suspend')
}
