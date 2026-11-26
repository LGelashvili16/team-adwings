import '@tanstack/react-start/server-only'
import { createHash, randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { user } from '#/db/schema'
import { assertPermissions } from '#/lib/authorization/access'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import {
  parseRoles,
  currentAuthorization,
  hasEveryPermission,
} from '#/lib/authorization/permissions'
import { provisionIdentity } from '#/lib/auth/provisioning.server'
import { initializeEmployeeDayOffBalance } from '#/features/leave/server/day-off-allowance.service.server'
import { createInitialEmployeeEmployment } from '#/features/employees/server/employment.service.server'
import {
  assignInitialEmployeeWeek,
  readCompanyWeek,
  readEmployeeWorkLocations,
  replaceEmployeeWeek,
  ScheduleWorkflowError,
  updateEmployeeWorkLocations,
} from '#/features/scheduling/server/scheduling.service.server'
import { canEditOwnEmployeeProfile } from '../access.actions'
import {
  accountActionSchema,
  accountListSchema,
  accountLookupSchema,
  activateAccountSchema,
  bootstrapOwnerSchema,
  completeAccountSchema,
  employeeDetailsSchema,
  ownPhoneSchema,
  provisionAccountSchema,
  ownerRecoverySchema,
} from '../access.schemas'
import {
  isSyntheticAuthEmail,
  setupCodeAlphabet,
  setupCodeLength,
  setupCodeLifetimeMinutes,
} from '../access.rules'
import * as repository from './access.repository.server'
import type { Actor } from '#/lib/authorization/actor'
import type { z } from 'zod'
import type { Role } from '#/lib/authorization/permissions'

export class AccountWorkflowError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}
const invalidCode = () =>
  new AccountWorkflowError('კოდი არასწორია, ვადაგასულია ან უკვე გამოყენებულია.')
export const hashSetupCode = (code: string) =>
  createHash('sha256').update(code).digest('hex')
export const getLoginAccess = repository.readAccountAccess

// randomInt is unbiased, unlike mapping raw random bytes onto a 32-symbol alphabet by modulo.
const generateSetupCode = () =>
  Array.from(
    { length: setupCodeLength },
    () => setupCodeAlphabet[randomInt(setupCodeAlphabet.length)],
  ).join('')

async function currentEmployeeManager(
  tx: repository.AccessTransaction,
  actor: Actor,
) {
  const record = await repository.lockedAccount(tx, actor.id)
  if (
    !record ||
    record.identity.accessState !== 'active' ||
    (record.person && record.person.status !== 'active')
  )
    throw new AuthorizationError()
  const current = { ...actor, ...currentAuthorization(record.identity) }
  assertPermissions(current, ['manage.access', 'employees.manage'])
  return current
}

function checkTarget(actor: Actor, id: string, roles: Array<Role>) {
  if (actor.id === id) throw new AuthorizationError()
  if (
    (roles.includes('owner') && !actor.roles.includes('owner')) ||
    ((roles.includes('admin') || roles.includes('accountant')) &&
      !hasEveryPermission(actor, ['admin.access', 'users.manage']))
  )
    throw new AuthorizationError()
}

function assertAssignableRoles(actor: Actor, roles: ReadonlyArray<Role>) {
  if (roles.includes('admin') || roles.includes('accountant'))
    assertPermissions(actor, ['admin.access', 'users.manage', 'roles.manage'])
}

async function issueChallenge(
  tx: repository.AccessTransaction,
  userId: string,
  issuer: string | null,
  purpose: 'activation' | 'reset',
) {
  const code = generateSetupCode()
  const expiresAt = new Date(
    Date.now() + setupCodeLifetimeMinutes[purpose] * 60_000,
  )
  await repository.storeChallenge(tx, {
    userId,
    codeHash: hashSetupCode(code),
    purpose,
    expiresAt,
    issuedBy: issuer,
  })
  return { code, expiresAt: expiresAt.toISOString(), purpose }
}

