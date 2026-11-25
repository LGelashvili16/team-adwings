import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { permissionsMiddleware } from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  awardPoolDetailSchema,
  saveAwardPoolSchema,
  reviewPoolSchema,
  withdrawAwardPoolSchema,
} from './award-review.schemas'
import { AwardProposalError } from './server/award-proposals.policy.server'
import {
  saveAwardPool,
  decideAwardPool,
  readAwardPool,
  withdrawAwardPool,
} from './server/award-pools.service.server'

async function safely<T>(action: () => Promise<T>) {
  setResponseHeader('Cache-Control', 'private, no-store')
  try {
    return { ok: true as const, value: await enforcePolicy(action) }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error
    return {
      ok: false as const,
      message:
        error instanceof AwardProposalError
          ? error.message
          : 'ფონდის მოთხოვნა ვერ შესრულდა. გადაამოწმეთ მონაცემები და სცადეთ ხელახლა.',
    }
  }
}
const reader = permissionsMiddleware('manage.access', 'payroll.read.all')
const writer = permissionsMiddleware(
  'manage.access',
  'payroll.read.all',
  'payroll.awards.propose',
)
export const getAwardPool = createServerFn({ method: 'GET' })
  .middleware([reader])
  .validator(awardPoolDetailSchema)
  .handler(({ context, data }) =>
    safely(() => readAwardPool(context.actor, data)),
  )
export const setAwardPool = createServerFn({ method: 'POST' })
  .middleware([writer])
  .validator(saveAwardPoolSchema)
  .handler(({ context, data }) =>
    safely(() => saveAwardPool(context.actor, data)),
  )
export const cancelAwardPool = createServerFn({ method: 'POST' })
  .middleware([writer])
  .validator(withdrawAwardPoolSchema)
  .handler(({ context, data }) =>
    safely(() => withdrawAwardPool(context.actor, data)),
  )
export const reviewAwardPool = createServerFn({ method: 'POST' })
  .middleware([
    permissionsMiddleware(
      'manage.access',
      'payroll.read.all',
      'payroll.awards.review',
    ),
  ])
  .validator(reviewPoolSchema)
  .handler(({ context, data }) =>
    safely(() => decideAwardPool(context.actor, data)),
  )
