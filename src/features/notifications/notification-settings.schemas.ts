import { z } from 'zod'
import { hasPermission, roleSchema } from '#/lib/authorization/permissions'

export const defaultJobNotificationRoles = roleSchema.options.filter(
  (role) =>
    hasPermission([role], 'jobs.manage') || hasPermission([role], 'jobs.claim'),
)

export const notificationSettingsSchema = z.strictObject({
  jobNotificationRoles: z
    .array(z.enum(roleSchema.options, { error: 'არჩეული როლი არასწორია.' }), {
      error: 'აირჩიეთ შეტყობინების მიმღები როლები.',
    })
    .max(roleSchema.options.length, 'როლების რაოდენობა არასწორია.')
    .refine(
      (roles) => new Set(roles).size === roles.length,
      'როლი სიაში მეორდება.',
    )
    .transform((roles) =>
      roleSchema.options.filter((role) => roles.includes(role)),
    ),
})
