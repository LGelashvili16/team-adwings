import { hasEveryPermission } from '#/lib/authorization/permissions'
import type { Actor } from '#/lib/authorization/actor'

/** Navigation only. Every salary endpoint separately authorizes the current persisted identity. */
export function requireSalaryWorkspace(actor: Actor) {
  if (!hasEveryPermission(actor, ['manage.access', 'payroll.read.all'])) {
    // Plain metadata survives Router SSR serialization, unlike custom fields on Error instances.
    throw { status: 403, code: 'FORBIDDEN' }
  }
}