async function createEmployee(
  tx: repository.AccessTransaction,
  input: z.infer<typeof provisionAccountSchema> & { code?: string | null },
  manager: Actor | null,
  roles: ReadonlyArray<Role>,
) {
  const actorId = manager?.id ?? null
  const storedRoles = [...new Set(roles)].sort().join(',')
  const username = input.code ?? null
  const userId = await provisionIdentity(
    tx,
    input.name,
    username,
    input.contactEmail,
  )
  const person = await repository.insertEmployee(tx, {
    username,
    userId,
    fullName: input.name,
    contactEmail: input.contactEmail || null,
    jobTitle: input.jobTitle || null,
    phone: input.phone || null,
  })
  await initializeEmployeeDayOffBalance(
    tx,
    userId,
    input.dayOffAllowance,
    actorId,
  )
  if (!person) throw new AuthorizationError()
  if (input.employmentStartDate) {
    if (!manager) throw new AuthorizationError()
    await createInitialEmployeeEmployment(
      tx,
      person.id,
      manager,
      input.employmentStartDate,
    )
  }
  try {
    await assignInitialEmployeeWeek(person.id, input.workingWeek, actorId, tx)
    if (input.remoteWeekdays?.length) {
      if (!actorId) throw new AuthorizationError()
      await updateEmployeeWorkLocations(
        person.id,
        actorId,
        { remoteWeekdays: input.remoteWeekdays },
        tx,
      )
      await repository.auditAccess(tx, {
        actorId,
        targetId: userId,
        action: 'account.recurring_work_location_updated',
        reason: `დისტანციური სამუშაო დღეები (ორშაბათი = 1): ${[...input.remoteWeekdays].sort().join(', ')}.`,
      })
    }
  } catch (error) {
    if (error instanceof ScheduleWorkflowError)
      throw new AccountWorkflowError(error.message)
    throw error
  }
  await tx
    .update(user)
    .set({ roles: storedRoles })
    .where(sql`${user.id} = ${userId}`)
  await repository.updateIdentity(tx, userId, 'invited', null)
  const challenge = await issueChallenge(tx, userId, actorId, 'activation')
  await repository.auditAccess(tx, {
    actorId,
    targetId: userId,
    action: `account.provisioned.${storedRoles}`,
    reason:
      storedRoles === 'owner'
        ? 'კომპანიის პირველი მფლობელის პირველადი შექმნა.'
        : 'თანამშრომლის ანგარიშის შექმნა.',
  })
  return challenge
}

export async function provisionEmployee(
  actor: Actor,
  untrusted: z.input<typeof provisionAccountSchema>,
) {
  const input = provisionAccountSchema.parse(untrusted)
  return repository.transactAccounts(async (tx) => {
    const manager = await currentEmployeeManager(tx, actor)
    assertAssignableRoles(manager, input.roles)
    return createEmployee(tx, input, manager, input.roles)
  })
}

export async function listEmployeeAccounts(
  actor: Actor,
  untrusted: z.infer<typeof accountListSchema>,
) {
  assertPermissions(actor, ['manage.access', 'employees.manage'])
  const { page } = accountListSchema.parse(untrusted)
  return repository.queryAccounts(page)
}

export async function readEmployeeAccount(
  actor: Actor,
  untrusted: z.input<typeof accountLookupSchema>,
) {
  assertPermissions(actor, ['manage.access', 'employees.manage'])
  const { userId } = accountLookupSchema.parse(untrusted)
  const record = await repository.queryAccount(userId)
  if (!record) return null
  const [companyWeek, workLocations] = await Promise.all([
    record.workingWeek ? null : readCompanyWeek(),
    readEmployeeWorkLocations(userId),
  ])
  return { record, companyWeek, workLocations }
}

