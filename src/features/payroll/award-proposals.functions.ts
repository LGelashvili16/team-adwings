import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { permissionsMiddleware } from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  awardDetailSchema,
  awardLookupSchema,
  awardSearchSchema,
  saveAwardSchema,
  withdrawAwardSchema,
} from './award-proposals.schemas'
import {
  reviewAwardProposal,
  AwardProposalError,
  lookupAwardInputs,
  readAwardProposal,
  readAwardProposals,
  saveAwardProposal,
  withdrawAwardProposal,
} from './server/award-proposals.service.server'
import { reviewAwardSchema } from './award-review.schemas'

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
          : 'განაცხადის მოთხოვნა ვერ შესრულდა. გადაამოწმეთ მონაცემები და სცადეთ ხელახლა.',
    }
  }
}
const reader = permissionsMiddleware('manage.access', 'payroll.read.all')
const writer = permissionsMiddleware(
  'manage.access',
  'payroll.read.all',
  'payroll.awards.propose',
)
export const getAwardProposals = createServerFn({ method: 'GET' })
  .middleware([reader])
  .validator(awardSearchSchema)
  .handler(({ context, data }) =>
    safely(() => readAwardProposals(context.actor, data)),
  )
export const getAwardProposal = createServerFn({ method: 'GET' })
  .middleware([reader])
  .validator(awardDetailSchema)
  .handler(({ context, data }) =>
    safely(() => readAwardProposal(context.actor, data)),
  )
export const getAwardChoices = createServerFn({ method: 'GET' })
  .middleware([writer])
  .validator(awardLookupSchema)
  .handler(({ context, data }) =>
    safely(() => lookupAwardInputs(context.actor, data)),
  )
export const setAwardProposal = createServerFn({ method: 'POST' })
  .middleware([writer])
  .validator(saveAwardSchema)
  .handler(({ context, data }) =>
    safely(() => saveAwardProposal(context.actor, data)),
  )
export const cancelAwardProposal = createServerFn({ method: 'POST' })
  .middleware([writer])
  .validator(withdrawAwardSchema)
  .handler(({ context, data }) =>
    safely(() => withdrawAwardProposal(context.actor, data)),
  )
export const decideAwardProposal = createServerFn({ method: 'POST' })
  .middleware([
    permissionsMiddleware(
      'manage.access',
      'payroll.read.all',
      'payroll.awards.review',
    ),
  ])
  .validator(reviewAwardSchema)
  .handler(({ context, data }) =>
    safely(() => reviewAwardProposal(context.actor, data)),
  )
