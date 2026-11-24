import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { permissionsMiddleware } from '#/lib/auth/auth.middleware'
import { enforcePolicy } from '#/lib/authorization/guards.server'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { savePayrollSettingsSchema } from './payroll-settings.schemas'
import {
  readPayrollSettings,
  savePayrollSettings,
  PayrollSettingsError,
} from './server/payroll-settings.service.server'

const permission = permissionsMiddleware('manage.access', 'payroll.configure')
export const getPayrollSettings = createServerFn({ method: 'GET' })
  .middleware([permission])
  .handler(async ({ context }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    return enforcePolicy(() => readPayrollSettings(context.actor))
  })
export const updatePayrollSettings = createServerFn({ method: 'POST' })
  .middleware([permission])
  .validator(savePayrollSettingsSchema)
  .handler(async ({ context, data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    try {
      const value = await enforcePolicy(() =>
        savePayrollSettings(context.actor, data),
      )
      return { ok: true as const, value }
    } catch (error) {
      if (error instanceof AuthorizationError) throw error
      return {
        ok: false as const,
        message:
          error instanceof PayrollSettingsError
            ? error.message
            : 'პარამეტრები ვერ შეინახა. სცადეთ ხელახლა.',
      }
    }
  })