export async function manageEmployeeAccount(
  actor: Actor,
  untrusted: z.infer<typeof accountActionSchema>,
) {
  const input = accountActionSchema.parse(untrusted)
  return repository.transactAccounts(async (tx) => {
    const manager = await currentEmployeeManager(tx, actor)
    const target = await repository.lockedAccount(tx, input.userId)
    if (!target?.person)
      throw new AccountWorkflowError('თანამშრომლის ანგარიში ვერ მოიძებნა.')
    checkTarget(manager, input.userId, parseRoles(target.identity.roles))
    let challenge: Awaited<ReturnType<typeof issueChallenge>> | null = null
    if (input.action === 'issue_activation' || input.action === 'issue_reset') {
      const activation = input.action === 'issue_activation'
      const expected = activation ? 'invited' : 'active'
      if (
        target.identity.accessState !== expected ||
        target.person.status !== 'active'
      )
        throw new AccountWorkflowError(
          'ანგარიშის მიმდინარე სტატუსი ამ მოქმედებას არ უშვებს.',
        )
      challenge = await issueChallenge(
        tx,
        input.userId,
        manager.id,
        activation ? 'activation' : 'reset',
      )
    } else if (input.action === 'suspend') {
      // Suspending login access does not terminate employment or change HR records.
      await repository.updateIdentity(tx, input.userId, 'suspended')
      await repository.revokeAccess(tx, input.userId)
    } else {
      if (target.identity.accessState !== 'suspended')
        throw new AccountWorkflowError('ანგარიში შეჩერებული არ არის.')
      if (target.person.status !== 'active')
        throw new AccountWorkflowError(
          'ანგარიშის აღდგენამდე საჭიროა დასაქმების სტატუსის აღდგენა.',
        )
      await repository.updateIdentity(
        tx,
        input.userId,
        target.identity.activatedAt ? 'active' : 'invited',
      )
    }
    await repository.auditAccess(tx, {
      actorId: manager.id,
      targetId: input.userId,
      action: `account.${input.action}`,
      reason: input.reason,
    })
    return challenge
  })
}

export async function editEmployeeDetails(
  actor: Actor,
  untrusted: z.input<typeof employeeDetailsSchema>,
) {
  const input = employeeDetailsSchema.parse(untrusted)
  return repository.transactAccounts(async (tx) => {
    const manager = await currentEmployeeManager(tx, actor)
    const editingSelf = manager.id === input.userId
    const updatesWorkLocation =
      input.remoteWeekdays !== undefined ||
      input.workLocationOverride !== undefined
    if (
      editingSelf &&
      (!canEditOwnEmployeeProfile(manager) || input.roles !== undefined)
    )
      throw new AuthorizationError()
    if (input.workingWeek !== undefined || updatesWorkLocation)
      assertPermissions(manager, ['attendance.configure'])
    const target = await repository.lockedAccount(tx, input.userId)
    if (!target?.person)
      throw new AccountWorkflowError('თანამშრომლის ანგარიში ვერ მოიძებნა.')
    const targetRoles = parseRoles(target.identity.roles)
    if (!editingSelf) checkTarget(manager, input.userId, targetRoles)
    let roleChanged = false
    if (input.roles !== undefined) {
      if (!targetRoles.length || targetRoles.includes('owner'))
        throw new AccountWorkflowError(
          'ამ ანგარიშის როლები წვდომის მართვის გვერდიდან იმართება.',
        )
      if (input.expectedRoles !== target.identity.roles)
        throw new AccountWorkflowError(
          'როლები შეიცვალა. განაახლეთ თანამშრომლის მონაცემები და სცადეთ ხელახლა.',
        )
      const storedRoles = [...new Set(input.roles)].sort().join(',')
      if (storedRoles !== [...targetRoles].sort().join(',')) {
        assertAssignableRoles(manager, targetRoles)
        assertAssignableRoles(manager, input.roles)
        await tx
          .update(user)
          .set({ roles: storedRoles })
          .where(sql`${user.id} = ${input.userId}`)
        await repository.revokeSessions(tx, input.userId)
        roleChanged = true
      }
    }
    // An email-based account signs in with this address, so it follows the contact email;
    // contact-only addresses of email-less accounts never become login identities.
    const usesLoginEmail = !isSyntheticAuthEmail(target.identity.email)
    if (usesLoginEmail && !input.contactEmail)
      throw new AccountWorkflowError(
        'ამ ანგარიშში ელფოსტა შესვლის მონაცემია და მისი წაშლა შეუძლებელია.',
      )
    if (
      input.contactEmail &&
      (await repository.emailInUse(tx, input.contactEmail, input.userId))
    )
      throw new AccountWorkflowError('ეს ელფოსტა სხვა ანგარიშს უკვე უკავია.')
    let usernameChanged = false
    if (input.code !== undefined) {
      const currentUsername = target.person.username ?? target.identity.username
      if (input.code === '') {
        if (currentUsername !== null)
          throw new AccountWorkflowError(
            'მომხმარებლის სახელის წაშლა შეუძლებელია.',
          )
      } else if (input.code !== currentUsername) {
        if (await repository.usernameInUse(tx, input.code, input.userId))
          throw new AccountWorkflowError(
            'ეს მომხმარებლის სახელი უკვე დაკავებულია.',
            'USERNAME_TAKEN',
          )
        await repository.setAccountUsername(tx, input.userId, input.code)
        usernameChanged = true
      }
    }
    await repository.updateEmployeeDetails(tx, input.userId, {
      name: input.name,
      contactEmail: input.contactEmail,
      jobTitle: input.jobTitle,
      phone: input.phone,
      loginEmail: usesLoginEmail ? input.contactEmail : null,
    })
    await repository.auditAccess(tx, {
      actorId: manager.id,
      targetId: input.userId,
      action: 'account.details_updated',
      reason: 'თანამშრომლის მონაცემების განახლება.',
    })
    if (usernameChanged) {
      await repository.auditAccess(tx, {
        actorId: manager.id,
        targetId: input.userId,
        action: 'account.username_updated',
        reason: 'თანამშრომლის მომხმარებლის სახელის განახლება.',
      })
    }
    if (roleChanged) {
      await repository.auditAccess(tx, {
        actorId: manager.id,
        targetId: input.userId,
        action: 'account.role_updated',
        reason: 'თანამშრომლის როლების განახლება.',
      })
    }
    try {
      if (
        input.workingWeek !== undefined &&
        (await replaceEmployeeWeek(
          target.person.id,
          input.workingWeek,
          manager.id,
          tx,
        ))
      )
        await repository.auditAccess(tx, {
          actorId: manager.id,
          targetId: input.userId,
          action: 'account.schedule_updated',
          reason: 'თანამშრომლის სამუშაო განრიგის განახლება.',
        })
      if (updatesWorkLocation) {
        const override = input.workLocationOverride
        const result = await updateEmployeeWorkLocations(
          target.person.id,
          manager.id,
          { remoteWeekdays: input.remoteWeekdays, override },
          tx,
        )
        if (result.recurringChanged) {
          const days = [...(input.remoteWeekdays ?? [])].sort().join(', ')
          await repository.auditAccess(tx, {
            actorId: manager.id,
            targetId: input.userId,
            action: 'account.recurring_work_location_updated',
            reason: days
              ? `დისტანციური სამუშაო დღეები (ორშაბათი = 1): ${days}.`
              : 'ყოველკვირეული სამუშაო ადგილი: ადგილზე.',
          })
        }
        if (result.dateChanged && override)
          await repository.auditAccess(tx, {
            actorId: manager.id,
            targetId: input.userId,
            action: 'account.dated_work_location_updated',
            reason: `${override.date} სამუშაო ადგილი: ${override.remote === null ? 'ჩვეულებრივი განრიგი' : override.remote ? 'დისტანციურად' : 'ადგილზე'}.`,
          })
      }
    } catch (error) {
      if (error instanceof ScheduleWorkflowError)
        throw new AccountWorkflowError(error.message)
      throw error
    }
  })
}

