import '@tanstack/react-start/server-only'
import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
  originCheckMiddleware,
} from 'better-auth/api'
import {
  activateAccountSchema,
  completeAccountSchema,
} from '../access.schemas'
import {
  AccountWorkflowError,
  completeEmployeeActivation,
  completeEmployeeReset,
} from './access.service.server'
import type { BetterAuthPlugin } from 'better-auth'

export function employeeAccessPlugin() {
  const handleError = (error: unknown): never => {
    if (error instanceof AccountWorkflowError) {
      if (error.code === 'USERNAME_TAKEN') {
        throw new APIError('CONFLICT', {
          code: 'USERNAME_TAKEN',
          message: error.message,
        })
      }
      throw new APIError('BAD_REQUEST', {
        code: 'INVALID_SETUP_CODE',
        message: error.message,
      })
    }
    throw new APIError('INTERNAL_SERVER_ERROR', {
      code: 'ACCOUNT_SETUP_FAILED',
      message: 'მოქმედება ვერ შესრულდა. სცადეთ მოგვიანებით.',
    })
  }
  const activateEmployee = createAuthEndpoint(
    '/employee-activate',
    {
      method: 'POST',
      body: activateAccountSchema,
      use: [formCsrfMiddleware, originCheckMiddleware],
    },
    async (ctx) => {
      try {
        await completeEmployeeActivation(ctx.body, (password) =>
          ctx.context.password.hash(password),
        )
        return ctx.json({ status: true })
      } catch (error) {
        return handleError(error)
      }
    },
  )
  const resetEmployeePassword = createAuthEndpoint(
    '/employee-reset',
    {
      method: 'POST',
      body: completeAccountSchema,
      use: [formCsrfMiddleware, originCheckMiddleware],
    },
    async (ctx) => {
      try {
        await completeEmployeeReset(ctx.body, (password) =>
          ctx.context.password.hash(password),
        )
        return ctx.json({ status: true })
      } catch (error) {
        return handleError(error)
      }
    },
  )
  return {
    id: 'employee-access',
    endpoints: {
      activateEmployee,
      resetEmployeePassword,
    },
  } satisfies BetterAuthPlugin
}
