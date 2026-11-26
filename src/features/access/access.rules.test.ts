import { describe, expect, it } from 'vitest'
import {
  accountCodeSchema,
  accountActionSchema,
  activateAccountSchema,
  provisionAccountSchema,
} from './access.schemas'
import { formatSetupCode, normalizeSetupCode } from './access.rules'

it('normalizes activation usernames before the server looks them up', () => {
  expect(
    activateAccountSchema.parse({
      code: 'ABCDEFGH2345',
      username: '  Giorgi   Beridze.2  ',
      newPassword: 'example-password-123',
    }).username,
  ).toBe('giorgi-beridze.2')
})

describe('setup codes', () => {
  it('groups a code for display and reads it back unchanged', () => {
    const grouped = formatSetupCode('ABCDEFGH2345')
    expect(grouped).toBe('ABCD-EFGH-2345')
    expect(normalizeSetupCode(grouped)).toBe('ABCDEFGH2345')
  })

  it('accepts typed variations of a valid code', () => {
    expect(accountCodeSchema.parse(' abcd-efgh 2345 ')).toBe('ABCDEFGH2345')
  })

  it.each(['ABCDEFGH234', 'ABCDEFGH23456', 'ABCDEFGH234O', 'ABCDEFGH2341'])(
    'rejects %s',
    (code) => {
      expect(accountCodeSchema.safeParse(code).success).toBe(false)
    },
  )
})

describe('account action reasons', () => {
  it.each(['issue_activation', 'issue_reset'] as const)(
    'allows an optional bounded reason for %s',
    (action) => {
      expect(
        accountActionSchema.parse({ userId: 'employee', action, reason: '' })
          .reason,
      ).toBe('')
      expect(
        accountActionSchema.parse({ userId: 'employee', action, reason: '   ' })
          .reason,
      ).toBe('')
      expect(
        accountActionSchema.parse({
          userId: 'employee',
          action,
          reason: ' HR ',
        }).reason,
      ).toBe('HR')
      expect(
        accountActionSchema.safeParse({
          userId: 'employee',
          action,
          reason: 'a'.repeat(501),
        }).success,
      ).toBe(false)
    },
  )
  it.each(['suspend', 'restore'] as const)(
    'retains the required reason for %s',
    (action) => {
      expect(
        accountActionSchema.safeParse({
          userId: 'employee',
          action,
          reason: ' ',
        }).success,
      ).toBe(false)
      expect(
        accountActionSchema.safeParse({
          userId: 'employee',
          action,
          reason: 'audit reason',
        }).success,
      ).toBe(true)
    },
  )
})

it('defaults omitted system access to employee without inferring it from the position', () => {
  const input = { name: 'ანა მაისურაძე', contactEmail: '', jobTitle: 'HR' }
  expect(provisionAccountSchema.parse(input).roles).toEqual(['employee'])
  expect(
    provisionAccountSchema.safeParse({ ...input, roles: [] }).success,
  ).toBe(false)
  expect(
    provisionAccountSchema.parse({ ...input, roles: ['supervisor'] }).roles,
  ).toEqual(['supervisor'])
})