export async function readOwnProfile(actor: Actor) {
  return repository.readOwnProfile(actor.id)
}

/** The subject is always the authenticated actor; no employee identifier is accepted from the client. */
export async function updateOwnPhone(
  actor: Actor,
  untrusted: z.input<typeof ownPhoneSchema>,
) {
  const { phone } = ownPhoneSchema.parse(untrusted)
  if (!(await repository.updateOwnPhone(actor.id, phone || null)))
    throw new AccountWorkflowError('თანამშრომლის პროფილი ვერ მოიძებნა.')
  return { phone }
}

/** Called by a Better Auth endpoint; hashing uses its configured password implementation. */
async function executeEmployeeSetup(
  code: string,
  newPassword: string,
  username: string | null,
  purpose: 'activation' | 'reset',
  hashPassword: (password: string) => Promise<string>,
) {
  const hash = hashSetupCode(code)
  const candidate = await repository.lookupChallenge(hash)
  if (!candidate) throw invalidCode()
  const passwordHash = await hashPassword(newPassword)
  await repository.transactAccounts(async (tx) => {
    // Always lock the user before the challenge, matching issue/suspend lock order.
    const target = await repository.lockedAccount(tx, candidate.userId)
    if (
      !target?.person ||
      target.person.status !== 'active' ||
      target.identity.accessState !==
        (purpose === 'activation' ? 'invited' : 'active')
    )
      throw invalidCode()
    // Validate and consume the challenge before checking username availability so invalid codes cannot probe usernames.
    // If username is taken, throwing rolls back the transaction and preserves the one-time code for retry.
    if (
      !(await repository.consumeChallenge(tx, candidate.userId, hash, purpose))
    )
      throw invalidCode()
    if (purpose === 'activation') {
      if (!username) throw invalidCode()
      if (await repository.usernameInUse(tx, username, candidate.userId))
        throw new AccountWorkflowError(
          'ეს მომხმარებლის სახელი უკვე დაკავებულია. აირჩიეთ სხვა სახელი.',
          'USERNAME_TAKEN',
        )
      await repository.setAccountUsername(tx, candidate.userId, username)
    }
    await repository.replacePassword(tx, candidate.userId, passwordHash)
    await repository.updateIdentity(
      tx,
      candidate.userId,
      'active',
      target.identity.activatedAt ?? new Date(),
    )
    await repository.auditAccess(tx, {
      actorId: candidate.userId,
      targetId: candidate.userId,
      action:
        purpose === 'activation'
          ? 'account.activated'
          : 'account.password_reset',
      reason: 'ადმინისტრატორის მიერ გაცემული ერთჯერადი კოდის გამოყენება.',
    })
  })
}

