import { expect, it } from 'vitest'
import {
  defaultJobNotificationRoles,
  notificationSettingsSchema,
} from './notification-settings.schemas'

it('allows all known roles and an empty list, but rejects unknown and duplicate roles', () => {
  expect(
    notificationSettingsSchema.parse({ jobNotificationRoles: [] }),
  ).toEqual({ jobNotificationRoles: [] })
  expect(
    notificationSettingsSchema.parse({
      jobNotificationRoles: ['hr_manager', 'employee'],
    }).jobNotificationRoles,
  ).toEqual(['employee', 'hr_manager'])
  for (const jobNotificationRoles of [
    ['unknown'],
    ['admin', 'admin'],
    'admin',
  ]) {
    expect(
      notificationSettingsSchema.safeParse({ jobNotificationRoles }).success,
    ).toBe(false)
  }
  expect(defaultJobNotificationRoles).toEqual([
    'production_specialist',
    'supervisor',
    'sales_manager',
    'admin',
    'owner',
  ])
})
