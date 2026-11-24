import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { permissionsMiddleware } from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  bonusRuleDetailSchema,
  bonusRuleSearchSchema,
  saveBonusRuleSchema,
} from './bonus-rules.schemas'
import {
  BonusRuleError,
  readBonusRule,
  readBonusRules,
  saveBonusRule,
} from './server/bonus-rules.service.server'

async function safely<T>(action: () => Promise<T>) {
  setResponseHeader('Cache-Control', 'private, no-store')
  try {
    return { ok: true as const, value: await enforcePolicy(action) }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error
    return {
      ok: false as const,
      message:
        error instanceof BonusRuleError
          ? error.message
          : 'წახალისების წესის მოთხოვნა ვერ შესრულდა. სცადეთ ხელახლა.',
    }
  }
}
const manager = permissionsMiddleware('manage.access', 'payroll.configure')
export const getBonusRules = createServerFn({ method: 'GET' })
  .middleware([manager])
  .validator(bonusRuleSearchSchema)
  .handler(({ context, data }) =>
    safely(() => readBonusRules(context.actor, data)),
  )
export const getBonusRule = createServerFn({ method: 'GET' })
  .middleware([manager])
  .validator(bonusRuleDetailSchema)
  .handler(({ context, data }) =>
    safely(() => readBonusRule(context.actor, data)),
  )
export const updateBonusRule = createServerFn({ method: 'POST' })
  .middleware([manager])
  .validator(saveBonusRuleSchema)
  .handler(({ context, data }) =>
    safely(() => saveBonusRule(context.actor, data)),
  )