export async function completeEmployeeActivation(
  input: z.input<typeof activateAccountSchema>,
  hashPassword: (password: string) => Promise<string>,
) {
  const parsed = activateAccountSchema.parse(input)
  await executeEmployeeSetup(
    parsed.code,
    parsed.newPassword,
    parsed.username,
    'activation',
    hashPassword,
  )
}

export async function completeEmployeeReset(
  input: z.input<typeof completeAccountSchema>,
  hashPassword: (password: string) => Promise<string>,
) {
  const parsed = completeAccountSchema.parse(input)
  await executeEmployeeSetup(
    parsed.code,
    parsed.newPassword,
    null,
    'reset',
    hashPassword,
  )
}

/** Operator-only entry point. No route or server-function exposes first-owner creation. */
export async function bootstrapOwner(
  untrusted: z.input<typeof bootstrapOwnerSchema>,
) {
  const ownerInput = bootstrapOwnerSchema.parse(untrusted)
  const input = {
    ...provisionAccountSchema.parse({
      name: ownerInput.name,
      contactEmail: ownerInput.contactEmail,
      roles: ['employee'],
    }),
    code: ownerInput.code,
  }
  return repository.transactAccounts(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('teamwork-owner-bootstrap'))`,
    )
    const privileged = await tx
      .select({ id: user.id })
      .from(user)
      .where(sql`${user.roles} ~ '(^|,)(admin|owner)(,|$)'`)
      .limit(1)
    if (privileged.length)
      throw new AccountWorkflowError(
        'პრივილეგირებული ანგარიში უკვე არსებობს. გამოიყენეთ ანგარიშების მართვის გვერდი.',
      )
    return createEmployee(tx, input, null, ['owner'])
  })
}

/** Database operators can recover an existing owner without creating another identity. Never expose this as an application endpoint. */
export async function recoverOwnerCode(
  untrusted: z.infer<typeof ownerRecoverySchema>,
) {
  const input = ownerRecoverySchema.parse(untrusted)
  const id = await repository.userIdForCode(input.code)
  if (!id) throw new AccountWorkflowError('მფლობელის ანგარიში ვერ მოიძებნა.')
  return repository.transactAccounts(async (tx) => {
    const target = await repository.lockedAccount(tx, id)
    if (!target?.person || !parseRoles(target.identity.roles).includes('owner'))
      throw new AuthorizationError()
    await repository.revokeAccess(tx, id)
    const purpose = target.identity.activatedAt ? 'reset' : 'activation'
    await repository.updateIdentity(
      tx,
      id,
      purpose === 'reset' ? 'active' : 'invited',
    )
    await repository.setEmployment(tx, id, 'active')
    const code = await issueChallenge(tx, id, null, purpose)
    await repository.auditAccess(tx, {
      actorId: null,
      targetId: id,
      action: 'account.operator_recovery',
      reason: input.reason,
    })
    return code
  })
}
