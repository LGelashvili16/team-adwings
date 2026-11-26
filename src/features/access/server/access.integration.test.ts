// @vitest-environment node
import 'dotenv/config'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'
import { and, count, eq } from 'drizzle-orm'
import {
  followingDate,
  isoWeekday,
} from '#/features/scheduling/scheduling.rules'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '#/lib/authorization/actor'
import type * as AccessService from './access.service.server'
import type * as AdminAccessService from './admin-access.service.server'
import type * as AccountSchema from '#/db/schema'
import type { db as Database } from '#/db'
import type { auth as Authentication } from '#/lib/auth/auth'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const enabled = process.env.RUN_ACCOUNT_DB_TESTS === '1'
const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_account_test_${randomBytes(8).toString('hex')}`
let adminConnection: pg.Client | undefined
let service: typeof AccessService
let administration: typeof AdminAccessService
let tables: typeof AccountSchema
let database: typeof Database | undefined
let auth: typeof Authentication
let owner: Actor
const password = 'Example-test-password-123!'
function testDatabase() {
  if (!database) throw new Error('Test database is unavailable')
  return database
}

describe.runIf(enabled)('employee account lifecycle against PostgreSQL', () => {
  beforeAll(async () => {
    if (!originalUrl)
      throw new Error('Local test database configuration is required')
    const target = new URL(originalUrl)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
      throw new Error('Account integration tests require local PostgreSQL')
    adminConnection = new pg.Client({ connectionString: originalUrl })
    await adminConnection.connect()
    await adminConnection.query(`CREATE DATABASE "${databaseName}"`)
    target.pathname = `/${databaseName}`
    process.env.DATABASE_URL = target.toString()
    const connection = new pg.Client({ connectionString: target.toString() })
    await connection.connect()
    try {
      for (const file of readdirSync('drizzle')
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort())
        await connection.query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
    } finally {
      await connection.end()
    }
    vi.resetModules()
    service = await import('./access.service.server')
    administration = await import('./admin-access.service.server')
    tables = await import('#/db/schema')
    database = (await import('#/db')).db
    auth = (await import('#/lib/auth/auth')).auth
    const issued = await service.bootstrapOwner({
      code: 'owner-test',
      name: 'ტესტის მფლობელი',
      contactEmail: '',
    })
    await service.completeEmployeeActivation(
      { code: issued.code, username: 'owner-test', newPassword: password },
      (value) => auth.$context.then((context) => context.password.hash(value)),
    )
    const [record] = await testDatabase()
      .select()
      .from(tables.user)
      .where(eq(tables.user.username, 'owner-test'))
    owner = {
      id: record.id,
      name: record.name,
      email: null,
      emailVerified: false,
      roles: ['owner'],
    }
  }, 30_000)

  afterAll(async () => {
    if (database) await testDatabase().$client.end()
    process.env.DATABASE_URL = originalUrl
    if (adminConnection) {
      await adminConnection.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      )
      await adminConnection.end()
    }
  })

  async function provision(name = 'ტესტის თანამშრომელი') {
    return service.provisionEmployee(owner, {
      name,
      contactEmail: '',
      roles: ['employee'],
    })
  }
  async function identity(code: string) {
    const [record] = await testDatabase()
      .select()
      .from(tables.user)
      .where(eq(tables.user.username, code))
    return record
  }
  async function identityById(userId: string) {
    const [record] = await testDatabase()
      .select()
      .from(tables.user)
      .where(eq(tables.user.id, userId))
    return record
  }
  async function identityForCode(setupCode: string) {
    const [challenge] = await testDatabase()
      .select({ userId: tables.accountSetup.userId })
      .from(tables.accountSetup)
      .where(eq(tables.accountSetup.codeHash, service.hashSetupCode(setupCode)))
    return identityById(challenge.userId)
  }
  const hashPassword = (value: string) =>
    auth.$context.then((context) => context.password.hash(value))

  it('bootstraps exactly one privileged owner and keeps public signup closed', async () => {
    const opening = await testDatabase()
      .select({
        source: tables.employeeScheduleVersion.source,
        actorId: tables.employeeScheduleVersion.actorId,
        days: tables.employeeScheduleVersion.days,
      })
      .from(tables.employeeScheduleVersion)
      .innerJoin(
        tables.employee,
        eq(tables.employee.id, tables.employeeScheduleVersion.employeeId),
      )
      .where(eq(tables.employee.userId, owner.id))
    expect(opening).toEqual([
      { source: 'provisioned', actorId: null, days: null },
    ])
    await expect(
      service.bootstrapOwner({
        code: 'second-owner',
        name: 'მეორე მფლობელი',
        contactEmail: '',
      }),
    ).rejects.toThrow()
    await expect(
      auth.api.signUpEmail({
        body: { name: 'უარყოფილი', email: 'blocked@example.com', password },
      }),
    ).rejects.toThrow()
    expect(
      (await testDatabase().select({ count: count() }).from(tables.user))[0]
        .count,
    ).toBe(1)
  })

  it('initializes a new employee from company policy or an explicit override', async () => {
    await testDatabase()
      .update(tables.dayOffSetting)
      .set({ defaultDays: 7, defaultVacationDays: 30 })
    try {
      for (const [label, override, expected] of [
        ['allowance-default', null, 7],
        ['allowance-custom', 2, 2],
      ] as const) {
        const issued = await service.provisionEmployee(owner, {
          name: label,
          contactEmail: '',
          roles: ['employee'],
          dayOffAllowance: override,
        })
        const record = await identityForCode(issued.code)
        const [balance] = await testDatabase()
          .select()
          .from(tables.dayOffBalance)
          .where(eq(tables.dayOffBalance.userId, record.id))
        expect(balance).toMatchObject({
          annualDays: expected,
          remainingDays: expected,
          vacationAnnualDays: 30,
          vacationRemainingDays: 30,
          revision: 0,
        })
      }
    } finally {
      await testDatabase()
        .update(tables.dayOffSetting)
        .set({ defaultDays: 4, defaultVacationDays: 24 })
    }
  })
  it.each([
    'supervisor',
    'sales_manager',
    'production_specialist',
    'hr_manager',
    'accountant',
    'admin',
  ] as const)(
    'provisions and stores the %s role through the employee workflow for owner',
    async (role) => {
      const issued = await service.provisionEmployee(owner, {
        name: `ტესტის ${role}`,
        contactEmail: '',
        roles: [role],
      })
      const record = await identityForCode(issued.code)
      expect(record.roles).toBe(role)
      expect(record.accessState).toBe('invited')
      expect(record.username).toBeNull()
    },
  )
  it('lets HR manage employees and non-admin roles while protecting admin/owner grants, privileged targets, and revoked access', async () => {
    const issued = await service.provisionEmployee(owner, {
      name: 'HR',
      contactEmail: '',
      roles: ['hr_manager'],
    })
    await service.completeEmployeeActivation(
      { code: issued.code, username: 'hr-operator', newPassword: password },
      hashPassword,
    )
    const identityRecord = await identity('hr-operator')
    const hr: Actor = { ...owner, id: identityRecord.id, roles: ['hr_manager'] }
    const input = {
      name: 'ახალი თანამშრომელი',
      contactEmail: '',
      roles: ['employee' as const],
    }
    const startDate = '2026-11-20'
    const activation = await service.provisionEmployee(hr, {
      ...input,
      employmentStartDate: startDate,
    })
    const worker = await identityForCode(activation.code)
    const { readEmployeeEmployment } =
      await import('#/features/employees/server/employment.service.server')
    expect(
      await readEmployeeEmployment(hr, { userId: worker.id }),
    ).toMatchObject({
      confirmed: true,
      revision: 1,
      periods: [{ startDate, endDate: null }],
      history: [{ action: 'created', after: { startDate, endDate: null } }],
    })
    expect(
      (await service.listEmployeeAccounts(hr, { page: 1 })).records.some(
        (record) => record.userId === worker.id,
      ),
    ).toBe(true)
    expect(
      (await service.readEmployeeAccount(hr, { userId: worker.id }))?.record
        .code,
    ).toBeNull()
    await service.editEmployeeDetails(hr, {
      userId: worker.id,
      name: 'განახლებული თანამშრომელი',
      contactEmail: '',
      jobTitle: 'სპეციალისტი',
      phone: '',
    })
    await service.completeEmployeeActivation(
      {
        code: activation.code,
        username: 'hr-created-worker',
        newPassword: password,
      },
      hashPassword,
    )
    expect(
      (await service.readEmployeeAccount(hr, { userId: worker.id }))?.record
        .code,
    ).toBe('hr-created-worker')
    await service.editEmployeeDetails(hr, {
      userId: worker.id,
      code: 'hr-renamed-worker',
      name: 'განახლებული თანამშრომელი',
      contactEmail: '',
      jobTitle: 'სპეციალისტი',
      phone: '',
    })
    expect((await identityById(worker.id)).username).toBe('hr-renamed-worker')
    expect(
      await service.manageEmployeeAccount(hr, {
        userId: worker.id,
        action: 'issue_reset',
        reason: 'თანამშრომლის პაროლის აღდგენა.',
      }),
    ).toMatchObject({ purpose: 'reset' })
    await service.manageEmployeeAccount(hr, {
      userId: worker.id,
      action: 'suspend',
      reason: 'თანამშრომლის წვდომის შეჩერება.',
    })
    expect((await service.getLoginAccess(worker.id)).allowed).toBe(false)
    await service.manageEmployeeAccount(hr, {
      userId: worker.id,
      action: 'restore',
      reason: 'თანამშრომლის წვდომის აღდგენა.',
    })
    expect((await service.getLoginAccess(worker.id)).allowed).toBe(true)
    for (const userId of [hr.id, owner.id]) {
      await expect(
        service.manageEmployeeAccount(hr, {
          userId,
          action: 'suspend',
          reason: 'აკრძალული მოქმედების შემოწმება.',
        }),
      ).rejects.toThrow()
    }
    await expect(
      service.editEmployeeDetails(hr, {
        userId: owner.id,
        name: 'დაუშვებელი ცვლილება',
        contactEmail: '',
      }),
    ).rejects.toThrow()
    const hrSupervisor = await service.provisionEmployee(hr, {
      ...input,
      roles: ['supervisor'],
    })
    expect((await identityForCode(hrSupervisor.code)).roles).toBe('supervisor')
    await expect(
      service.provisionEmployee(hr, {
        ...input,
        roles: ['hr_manager', 'accountant'],
      }),
    ).rejects.toThrow()
    await expect(
      service.editEmployeeDetails(hr, {
        userId: worker.id,
        name: 'აკრძალული მინიჭება',
        contactEmail: '',
        roles: ['hr_manager', 'accountant'],
        expectedRoles: 'employee',
      }),
    ).rejects.toThrow()
    const accountantCode = await service.provisionEmployee(owner, {
      ...input,
      roles: ['hr_manager', 'accountant', 'hr_manager'],
    })
    const accountantRecord = await identityForCode(accountantCode.code)
    expect(accountantRecord.roles).toBe('accountant,hr_manager')
    const editRoles = {
      ...input,
      userId: accountantRecord.id,
      expectedRoles: accountantRecord.roles,
      roles: ['accountant', 'supervisor'] as Array<'accountant' | 'supervisor'>,
    }
    await service.editEmployeeDetails(owner, editRoles)
    expect((await identityById(accountantRecord.id)).roles).toBe(
      'accountant,supervisor',
    )
    await expect(service.editEmployeeDetails(owner, editRoles)).rejects.toThrow(
      'როლები შეიცვალა',
    )
    await expect(
      service.manageEmployeeAccount(hr, {
        userId: accountantRecord.id,
        action: 'issue_reset',
        reason: 'აკრძალული წვდომის შემოწმება',
      }),
    ).rejects.toThrow()
    await expect(
      service.provisionEmployee(hr, {
        ...input,
        roles: ['admin'],
      }),
    ).rejects.toThrow()
    // Mutation authority comes from the locked current account, not the caller's stale role projection.
    await testDatabase()
      .update(tables.user)
      .set({ roles: 'employee' })
      .where(eq(tables.user.id, hr.id))
    await expect(service.provisionEmployee(hr, input)).rejects.toThrow()
  })
  it('creates an email-optional account, stores only a code hash, and blocks invited login', async () => {
    const issued = await provision('worker-one')
    const record = await identityForCode(issued.code)
    expect(record.accessState).toBe('invited')
    expect(record.username).toBeNull()
    const [person] = await testDatabase()
      .select()
      .from(tables.employee)
      .where(eq(tables.employee.userId, record.id))
    expect(person.contactEmail).toBeNull()
    expect(person.username).toBeNull()
    const [creationAudit] = await testDatabase()
      .select({
        actorId: tables.accessAudit.actorId,
        reason: tables.accessAudit.reason,
      })
      .from(tables.accessAudit)
      .where(
        and(
          eq(tables.accessAudit.targetId, record.id),
          eq(tables.accessAudit.action, 'account.provisioned.employee'),
        ),
      )
    expect(creationAudit).toEqual({
      actorId: owner.id,
      reason: 'თანამშრომლის ანგარიშის შექმნა.',
    })
    const [challenge] = await testDatabase()
      .select()
      .from(tables.accountSetup)
      .where(eq(tables.accountSetup.userId, record.id))
    expect(challenge.codeHash).not.toBe(issued.code)
    expect(challenge.codeHash).toBe(service.hashSetupCode(issued.code))
    expect((await service.getLoginAccess(record.id)).allowed).toBe(false)
    await expect(
      service.completeEmployeeActivation(
        { code: issued.code, username: 'owner-test', newPassword: password },
        hashPassword,
      ),
    ).rejects.toThrow(/უკვე დაკავებულია/)
    // Duplicate username leaves the one-time code intact so the user can retry with an available username.
    await service.completeEmployeeActivation(
      { code: issued.code, username: 'worker-one', newPassword: password },
      hashPassword,
    )
    expect((await identity('worker-one')).accessState).toBe('active')
  })

  it('edits employee details and username without a reason and audits the trusted actor and time', async () => {
    const editWorkerCode = await service.provisionEmployee(owner, {
      name: 'რედაქტირების თანამშრომელი',
      contactEmail: 'edit-worker@example.com',
      roles: ['employee'],
    })
    await service.completeEmployeeActivation(
      {
        code: editWorkerCode.code,
        username: 'edit-worker',
        newPassword: password,
      },
      hashPassword,
    )
    const editPlainCode = await provision('edit-plain')
    await service.completeEmployeeActivation(
      {
        code: editPlainCode.code,
        username: 'edit-plain',
        newPassword: password,
      },
      hashPassword,
    )
    const record = await identity('edit-worker')
    const edit = (userId: string, overrides: Record<string, string> = {}) =>
      service.editEmployeeDetails(owner, {
        userId,
        code: 'edit-worker-updated',
        name: 'ახალი სახელი',
        contactEmail: 'moved@example.com',
        jobTitle: 'მენეჯერი',
        phone: '+995 555 00 00 00',
        ...overrides,
      })
    await edit(record.id)
    const updated = await identity('edit-worker-updated')
    expect(updated).toMatchObject({
      name: 'ახალი სახელი',
      email: 'moved@example.com',
      username: 'edit-worker-updated',
    })
    const [person] = await testDatabase()
      .select()
      .from(tables.employee)
      .where(eq(tables.employee.userId, record.id))
    expect(person).toMatchObject({
      username: 'edit-worker-updated',
      fullName: 'ახალი სახელი',
      contactEmail: 'moved@example.com',
      jobTitle: 'მენეჯერი',
      phone: '+995 555 00 00 00',
    })
    const [audit] = await testDatabase()
      .select({
        reason: tables.accessAudit.reason,
        actorId: tables.accessAudit.actorId,
        createdAt: tables.accessAudit.createdAt,
      })
      .from(tables.accessAudit)
      .where(
        and(
          eq(tables.accessAudit.targetId, record.id),
          eq(tables.accessAudit.action, 'account.details_updated'),
        ),
      )
    expect(audit.reason).toBe('თანამშრომლის მონაცემების განახლება.')
    expect(audit.actorId).toBe(owner.id)
    expect(audit.createdAt).toBeInstanceOf(Date)
    await expect(edit(record.id, { code: '' })).rejects.toThrow(
      /წაშლა შეუძლებელია/,
    )
    await expect(edit(record.id, { code: 'edit-plain' })).rejects.toThrow(
      /უკვე დაკავებულია/,
    )
    await expect(
      edit(record.id, { code: 'edit-worker-updated', contactEmail: '' }),
    ).rejects.toThrow(/წაშლა შეუძლებელია/)
    const plain = await identity('edit-plain')
    await expect(
      edit(plain.id, { code: 'edit-plain', contactEmail: 'moved@example.com' }),
    ).rejects.toThrow(/უკვე უკავია/)
    await edit(plain.id, {
      code: 'edit-plain',
      contactEmail: 'plain@example.com',
    })
    expect((await identity('edit-plain')).email).toMatch(
      /@accounts\.teamwork\.invalid$/,
    )
  })

  it('lets an active employee change only their own phone number', async () => {
    const issued = await provision('phone-worker')
    await service.completeEmployeeActivation(
      { code: issued.code, username: 'phone-worker', newPassword: password },
      hashPassword,
    )
    const record = await identity('phone-worker')
    const worker: Actor = {
      id: record.id,
      name: record.name,
      email: null,
      emailVerified: false,
      roles: ['employee'],
    }
    await service.updateOwnPhone(worker, { phone: ' +995 599 11 22 33 ' })
    expect(await service.readOwnProfile(worker)).toMatchObject({
      code: 'phone-worker',
      phone: '+995 599 11 22 33',
    })
    await service.updateOwnPhone(worker, { phone: '' })
    expect((await service.readOwnProfile(worker))?.phone).toBeNull()
    await expect(
      service.updateOwnPhone(worker, { phone: 'not a phone' }),
    ).rejects.toThrow()
  })

  it('rejects duplicate usernames under concurrent activation without orphan accounts', async () => {
    const first = await provision('worker-race-1')
    const second = await provision('worker-race-2')
    const results = await Promise.allSettled([
      service.completeEmployeeActivation(
        { code: first.code, username: 'worker-race', newPassword: password },
        hashPassword,
      ),
      service.completeEmployeeActivation(
        { code: second.code, username: 'worker-race', newPassword: password },
        hashPassword,
      ),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const record = await identity('worker-race')
    await expect(
      testDatabase().insert(tables.employee).values({
        userId: record.id,
        username: 'other-code',
        fullName: 'დუბლიკატი',
      }),
    ).rejects.toThrow()
  })

  it('stores optional profile details and signs in using either email or username after activation', async () => {
    const issued = await service.provisionEmployee(owner, {
      name: 'ელფოსტის თანამშრომელი',
      contactEmail: '  Worker@Example.com  ',
      roles: ['employee'],
      jobTitle: 'დიზაინერი',
      phone: '+995 555 12 34 56',
    })
    const record = await identityForCode(issued.code)
    expect(record.email).toBe('worker@example.com')
    await expect(
      auth.api.signInEmail({ body: { email: 'worker@example.com', password } }),
    ).rejects.toThrow()
    await service.completeEmployeeActivation(
      { code: issued.code, username: 'email-worker', newPassword: password },
      hashPassword,
    )
    const byEmail = await auth.api.signInEmail({
      body: { email: 'worker@example.com', password },
    })
    const byUsername = await auth.api.signInUsername({
      body: { username: 'email-worker', password },
    })
    expect(byEmail.user.id).toBe(record.id)
    expect(byUsername.user.id).toBe(record.id)
    const person = (
      await testDatabase()
        .select()
        .from(tables.employee)
        .where(eq(tables.employee.userId, record.id))
    )[0]
    expect(person).toMatchObject({
      jobTitle: 'დიზაინერი',
      phone: '+995 555 12 34 56',
      contactEmail: 'worker@example.com',
    })
    const before = (
      await testDatabase().select({ count: count() }).from(tables.user)
    )[0].count
    await expect(
      service.provisionEmployee(owner, {
        name: 'დუბლიკატი',
        contactEmail: 'WORKER@example.com',
        roles: ['employee'],
      }),
    ).rejects.toThrow()
    expect(
      (await testDatabase().select({ count: count() }).from(tables.user))[0]
        .count,
    ).toBe(before)
  })

  it('creates an employee and its initial schedule assignment atomically', async () => {
    await testDatabase().insert(tables.companySchedule).values({
      effectiveFrom: '2026-01-01',
      timezone: 'Asia/Tbilisi',
      lateGraceMinutes: 0,
      earlyDepartureGraceMinutes: 0,
    })
    await testDatabase()
      .insert(tables.companyScheduleDay)
      .values(
        Array.from({ length: 7 }, (_, index) => ({
          effectiveFrom: '2026-01-01',
          weekday: index + 1,
          startTime: index < 6 ? '10:00' : null,
          endTime: index < 6 ? '19:00' : null,
        })),
      )
    const days = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      hours: index < 5 ? { start: '09:00', end: '18:00' } : null,
    }))
    const officeIssued = await service.provisionEmployee(owner, {
      name: 'ოფისის თანამშრომელი',
      contactEmail: '',
      roles: ['employee'],
      workingWeek: days,
    })
    await service.completeEmployeeActivation(
      {
        code: officeIssued.code,
        username: 'office-week',
        newPassword: password,
      },
      hashPassword,
    )
    const record = await identity('office-week')
    const person = (
      await testDatabase()
        .select()
        .from(tables.employee)
        .where(eq(tables.employee.userId, record.id))
    )[0]
    const assignment = (
      await testDatabase()
        .select()
        .from(tables.employeeWorkSchedule)
        .where(eq(tables.employeeWorkSchedule.employeeId, person.id))
    )[0]
    expect(assignment).toMatchObject({ assignedBy: owner.id, days })
    const before = (
      await testDatabase().select({ count: count() }).from(tables.user)
    )[0].count
    await expect(
      service.provisionEmployee(owner, {
        name: 'არასწორი კვირა',
        contactEmail: '',
        roles: ['employee'],
        workingWeek: days.map((day) => ({ ...day, weekday: 1 })),
      }),
    ).rejects.toThrow()
    expect(
      (await testDatabase().select({ count: count() }).from(tables.user))[0]
        .count,
    ).toBe(before)
  })

  it('replaces or clears an employee working week and audits real changes only', async () => {
    const record = await identity('office-week')
    const person = (
      await testDatabase()
        .select()
        .from(tables.employee)
        .where(eq(tables.employee.userId, record.id))
    )[0]
    const saturdayShift = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      hours: index === 5 ? { start: '10:00', end: '14:00' } : null,
    }))
    const edit = (workingWeek?: typeof saturdayShift | null) =>
      service.editEmployeeDetails(owner, {
        userId: record.id,
        name: person.fullName,
        contactEmail: '',
        jobTitle: '',
        phone: '',
        workingWeek,
      })
    const scheduleAudits = async () =>
      (
        await testDatabase()
          .select({ id: tables.accessAudit.id })
          .from(tables.accessAudit)
          .where(
            and(
              eq(tables.accessAudit.targetId, record.id),
              eq(tables.accessAudit.action, 'account.schedule_updated'),
            ),
          )
      ).length
    const storedWeek = async () =>
      (
        await testDatabase()
          .select({ days: tables.employeeWorkSchedule.days })
          .from(tables.employeeWorkSchedule)
          .where(eq(tables.employeeWorkSchedule.employeeId, person.id))
      ).at(0)?.days
    await edit(saturdayShift)
    expect(await storedWeek()).toEqual(saturdayShift)
    expect(await scheduleAudits()).toBe(1)
    await edit(saturdayShift)
    expect(await scheduleAudits()).toBe(1)
    await edit(undefined)
    expect(await storedWeek()).toEqual(saturdayShift)
    const custom = await service.readEmployeeAccount(owner, {
      userId: record.id,
    })
    expect(custom?.record.workingWeek).toEqual(saturdayShift)
    expect(custom?.companyWeek).toBeNull()
    await edit(null)
    expect(await storedWeek()).toBeUndefined()
    expect(await scheduleAudits()).toBe(2)
    const inherited = await service.readEmployeeAccount(owner, {
      userId: record.id,
    })
    expect(inherited?.record.workingWeek).toBeNull()
    expect(inherited?.companyWeek).toHaveLength(7)
    expect(
      await service.readEmployeeAccount(owner, { userId: 'missing-user' }),
    ).toBeNull()
    await expect(
      edit(saturdayShift.map((day) => ({ ...day, hours: null }))),
    ).rejects.toThrow()
  })

  it.each(['owner', 'admin', 'hr_manager', 'employee'] as const)(
    'enforces the self-edit policy for %s',
    async (role) => {
      let target = owner
      if (role !== 'owner') {
        const name = `პროფილის ტესტი ${role}`
        const issued = await service.provisionEmployee(owner, {
          name,
          contactEmail: '',
          roles: [role],
        })
        const record = await identityForCode(issued.code)
        await service.completeEmployeeActivation(
          {
            code: issued.code,
            username: `profile-${role}`,
            newPassword: password,
          },
          hashPassword,
        )
        target = { ...owner, id: record.id, name, roles: [role] }
      }

      const details = {
        userId: target.id,
        name: target.name,
        contactEmail: '',
        jobTitle: 'განახლებული თანამდებობა',
        phone: '',
      }
      const workingWeek = Array.from({ length: 7 }, (_, index) => ({
        weekday: index + 1,
        hours: index === 5 ? { start: '10:00', end: '14:00' } : null,
      }))
      const remoteWeekdays = [6]
      if (role === 'employee') {
        const staleActor: Actor = { ...target, roles: ['admin'] }
        await expect(
          service.editEmployeeDetails(staleActor, {
            ...details,
            remoteWeekdays,
          }),
        ).rejects.toMatchObject({
          code: 'FORBIDDEN',
        })
        return
      }

      await expect(
        service.editEmployeeDetails(target, {
          ...details,
          roles: ['employee'],
          expectedRoles: role,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      const account = await service.readEmployeeAccount(target, {
        userId: target.id,
      })
      let date = account!.workLocations.today
      while (isoWeekday(date) !== 6) date = followingDate(date)
      const workLocationOverride = { date, remote: false }
      const schedule = { workingWeek, remoteWeekdays, workLocationOverride }
      await service.editEmployeeDetails(target, { ...details, ...schedule })
      expect(
        await service.readEmployeeAccount(target, { userId: target.id }),
      ).toMatchObject({
        record: { jobTitle: details.jobTitle, roles: role, workingWeek },
        workLocations: { remoteWeekdays, overrides: [workLocationOverride] },
      })

      await service.editEmployeeDetails(target, {
        ...details,
        workingWeek: null,
      })
      expect(
        (await service.readEmployeeAccount(target, { userId: target.id }))
          ?.record.workingWeek,
      ).toBeNull()

      if (role === 'admin') {
        await testDatabase()
          .update(tables.user)
          .set({
            permissionOverrides: { allow: [], deny: ['attendance.configure'] },
          })
          .where(eq(tables.user.id, target.id))
        await expect(
          service.editEmployeeDetails(target, {
            ...details,
            remoteWeekdays: [],
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
        await expect(
          service.editEmployeeDetails(target, {
            ...details,
            workLocationOverride: { date, remote: true },
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
        await service.editEmployeeDetails(target, details)
      }
    },
  )

  it('provisions remote weekdays without copying the company hours and audits changes by HR', async () => {
    const hrIdentity = await identity('profile-hr_manager')
    const hr: Actor = { ...owner, id: hrIdentity.id, roles: ['hr_manager'] }
    const name = 'დისტანციური თანამშრომელი'
    const issued = await service.provisionEmployee(hr, {
      name,
      contactEmail: '',
      remoteWeekdays: [1],
    })
    const { id: userId } = await identityForCode(issued.code)
    const initial = await service.readEmployeeAccount(hr, { userId })
    expect(initial).toMatchObject({
      record: { workingWeek: null },
      workLocations: { remoteWeekdays: [1], overrides: [] },
    })
    const today = initial!.workLocations.today
    const date = isoWeekday(today) === 7 ? followingDate(today) : today
    const details = { userId, name, contactEmail: '' }
    await service.editEmployeeDetails(hr, {
      ...details,
      remoteWeekdays: [5],
      workLocationOverride: { date, remote: true },
    })
    expect(
      (await service.readEmployeeAccount(hr, { userId }))?.workLocations,
    ).toMatchObject({
      remoteWeekdays: [5],
      overrides: [{ date, remote: true }],
    })
    await service.editEmployeeDetails(hr, {
      ...details,
      workLocationOverride: { date, remote: false },
    })
    expect(
      (await service.readEmployeeAccount(hr, { userId }))?.workLocations
        .overrides,
    ).toEqual([{ date, remote: false }])
    await service.editEmployeeDetails(hr, {
      ...details,
      workLocationOverride: { date, remote: null },
    })
    expect(
      (await service.readEmployeeAccount(hr, { userId }))?.workLocations
        .overrides,
    ).toEqual([])
    const audits = await testDatabase()
      .select()
      .from(tables.accessAudit)
      .where(
        and(
          eq(tables.accessAudit.targetId, userId),
          eq(tables.accessAudit.action, 'account.dated_work_location_updated'),
        ),
      )
    expect(audits).toHaveLength(3)
    expect(audits.every((entry) => entry.actorId === hr.id)).toBe(true)
  })

  it('allows only one concurrent consumption and authenticates through Better Auth username login', async () => {
    const issued = await provision('worker-active')
    const outcomes = await Promise.allSettled(
      [1, 2].map(() =>
        service.completeEmployeeActivation(
          {
            code: issued.code,
            username: 'worker-active',
            newPassword: password,
          },
          hashPassword,
        ),
      ),
    )
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const login = await auth.api.signInUsername({
      body: { username: 'worker-active', password },
    })
    expect(login.user.id).toBe((await identity('worker-active')).id)
    expect((await service.getLoginAccess(login.user.id)).allowed).toBe(true)
  })

  it('invalidates previous reset codes, rejects activation codes for reset, and revokes sessions after reset', async () => {
    const record = await identity('worker-active')
    const first = await service.manageEmployeeAccount(owner, {
      userId: record.id,
      action: 'issue_reset',
      reason: '',
    })
    const second = await service.manageEmployeeAccount(owner, {
      userId: record.id,
      action: 'issue_reset',
      reason: 'კოდის ხელახალი გაცემა.',
    })
    if (!first || !second) throw new Error('Expected reset codes')
    const audit = await testDatabase()
      .select()
      .from(tables.accessAudit)
      .where(
        and(
          eq(tables.accessAudit.targetId, record.id),
          eq(tables.accessAudit.action, 'account.issue_reset'),
          eq(tables.accessAudit.reason, ''),
        ),
      )
    expect(audit.some((entry) => entry.actorId === owner.id)).toBe(true)
    await expect(
      service.completeEmployeeReset(
        { code: first.code, newPassword: password },
        hashPassword,
      ),
    ).rejects.toThrow()
    await expect(
      service.completeEmployeeActivation(
        { code: second.code, username: 'worker-active', newPassword: password },
        hashPassword,
      ),
    ).rejects.toThrow()
    await service.completeEmployeeReset(
      { code: second.code, newPassword: `${password}new` },
      hashPassword,
    )
    expect(
      (
        await testDatabase()
          .select({ count: count() })
          .from(tables.session)
          .where(eq(tables.session.userId, record.id))
      )[0].count,
    ).toBe(0)
    await expect(
      auth.api.signInUsername({
        body: { username: 'worker-active', password },
      }),
    ).rejects.toThrow()
    const login = await auth.api.signInUsername({
      body: { username: 'worker-active', password: `${password}new` },
    })
    expect(login.user.id).toBe(record.id)
  })

  it('denies stale or forged permissions and prevents administrators targeting themselves', async () => {
    const employee = await identity('worker-active')
    const forged = { ...owner, id: employee.id }
    await expect(
      service.provisionEmployee(forged, {
        name: 'ტესტი',
        contactEmail: '',
        roles: ['employee'],
      }),
    ).rejects.toThrow()
    await expect(
      service.manageEmployeeAccount(owner, {
        userId: owner.id,
        action: 'suspend',
        reason: 'საკუთარი ანგარიშის შეჩერება.',
      }),
    ).rejects.toThrow()
  })

  it('suspends immediately, revokes sessions and codes, then restores the same account', async () => {
    const record = await identity('worker-active')
    const issued = await service.manageEmployeeAccount(owner, {
      userId: record.id,
      action: 'issue_reset',
      reason: 'აღდგენის საცდელი გაცემა.',
    })
    if (!issued) throw new Error('Expected reset code')
    await service.manageEmployeeAccount(owner, {
      userId: record.id,
      action: 'suspend',
      reason: 'სამუშაოზე წვდომის შეჩერება.',
    })
    expect((await service.getLoginAccess(record.id)).allowed).toBe(false)
    expect(
      (
        await testDatabase()
          .select({ count: count() })
          .from(tables.session)
          .where(eq(tables.session.userId, record.id))
      )[0].count,
    ).toBe(0)
    await expect(
      auth.api.signInUsername({
        body: { username: 'worker-active', password: `${password}new` },
      }),
    ).rejects.toThrow()
    await expect(
      service.completeEmployeeReset(
        { code: issued.code, newPassword: password },
        hashPassword,
      ),
    ).rejects.toThrow()
    await service.manageEmployeeAccount(owner, {
      userId: record.id,
      action: 'restore',
      reason: 'თანამშრომლის წვდომის აღდგენა.',
    })
    expect((await identity('worker-active')).id).toBe(record.id)
    expect((await service.getLoginAccess(record.id)).allowed).toBe(true)
  })

  it('rejects expired activation and records lifecycle changes without secrets', async () => {
    const issued = await provision('worker-expired')
    const record = await identityForCode(issued.code)
    await testDatabase()
      .update(tables.accountSetup)
      .set({ expiresAt: new Date(0) })
      .where(eq(tables.accountSetup.userId, record.id))
    await expect(
      service.completeEmployeeActivation(
        {
          code: issued.code,
          username: 'worker-expired',
          newPassword: password,
        },
        hashPassword,
      ),
    ).rejects.toThrow()
    const audits = await testDatabase()
      .select({
        action: tables.accessAudit.action,
        reason: tables.accessAudit.reason,
      })
      .from(tables.accessAudit)
      .where(and(eq(tables.accessAudit.targetId, record.id)))
    expect(audits).toHaveLength(1)
    expect(JSON.stringify(audits)).not.toContain(issued.code)
    expect(JSON.stringify(audits)).not.toContain(password)
  })

  it('validates native activation requests, origin protection, and request throttling', async () => {
    const issued = await provision('worker-http')
    const base = process.env.BETTER_AUTH_URL ?? 'http://localhost:3005'
    const request = (code: string, origin: string, username = 'worker-http') =>
      new Request(`${base}/api/auth/employee-activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          'x-forwarded-for': '127.0.0.81',
        },
        body: JSON.stringify({ code, username, newPassword: password }),
      })
    const forbidden = await auth.handler(
      request(issued.code, 'https://untrusted.example'),
    )
    expect(forbidden.status).toBe(403)
    const duplicate = await auth.handler(
      request(issued.code, base, 'owner-test'),
    )
    expect(duplicate.status).toBe(409)
    const activated = await auth.handler(request(issued.code, base))
    expect(activated.status).toBe(200)
    const replay = await auth.handler(request(issued.code, base))
    expect(replay.status).toBe(400)
    const attempts = []
    for (let index = 0; index < 6; index++)
      attempts.push((await auth.handler(request('A'.repeat(12), base))).status)
    expect(attempts).toContain(429)
  })
  it('lets a database operator recover the existing owner without provisioning another identity', async () => {
    const issued = await service.recoverOwnerCode({
      code: 'owner-test',
      reason: 'მფლობელის პირადობა გადამოწმებულია.',
    })
    expect(issued.purpose).toBe('reset')
    await service.completeEmployeeReset(
      { code: issued.code, newPassword: password },
      hashPassword,
    )
    expect((await identity('owner-test')).id).toBe(owner.id)
    await expect(
      service.recoverOwnerCode({
        code: 'worker-one',
        reason: 'არამფლობელის აღდგენის მცდელობა.',
      }),
    ).rejects.toThrow()
  })
  it('keeps employment termination separate from account suspension and prevents restoring inactive employment', async () => {
    const record = await identity('worker-active')
    await testDatabase()
      .update(tables.employee)
      .set({ status: 'inactive' })
      .where(eq(tables.employee.userId, record.id))
    expect((await service.getLoginAccess(record.id)).allowed).toBe(false)
    await expect(
      auth.api.signInUsername({
        body: { username: 'worker-active', password: `${password}new` },
      }),
    ).rejects.toThrow()
    await service.manageEmployeeAccount(owner, {
      userId: record.id,
      action: 'suspend',
      reason: 'არააქტიური თანამშრომლის ანგარიშის შეჩერება.',
    })
    await expect(
      service.manageEmployeeAccount(owner, {
        userId: record.id,
        action: 'restore',
        reason: 'დასაქმების შემოწმების გარეშე აღდგენა.',
      }),
    ).rejects.toThrow()
    expect((await identity('worker-active')).accessState).toBe('suspended')
  })
  it('administers every non-owner account, including identities without employee records, and protects self and owner access', async () => {
    const issued = await service.provisionEmployee(owner, {
      name: 'წვდომის ადმინისტრატორი',
      contactEmail: '',
      roles: ['admin'],
    })
    await service.completeEmployeeActivation(
      { code: issued.code, username: 'access-admin', newPassword: password },
      hashPassword,
    )
    const adminRecord = await identity('access-admin')
    const adminActor: Actor = { ...owner, id: adminRecord.id, roles: ['admin'] }
    const createdByAdmin = await service.provisionEmployee(adminActor, {
      name: 'ადმინის შექმნილი ადმინი',
      contactEmail: '',
      roles: ['admin'],
    })
    expect((await identityForCode(createdByAdmin.code)).roles).toBe('admin')
    await testDatabase().insert(tables.user).values({
      id: 'orphan-admin',
      name: 'ცალკე ადმინისტრატორი',
      email: 'orphan@access.invalid',
      username: 'orphan-admin',
      roles: 'admin',
      accessState: 'active',
      activatedAt: new Date(),
    })
    const directory = await administration.listAdminAccounts(adminActor, {
      q: 'orphan-admin',
    })
    expect(directory.items.map((item) => item.userId)).toEqual(['orphan-admin'])
    expect(directory.items[0].employmentStatus).toBeNull()
    const authorizationChange = {
      userId: 'orphan-admin',
      roles: ['admin', 'supervisor'] as Array<'admin' | 'supervisor'>,
      permissionOverrides: { allow: [], deny: [] },
      expectedRoles: 'admin',
      expectedOverrides: { allow: [], deny: [] },
      reason: 'ადმინისტრატორის როლების განახლება.',
    }
    await administration.updateAccountAuthorization(
      adminActor,
      authorizationChange,
    )
    expect(
      (
        await administration.listAdminAccounts(adminActor, {
          q: 'orphan-admin',
        })
      ).items[0].roles,
    ).toBe('admin,supervisor')
    await expect(
      administration.updateAccountAuthorization(adminActor, {
        ...authorizationChange,
        roles: ['owner'],
        expectedRoles: 'admin,supervisor',
      }),
    ).rejects.toThrow()
    await expect(
      administration.updateAccountAuthorization(adminActor, {
        ...authorizationChange,
        userId: owner.id,
        roles: ['employee'],
        expectedRoles: 'owner',
      }),
    ).rejects.toThrow()
    await administration.administerAccount(adminActor, {
      userId: 'orphan-admin',
      action: 'suspend',
      reason: 'წვდომის დროებით შეჩერება.',
    })
    expect((await service.getLoginAccess('orphan-admin')).allowed).toBe(false)
    await administration.administerAccount(adminActor, {
      userId: 'orphan-admin',
      action: 'restore',
      reason: 'წვდომის აღდგენა შემოწმების შემდეგ.',
    })
    expect((await service.getLoginAccess('orphan-admin')).allowed).toBe(true)
    for (const userId of [adminActor.id, owner.id])
      await expect(
        administration.administerAccount(adminActor, {
          userId,
          action: 'suspend',
          reason: 'დაცული ანგარიშის შემოწმება.',
        }),
      ).rejects.toThrow()
    await expect(
      administration.listAdminAccounts(
        { ...adminActor, roles: ['hr_manager'] },
        {},
      ),
    ).rejects.toThrow()
    await expect(
      administration.administerAccount(
        { ...adminActor, id: owner.id, roles: ['employee'] },
        {
          userId: 'orphan-admin',
          action: 'suspend',
          reason: 'მიმდინარე უფლებების შემოწმება.',
        },
      ),
    ).resolves.toBeUndefined()
    // The stored owner's grants, rather than a caller-provided role projection, authorize this last action.
    const audits = await testDatabase()
      .select()
      .from(tables.accessAudit)
      .where(
        and(
          eq(tables.accessAudit.targetId, 'orphan-admin'),
          eq(tables.accessAudit.actorId, adminActor.id),
        ),
      )
    expect(audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['account.suspend', 'account.restore']),
    )
    await testDatabase()
      .update(tables.user)
      .set({ roles: 'employee' })
      .where(eq(tables.user.id, adminActor.id))
    await expect(
      administration.administerAccount(adminActor, {
        userId: 'orphan-admin',
        action: 'restore',
        reason: 'გაუქმებული უფლების შემოწმება.',
      }),
    ).rejects.toThrow()
  })
  it('persists permission exceptions, revokes sessions, rejects stale edits, and rechecks exceptions in domain services', async () => {
    const issued = await service.provisionEmployee(owner, {
      name: 'უფლებების ტესტი',
      contactEmail: '',
      roles: ['employee'],
    })
    await service.completeEmployeeActivation(
      {
        code: issued.code,
        username: 'override-worker',
        newPassword: password,
      },
      hashPassword,
    )
    const worker = await identity('override-worker')
    const actor: Actor = { ...owner, id: worker.id, roles: ['employee'] }
    await auth.api.signInUsername({
      body: { username: 'override-worker', password },
    })
    expect(
      (
        await testDatabase()
          .select()
          .from(tables.session)
          .where(eq(tables.session.userId, worker.id))
      ).length,
    ).toBeGreaterThan(0)
    const grant = {
      userId: worker.id,
      roles: ['employee'] as Array<'employee'>,
      permissionOverrides: {
        allow: ['manage.access', 'attendance.read.all'] as Array<
          'manage.access' | 'attendance.read.all'
        >,
        deny: [],
      },
      expectedRoles: worker.roles,
      expectedOverrides: { allow: [], deny: [] },
      reason: 'მხოლოდ დასწრების ნახვის უფლება.',
    }
    await administration.updateAccountAuthorization(owner, grant)
    expect(
      await testDatabase()
        .select()
        .from(tables.session)
        .where(eq(tables.session.userId, worker.id)),
    ).toHaveLength(0)
    const attendance =
      await import('#/features/attendance/server/company-attendance.service.server')
    await expect(
      attendance.listCompanyAttendanceUsers(actor, {}),
    ).rejects.toThrow()
    await expect(
      administration.updateAccountAuthorization(owner, {
        ...grant,
        permissionOverrides: { allow: [], deny: [] },
      }),
    ).rejects.toThrow('უფლებები შეიცვალა')
    const current = await identity('override-worker')
    await administration.updateAccountAuthorization(owner, {
      ...grant,
      expectedRoles: current.roles,
      expectedOverrides: current.permissionOverrides,
      permissionOverrides: { allow: [], deny: ['attendance.read.all'] },
    })
    await expect(
      attendance.listCompanyAttendanceUsers(
        { ...actor, permissionOverrides: grant.permissionOverrides },
        {},
      ),
    ).rejects.toThrow()
    await expect(
      administration.updateAccountAuthorization(owner, {
        ...grant,
        userId: owner.id,
      }),
    ).rejects.toThrow()
    await expect(
      administration.updateAccountAuthorization(actor, {
        ...grant,
        userId: owner.id,
      }),
    ).rejects.toThrow()
    const changed = await identity('override-worker')
    const next = {
      ...grant,
      expectedRoles: changed.roles,
      expectedOverrides: changed.permissionOverrides,
    }
    const results = await Promise.allSettled([
      administration.updateAccountAuthorization(owner, next),
      administration.updateAccountAuthorization(owner, next),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const audit = await testDatabase()
      .select()
      .from(tables.accessAudit)
      .where(
        and(
          eq(tables.accessAudit.targetId, worker.id),
          eq(tables.accessAudit.action, 'account.authorization_updated'),
        ),
      )
    expect(audit).toHaveLength(3)
  })
  it('keeps literal directory searches, pagination, and totals server-side', async () => {
    await testDatabase()
      .insert(tables.user)
      .values(
        Array.from({ length: 22 }, (_, index) => ({
          id: 'directory-' + index,
          name: 'სიაში ' + index,
          email: 'directory-' + index + '@access.invalid',
          username: 'directory-' + index,
          roles: 'employee',
        })),
      )
    const first = await administration.listAdminAccounts(owner, {
      q: 'directory-',
      page: 1,
      sort: 'username-asc',
    })
    const second = await administration.listAdminAccounts(owner, {
      q: 'directory-',
      page: 2,
      sort: 'username-asc',
    })
    expect(first.items).toHaveLength(20)
    expect(second.items).toHaveLength(2)
    expect(first.total).toBe(22)
    expect(
      (await administration.listAdminAccounts(owner, { q: '%' })).total,
    ).toBe(0)
    await expect(
      administration.listAdminAccounts(owner, { page: -1 }),
    ).rejects.toThrow()
  })

  it('offboards once, revokes login access, and retains dated attendance and payroll eligibility', async () => {
    const issued = await service.provisionEmployee(owner, {
      name: 'გასული თანამშრომელი',
      contactEmail: '',
      roles: ['employee'],
      employmentStartDate: '2026-01-02',
    })
    await service.completeEmployeeActivation(
      {
        code: issued.code,
        username: 'worker-departure',
        newPassword: password,
      },
      hashPassword,
    )
    const worker = await identity('worker-departure')
    const login = await auth.api.signInUsername({
      body: { username: 'worker-departure', password },
    })
    await service.manageEmployeeAccount(owner, {
      userId: worker.id,
      action: 'issue_reset',
      reason: '',
    })
    const [person] = await testDatabase()
      .select()
      .from(tables.employee)
      .where(eq(tables.employee.userId, worker.id))
    const departure = {
      userId: worker.id,
      expectedRevision: 1,
      startDate: '',
      endDate: '2026-01-15',
      reason: 'დასაქმების დასრულება თანამშრომლის მოთხოვნით.',
    }
    await expect(
      service.offboardEmployee(null, departure),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      service.offboardEmployee({ ...owner, id: worker.id }, departure),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      service.offboardEmployee(owner, { ...departure, userId: owner.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      service.offboardEmployee(owner, { ...departure, expectedRevision: 0 }),
    ).rejects.toThrow('განაახლეთ')

    const from = new Date('2026-01-15T05:00:00Z')
    const until = new Date('2026-01-15T13:00:00Z')
    const [attendance] = await testDatabase()
      .insert(tables.attendanceSession)
      .values({
        employeeId: person.id,
        requestId: randomUUID(),
        workDate: departure.endDate,
        timezone: 'Asia/Tbilisi',
        scheduleEffectiveFrom: '2026-01-01',
        expectedStartAt: from,
        expectedEndAt: until,
        startedAt: from,
      })
      .returning({ id: tables.attendanceSession.id })
    await expect(service.offboardEmployee(owner, departure)).rejects.toThrow(
      'ღია დასწრება',
    )
    expect((await service.getLoginAccess(worker.id)).allowed).toBe(true)

    await testDatabase()
      .update(tables.attendanceSession)
      .set({
        endedAt: until,
      })
      .where(eq(tables.attendanceSession.id, attendance.id))
    await expect(
      service.offboardEmployee(owner, { ...departure, endDate: '2026-01-14' }),
    ).rejects.toThrow('ჩაწერილი დასწრებები')
    const results = await Promise.allSettled([
      service.offboardEmployee(owner, departure),
      service.offboardEmployee(owner, departure),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect((await identityById(worker.id)).accessState).toBe('suspended')
    expect((await service.getLoginAccess(worker.id)).allowed).toBe(false)
    expect(
      await testDatabase()
        .select()
        .from(tables.session)
        .where(eq(tables.session.token, login.token)),
    ).toHaveLength(0)
    expect(
      await testDatabase()
        .select()
        .from(tables.accountSetup)
        .where(eq(tables.accountSetup.userId, worker.id)),
    ).toHaveLength(0)
    expect(
      await testDatabase()
        .select()
        .from(tables.accessAudit)
        .where(
          and(
            eq(tables.accessAudit.targetId, worker.id),
            eq(tables.accessAudit.action, 'account.employment_ended'),
          ),
        ),
    ).toMatchObject([{ actorId: owner.id, reason: departure.reason }])

    const employment =
      await import('#/features/employees/server/employment.service.server')
    const [lastDay, later] = await testDatabase().transaction(async (tx) => {
      const base = { employeeId: person.id }
      return [
        await employment.readEmploymentEligibility(tx, {
          ...base,
          startDate: departure.endDate,
          endDate: departure.endDate,
        }),
        await employment.readEmploymentEligibility(tx, {
          ...base,
          startDate: '2026-01-16',
          endDate: '2026-01-16',
        }),
      ]
    })
    expect(lastDay.periods).toEqual([
      { startDate: '2026-01-02', endDate: departure.endDate },
    ])
    expect(later.periods).toEqual([])
    expect(
      (await employment.readEmployeeEmployment(owner, { userId: worker.id }))
        .history[0],
    ).toMatchObject({
      reason: departure.reason,
      before: { endDate: null },
      after: { endDate: departure.endDate },
    })
    const search = { page: 1, q: 'worker-departure' }
    expect((await service.listEmployeeAccounts(owner, search)).total).toBe(0)
    expect(
      (
        await service.listEmployeeAccounts(owner, {
          ...search,
          employment: 'former',
        })
      ).records,
    ).toMatchObject([{ userId: worker.id, employmentStatus: 'inactive' }])
    const directory =
      await import('#/features/attendance/server/company-attendance.service.server')
    expect(
      (await directory.listCompanyAttendanceUsers(owner, search)).total,
    ).toBe(0)
    expect(
      (
        await directory.listCompanyAttendanceUsers(owner, {
          ...search,
          employment: 'former',
        })
      ).items,
    ).toMatchObject([{ userId: worker.id, attendanceStatus: 'former' }])
    const timesheets =
      await import('#/features/timesheets/server/timesheets.service.server')
    const historical = await timesheets.readTimesheets(
      owner,
      { month: '2026-01', userId: worker.id },
      'company',
    )
    expect(historical.rows).toMatchObject([{ date: departure.endDate }])
  })

  it('requires an explicit start date for an employee with no confirmed periods', async () => {
    const issued = await provision('თანამშრომელი დადასტურებული თარიღის გარეშე')
    const worker = await identityForCode(issued.code)
    const input = {
      userId: worker.id,
      expectedRevision: 0,
      startDate: '',
      endDate: '2026-01-31',
      reason: 'დასაქმება დასრულდა.',
    }
    await expect(service.offboardEmployee(owner, input)).rejects.toThrow(
      'დაწყების თარიღი',
    )
    await expect(
      service.offboardEmployee(owner, { ...input, startDate: '2026-01-02' }),
    ).resolves.toEqual({ endDate: input.endDate, scheduled: false })
  })

  it('keeps a scheduled employee active until the cutoff and finalizes the departure once', async () => {
    const issued = await service.provisionEmployee(owner, {
      name: 'დაგეგმილი დასრულება',
      contactEmail: '',
      roles: ['employee'],
      employmentStartDate: '2026-01-02',
    })
    await service.completeEmployeeActivation(
      {
        code: issued.code,
        username: 'scheduled-departure',
        newPassword: password,
      },
      hashPassword,
    )
    const worker = await identity('scheduled-departure')
    const command = {
      userId: worker.id,
      startDate: '',
      endDate: '2099-12-01',
      reason: 'წინასწარ შეთანხმებული ბოლო სამუშაო დღე.',
      expectedRevision: 1,
    }
    await expect(service.offboardEmployee(owner, command)).resolves.toEqual({
      endDate: command.endDate,
      scheduled: true,
    })
    await expect(
      service.offboardEmployee(owner, {
        ...command,
        expectedRevision: 2,
        endDate: '2099-12-02',
      }),
    ).resolves.toEqual({ endDate: '2099-12-02', scheduled: true })
    const [person] = await testDatabase()
      .select()
      .from(tables.employee)
      .where(eq(tables.employee.userId, worker.id))
    expect(person.status).toBe('active')
    expect(person.departureEffectiveAt?.toISOString()).toBe(
      '2099-12-02T20:00:00.000Z',
    )
    expect(
      await service.runScheduledDepartures(
        new Date('2099-12-02T19:59:59.999Z'),
      ),
    ).toBe(0)
    expect((await service.getLoginAccess(worker.id)).allowed).toBe(true)
    const login = await auth.api.signInUsername({
      body: { username: 'scheduled-departure', password },
    })

    const startsAt = new Date('2099-12-02T17:00:00Z')
    await testDatabase().insert(tables.attendanceSession).values({
      employeeId: person.id,
      requestId: randomUUID(),
      workDate: '2099-12-02',
      timezone: 'Asia/Tbilisi',
      scheduleEffectiveFrom: '2026-01-01',
      expectedStartAt: startsAt,
      expectedEndAt: startsAt,
      startedAt: startsAt,
    })
    const cutoff = new Date('2099-12-02T20:00:00Z')
    const runs = await Promise.all([
      service.runScheduledDepartures(cutoff),
      service.runScheduledDepartures(cutoff),
    ])
    expect(runs.sort()).toEqual([0, 1])
    expect((await service.getLoginAccess(worker.id)).allowed).toBe(false)
    expect(
      await testDatabase()
        .select()
        .from(tables.session)
        .where(eq(tables.session.token, login.token)),
    ).toHaveLength(0)
    expect(
      await testDatabase()
        .select()
        .from(tables.attendanceSession)
        .where(eq(tables.attendanceSession.employeeId, person.id)),
    ).toMatchObject([
      { endedAt: cutoff, autoClosedAt: cutoff, reviewState: 'pending' },
    ])
    await expect(
      auth.api.signInUsername({
        body: { username: 'scheduled-departure', password },
      }),
    ).rejects.toThrow()
  })

  it('enforces an elapsed departure cutoff before the background task has run', async () => {
    const issued = await provision('დასრულებული დაგეგმილი თარიღი')
    const worker = await identityForCode(issued.code)
    await testDatabase()
      .update(tables.user)
      .set({ accessState: 'active' })
      .where(eq(tables.user.id, worker.id))
    await testDatabase()
      .update(tables.employee)
      .set({ departureEffectiveAt: new Date('2026-01-01T20:00:00Z') })
      .where(eq(tables.employee.userId, worker.id))
    expect((await service.getLoginAccess(worker.id)).allowed).toBe(false)
    expect(
      (await service.readEmployeeAccount(owner, { userId: worker.id }))?.record
        .employmentStatus,
    ).toBe('inactive')
    await testDatabase()
      .update(tables.user)
      .set({ accessState: 'invited' })
      .where(eq(tables.user.id, worker.id))
    await expect(
      service.completeEmployeeActivation(
        {
          code: issued.code,
          username: 'elapsed-departure',
          newPassword: password,
        },
        hashPassword,
      ),
    ).rejects.toThrow()
  })
})
