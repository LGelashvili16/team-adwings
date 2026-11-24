import { expect, it } from 'vitest'
import { requireSalaryWorkspace } from './salary.access'
import { errorStatus } from '#/lib/error-diagnostics'
import type { Actor } from '#/lib/authorization/actor'

const actor: Actor = {
  id: 'worker',
  name: 'ტესტი',
  email: null,
  emailVerified: false,
  roles: ['employee'],
}
it('preserves safe forbidden metadata through SSR serialization', () => {
  for (const roles of [['employee'], ['hr_manager']] as const) {
    try {
      requireSalaryWorkspace({ ...actor, roles: [...roles] })
      throw new Error('Expected denial')
    } catch (error) {
      expect(errorStatus(JSON.parse(JSON.stringify(error)))).toBe(403)
    }
  }
})
it('keeps navigation aligned with explicit payroll grants and denials', () => {
  expect(() =>
    requireSalaryWorkspace({ ...actor, roles: ['accountant'] }),
  ).not.toThrow()
  expect(() =>
    requireSalaryWorkspace({
      ...actor,
      roles: ['owner'],
      permissionOverrides: { allow: [], deny: ['payroll.read.all'] },
    }),
  ).toThrow()
})
