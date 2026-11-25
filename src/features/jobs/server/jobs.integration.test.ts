// @vitest-environment node
import 'dotenv/config'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type * as Service from './jobs.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'
import type { LocationFeature } from '../job-locations.types'
import { defaultJobNotificationRoles } from '#/features/notifications/notification-settings.schemas'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const geocoder = vi.hoisted(() => ({ enabled: false, request: vi.fn() }))
vi.mock('#/server/integrations/geocoding.server', () => ({
  geocodingConfiguration: () => ({
    enabled: geocoder.enabled,
    baseUrl: 'https://geocoder.test',
  }),
  requestGeocoding: geocoder.request,
  GeocodingUnavailableError: class extends Error {},
}))
const enabled = process.env.RUN_JOBS_DB_TESTS === '1'
const originalUrl = process.env.DATABASE_URL
const databaseName = `team_adwings_jobs_test_${randomBytes(8).toString('hex')}`
let admin: pg.Client | undefined
let connection: pg.Client | undefined
let database: typeof Database | undefined
let service: typeof Service
let created = false
const actor = (id: string, roles: Actor['roles'] = ['employee']): Actor => ({
  id,
  roles,
  name: 'ტესტი',
  email: null,
  emailVerified: false,
})
const manager = {
  ...actor('jobs-manager', ['supervisor']),
  name: 'წარმოების უფროსი',
}
const worker = {
  ...actor('jobs-worker', ['production_specialist']),
  name: 'წარმოების სპეციალისტი',
}
const other = actor('jobs-other', ['production_specialist'])
const ordinaryEmployee = actor('jobs-reader')
const platformAdmin = {
  ...actor('jobs-admin', ['admin']),
  name: 'ადმინისტრატორი',
}
const production = actor('jobs-production', ['production_specialist'])
const fields = {
  title: 'სატესტო მონტაჟი',
  notes: 'ინსტრუქცია',
  address: 'თბილისი',
  kind: 'installation',
  deadline: '2026-11-20',
  longitude: 44.8,
  latitude: 41.7,
}
const search = {
  q: '',
  status: 'all',
  kind: 'all',
  scope: 'all',
  sort: 'newest',
  page: 1,
  view: 'map',
}
function sql() {
  if (!connection) throw new Error('Isolated database unavailable')
  return connection
}
async function createPin(overrides = {}) {
  return service.createCompanyJob(manager, {
    ...fields,
    requestId: randomUUID(),
    ...overrides,
  })
}
async function detail(id: string) {
  return service.getCompanyJob(worker, { id })
}
async function transition(id: string, status: string, by = worker, note = '') {
  const record = await detail(id)
  return service.transitionCompanyJob(by, {
    id,
    version: record.version,
    status,
    note,
  })
}

describe.runIf(enabled)('jobs map against isolated PostgreSQL', () => {
  it('counts only current eligible team members and includes empty teams', async () => {
    const teams = (
      await sql().query(
        "INSERT INTO production_team (name) VALUES ('დათვლა სრული'), ('დათვლა ცარიელი') RETURNING id",
      )
    ).rows
    const teamId = teams[0].id
    const candidates = () =>
      service.listJobAssignmentCandidates(manager, {
        kind: 'teams',
        q: 'დათვლა',
        page: 1,
      })
    const memberCount = async () =>
      (await candidates()).items.find((item) => item.id === teamId)?.memberCount
    try {
      await sql().query(
        'INSERT INTO team_membership (team_id, user_id) VALUES ($1, $2), ($1, $3)',
        [teamId, worker.id, other.id],
      )
      expect(await memberCount()).toBe(2)
      expect(
        (await candidates()).items.find((item) => item.id === teams[1].id)
          ?.memberCount,
      ).toBe(0)
      await sql().query(
        'UPDATE team_membership SET ended_at=now() WHERE team_id=$1 AND user_id=$2',
        [teamId, other.id],
      )
      expect(await memberCount()).toBe(1)
      await sql().query(
        "UPDATE employee SET status='inactive' WHERE user_id=$1",
        [worker.id],
      )
      expect(await memberCount()).toBe(0)
      await sql().query(
        "UPDATE employee SET status='active' WHERE user_id=$1",
        [worker.id],
      )
      await sql().query(
        'UPDATE "user" SET access_state=\'suspended\' WHERE id=$1',
        [worker.id],
      )
      expect(await memberCount()).toBe(0)
      await sql().query(
        "UPDATE \"user\" SET access_state='active', roles='production_specialist,admin' WHERE id=$1",
        [worker.id],
      )
      expect(await memberCount()).toBe(0)
      await sql().query('UPDATE "user" SET roles=\'employee\' WHERE id=$1', [
        worker.id,
      ])
      expect(await memberCount()).toBe(1)
    } finally {
      await sql().query(
        "UPDATE employee SET status='active' WHERE user_id=$1",
        [worker.id],
      )
      await sql().query(
        "UPDATE \"user\" SET access_state='active', roles='production_specialist' WHERE id=$1",
        [worker.id],
      )
      const ids = teams.map((team) => team.id)
      await sql().query(
        'DELETE FROM team_membership WHERE team_id=ANY($1::uuid[])',
        [ids],
      )
      await sql().query(
        'DELETE FROM production_team WHERE id=ANY($1::uuid[])',
        [ids],
      )
    }
  })
  it('filters assignment candidates by validated roles and literal search without changing eligibility', async () => {
    await sql().query(`UPDATE "user" SET roles='employee' WHERE id=$1`, [
      other.id,
    ])
    try {
      expect(
        (
          await service.listJobAssignmentCandidates(manager, {
            kind: 'employees',
            q: '',
            page: 1,
          })
        ).items.map((person) => person.id),
      ).toEqual([worker.id])
      expect(
        (
          await service.listJobAssignmentCandidates(manager, {
            kind: 'employees',
            q: '',
            page: 1,
            roles: ['employee'],
          })
        ).items.map((person) => person.id),
      ).toEqual([other.id])
      expect(
        (
          await service.listJobAssignmentCandidates(manager, {
            kind: 'employees',
            q: '',
            page: 1,
            roles: [],
          })
        ).total,
      ).toBe(0)
      expect(
        (
          await service.listJobAssignmentCandidates(manager, {
            kind: 'employees',
            q: '%',
            page: 1,
            roles: ['employee', 'production_specialist'],
          })
        ).total,
      ).toBe(0)
      await expect(
        service.listJobAssignmentCandidates(manager, {
          kind: 'employees',
          q: '',
          page: 1,
          roles: ['admin'],
        }),
      ).rejects.toThrow('მოთხოვნა არასწორია')
    } finally {
      await sql().query(
        `UPDATE "user" SET roles='production_specialist' WHERE id=$1`,
        [other.id],
      )
    }
  })
  it('rejects disabled resources, returns minimal candidates and serializes concurrent assignment saves', async () => {
    const { id } = await createPin()
    const [team] = (
      await sql().query(
        "INSERT INTO production_team (name, active) VALUES ('გამორთული გუნდი', false) RETURNING id",
      )
    ).rows
    const [device] = (
      await sql().query(
        "INSERT INTO gps_device (name, reported_id, phone, enabled) VALUES ('გამორთული GPS', '009876543211', '+995555000000', false) RETURNING id",
      )
    ).rows
    const input = {
      id,
      version: 1,
      employeeIds: [worker.id],
      teamId: null,
      teamVersion: null,
      gpsDeviceId: null,
    }
    try {
      await expect(
        service.saveCompanyJobAssignments(manager, {
          ...input,
          teamId: team.id,
        }),
      ).rejects.toThrow('მოქმედი გუნდი')
      await expect(
        service.saveCompanyJobAssignments(manager, {
          ...input,
          gpsDeviceId: device.id,
        }),
      ).rejects.toThrow('მოქმედი GPS')
      await expect(
        service.getJobAssignmentTeam(manager, { id: team.id }),
      ).rejects.toThrow('მოქმედი გუნდი')
      expect(
        (
          await service.listJobAssignmentCandidates(manager, {
            kind: 'devices',
            q: 'გამორთული GPS',
            page: 1,
          })
        ).total,
      ).toBe(0)
      await sql().query('UPDATE gps_device SET enabled=true WHERE id=$1', [
        device.id,
      ])
      expect(
        (
          await service.listJobAssignmentCandidates(manager, {
            kind: 'devices',
            q: 'გამორთული GPS',
            page: 1,
          })
        ).items,
      ).toEqual([
        {
          id: device.id,
          name: 'გამორთული GPS',
          jobTitle: null,
          reportedId: '009876543211',
          phone: '+995555000000',
        },
      ])
      const results = await Promise.allSettled([
        service.saveCompanyJobAssignments(manager, input),
        service.saveCompanyJobAssignments(platformAdmin, {
          ...input,
          employeeIds: [other.id],
        }),
      ])
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1)
      expect((await detail(id)).version).toBe(2)
      expect(
        (await detail(id)).history.filter(
          (event) => event.action === 'assignments_changed',
        ),
      ).toHaveLength(1)
    } finally {
      await sql().query('DELETE FROM production_team WHERE id=$1', [team.id])
      await sql().query('DELETE FROM gps_device WHERE id=$1', [device.id])
    }
  })
  it('saves a crew, team and GPS device with atomic audit, scoped reads and stale-edit protection', async () => {
    const { id } = await createPin()
    const [team] = (
      await sql().query(
        "INSERT INTO production_team (name) VALUES ('სატესტო გუნდი') RETURNING id, version",
      )
    ).rows
    const [device] = (
      await sql().query(
        "INSERT INTO gps_device (name, reported_id) VALUES ('სატესტო GPS', '009876543210') RETURNING id",
      )
    ).rows
    try {
      await sql().query(
        'INSERT INTO team_membership (team_id, user_id) VALUES ($1, $2)',
        [team.id, worker.id],
      )
      const roster = await service.getJobAssignmentTeam(manager, {
        id: team.id,
      })
      expect(roster.employees.map((person) => person.id)).toEqual([worker.id])
      const assignmentDraft = {
        id,
        version: 1,
        employeeIds: [worker.id, other.id],
        teamId: team.id,
        teamVersion: roster.version,
        gpsDeviceId: device.id,
      }
      await service.saveCompanyJobAssignments(platformAdmin, assignmentDraft)
      expect(await detail(id)).toMatchObject({
        version: 2,
        status: 'pending',
        assigneeId: null,
        assignments: {
          team: { id: team.id },
          gpsDevice: { id: device.id },
          employees: expect.arrayContaining([
            expect.objectContaining({ id: worker.id }),
            expect.objectContaining({ id: other.id }),
          ]),
        },
      })
      expect(
        (await service.listCompanyJobs(worker, { ...search, scope: 'mine' }))
          .items,
      ).toEqual([expect.objectContaining({ id, assignedEmployeeCount: 2 })])
      expect(
        (await service.listCompanyJobs(other, { ...search, scope: 'related' }))
          .total,
      ).toBe(1)
      expect(
        (
          await service.listCompanyJobs(ordinaryEmployee, {
            ...search,
            scope: 'mine',
          })
        ).total,
      ).toBe(0)
      await expect(
        service.saveCompanyJobAssignments(manager, {
          ...assignmentDraft,
          employeeIds: [],
        }),
      ).rejects.toThrow('უკვე შეიცვალა')
      const events = (
        await sql().query(
          "SELECT assignment_change FROM job_event WHERE job_id=$1 AND action='assignments_changed'",
          [id],
        )
      ).rows
      expect(events).toHaveLength(1)
      expect(events[0].assignment_change.before.employees).toEqual([])
      expect(events[0].assignment_change.after.employees).toHaveLength(2)
      expect(events[0].assignment_change.after.team.name).toBe('სატესტო გუნდი')
      const summary = 'შემსრულებლები: 2\nGPS: სატესტო GPS'
      expect((await detail(id)).history[0].note).toBe(summary)
      // Simulate a pre-format-change event without rewriting its immutable assignment snapshot.
      await sql().query(
        "UPDATE job_event SET note=$2 WHERE job_id=$1 AND action='assignments_changed'",
        [id, 'თანამშრომლები: 2. გუნდი: სატესტო გუნდი. GPS: სატესტო GPS.'],
      )
      const legacy = await detail(id)
      expect(legacy.history[0].note).toBe(summary)
      expect(legacy.history[0]).not.toHaveProperty('assignmentChange')
      await sql().query(
        'UPDATE production_team SET version=version+1 WHERE id=$1',
        [team.id],
      )
      await expect(
        service.saveCompanyJobAssignments(manager, {
          ...assignmentDraft,
          version: 2,
        }),
      ).rejects.toThrow('გუნდი შეიცვალა')
      expect((await detail(id)).version).toBe(2)
      await service.saveCompanyJobAssignments(manager, {
        ...assignmentDraft,
        version: 2,
        employeeIds: [other.id],
        teamId: null,
        teamVersion: null,
        gpsDeviceId: null,
      })
      expect((await detail(id)).assignments).toEqual({
        employees: [expect.objectContaining({ id: other.id })],
        team: null,
        gpsDevice: null,
      })
      expect((await detail(id)).history[0].note).toBe(
        'შემსრულებლები: 1\nGPS: არ არის მითითებული',
      )
      expect((await detail(id)).history[1].note).toBe(summary)
      const noOp = {
        id,
        version: 3,
        employeeIds: [other.id],
        teamId: null,
        teamVersion: null,
        gpsDeviceId: null,
      }
      await service.saveCompanyJobAssignments(manager, noOp)
      expect((await detail(id)).version).toBe(3)
      await transition(id, 'completed', manager)
      await expect(
        service.saveCompanyJobAssignments(manager, {
          ...noOp,
          version: 4,
          employeeIds: [],
        }),
      ).rejects.toThrow('თავიდან დაგეგმეთ')
      expect((await detail(id)).assignments.employees).toHaveLength(1)
    } finally {
      await sql().query('DELETE FROM team_membership WHERE team_id=$1', [
        team.id,
      ])
      // Keep tracker identities referenced by the immutable audit until the isolated database is dropped.
      await sql().query('DELETE FROM production_team WHERE id=$1', [team.id])
    }
  })
  it.each([{ roles: [] }, { roles: ['production_specialist'] }] as const)(
    'notifies added and removed employees once with general notification roles $roles',
    async ({ roles }) => {
      const settings =
        await import('#/features/notifications/server/notification-settings.service.server')
      await settings.saveNotificationSettings(platformAdmin, {
        jobNotificationRoles: [...roles],
      })
      const { id } = await createPin()
      const draft = {
        id,
        version: 1,
        employeeIds: [worker.id, other.id],
        teamId: null,
        teamVersion: null,
        gpsDeviceId: null,
      }
      const notices = async (version: number) =>
        (
          await sql().query(
            'SELECT recipient_id, title, body, destination, live_toast FROM notification WHERE event_key=$1 ORDER BY recipient_id',
            [`job:${id}:${version}:assignments`],
          )
        ).rows
      await service.saveCompanyJobAssignments(manager, draft)
      const added = await notices(2)
      expect(added.map((item) => item.recipient_id)).toEqual(
        [worker.id, other.id, ...(roles.length ? [production.id] : [])].sort(),
      )
      for (const recipient of [worker.id, other.id]) {
        const notification = added.find(
          (item) => item.recipient_id === recipient,
        )
        expect(notification).toMatchObject({
          title: 'სამუშაოზე დაგამატეს',
          destination: { kind: 'job', jobId: id },
          live_toast: true,
        })
        expect(notification.body).toContain(fields.title)
        expect(notification.body).toContain(fields.address)
        expect(notification.body).toContain(
          `ცვლილება შეასრულა: ${manager.name}`,
        )
      }
      await service.saveCompanyJobAssignments(manager, {
        ...draft,
        version: 2,
        employeeIds: [other.id, worker.id],
      })
      expect(await notices(2)).toEqual(added)
      expect(await notices(3)).toEqual([])
      expect((await detail(id)).version).toBe(2)
      await service.saveCompanyJobAssignments(manager, {
        ...draft,
        version: 2,
        employeeIds: [other.id],
      })
      const removed = await notices(3)
      expect(
        removed.filter(
          (item) => item.title !== 'სამუშაოს შემსრულებლები შეიცვალა',
        ),
      ).toEqual([
        expect.objectContaining({
          recipient_id: worker.id,
          title: 'სამუშაოდან მოგხსნეს',
          destination: { kind: 'job', jobId: id },
          live_toast: true,
        }),
      ])
      expect(new Set(removed.map((item) => item.recipient_id)).size).toBe(
        removed.length,
      )
      expect(removed.map((item) => item.recipient_id)).toEqual(
        [worker.id, ...(roles.length ? [other.id, production.id] : [])].sort(),
      )
      await expect(
        service.saveCompanyJobAssignments(manager, {
          ...draft,
          version: 2,
        }),
      ).rejects.toThrow('უკვე შეიცვალა')
      expect(await notices(3)).toEqual(removed)
      await service.saveCompanyJobAssignments(manager, { ...draft, version: 3 })
      expect(
        (await notices(4)).filter(
          (item) => item.title === 'სამუშაოზე დაგამატეს',
        ),
      ).toEqual([expect.objectContaining({ recipient_id: worker.id })])
    },
  )
  it.each(['add', 'remove'] as const)(
    'rolls back an assignment %s and its audit if personal notification delivery fails',
    async (change) => {
      const settings =
        await import('#/features/notifications/server/notification-settings.service.server')
      await settings.saveNotificationSettings(platformAdmin, {
        jobNotificationRoles: [],
      })
      const { id } = await createPin()
      const draft = {
        id,
        version: 1,
        employeeIds: [worker.id],
        teamId: null,
        teamVersion: null,
        gpsDeviceId: null,
      }
      if (change === 'remove')
        await service.saveCompanyJobAssignments(manager, draft)
      const before = await detail(id)
      const notifications = (await sql().query('SELECT id FROM notification'))
        .rows
      await sql().query(
        `CREATE FUNCTION fail_assignment_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test notification failure'; END $$; CREATE TRIGGER fail_assignment_notification BEFORE INSERT ON notification FOR EACH ROW EXECUTE FUNCTION fail_assignment_notification()`,
      )
      try {
        await expect(
          service.saveCompanyJobAssignments(manager, {
            ...draft,
            version: before.version,
            employeeIds: change === 'remove' ? [] : [worker.id],
          }),
        ).rejects.toThrow()
        expect(await detail(id)).toEqual(before)
        expect((await sql().query('SELECT id FROM notification')).rows).toEqual(
          notifications,
        )
      } finally {
        await sql().query(
          'DROP TRIGGER fail_assignment_notification ON notification; DROP FUNCTION fail_assignment_notification()',
        )
      }
    },
  )
  it('denies direct unauthorized assignments and candidate reads using current stored grants and employment', async () => {
    const { id } = await createPin()
    const input = {
      id,
      version: 1,
      employeeIds: [worker.id],
      teamId: null,
      teamVersion: null,
      gpsDeviceId: null,
    }
    for (const by of [
      null,
      worker,
      ordinaryEmployee,
      { ...worker, roles: ['admin'] as Actor['roles'] },
    ]) {
      await expect(
        service.saveCompanyJobAssignments(by, input),
      ).rejects.toThrow('წვდომა')
      await expect(
        service.listJobAssignmentCandidates(by, {
          kind: 'employees',
          q: '',
          page: 1,
        }),
      ).rejects.toThrow('წვდომა')
    }
    await sql().query(
      `UPDATE "user" SET roles='sales_manager', permission_overrides='{"allow":["jobs.assign"],"deny":[]}' WHERE id=$1`,
      [other.id],
    )
    try {
      await expect(
        service.saveCompanyJobAssignments(other, input),
      ).rejects.toThrow('წვდომა')
    } finally {
      await sql().query(
        `UPDATE "user" SET roles='production_specialist', permission_overrides='{"allow":[],"deny":[]}' WHERE id=$1`,
        [other.id],
      )
    }
    await sql().query(
      `UPDATE "user" SET permission_overrides='{"allow":[],"deny":["jobs.assign"]}' WHERE id=$1`,
      [manager.id],
    )
    try {
      await expect(
        service.saveCompanyJobAssignments(manager, input),
      ).rejects.toThrow('წვდომა')
    } finally {
      await sql().query(
        `UPDATE "user" SET permission_overrides='{"allow":[],"deny":[]}' WHERE id=$1`,
        [manager.id],
      )
    }
    await sql().query(
      "UPDATE employee SET status='inactive' WHERE user_id=$1",
      [worker.id],
    )
    try {
      await expect(
        service.saveCompanyJobAssignments(manager, input),
      ).rejects.toThrow('მოქმედი თანამშრომლები')
      expect(
        (
          await service.listJobAssignmentCandidates(manager, {
            kind: 'employees',
            q: '',
            page: 1,
          })
        ).items.some((person) => person.id === worker.id),
      ).toBe(false)
    } finally {
      await sql().query(
        "UPDATE employee SET status='active' WHERE user_id=$1",
        [worker.id],
      )
    }
    expect((await detail(id)).version).toBe(1)
    expect((await detail(id)).assignments.employees).toEqual([])
  })
  it('rolls back assignments and their revision when audit persistence fails', async () => {
    const { id } = await createPin()
    await sql().query(
      `CREATE FUNCTION fail_job_assignment_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='assignments_changed' THEN RAISE EXCEPTION 'test event failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_job_assignment_event BEFORE INSERT ON job_event FOR EACH ROW EXECUTE FUNCTION fail_job_assignment_event()`,
    )
    try {
      await expect(
        service.saveCompanyJobAssignments(manager, {
          id,
          version: 1,
          employeeIds: [worker.id],
          teamId: null,
          teamVersion: null,
          gpsDeviceId: null,
        }),
      ).rejects.toThrow()
      expect((await detail(id)).version).toBe(1)
      expect((await detail(id)).assignments.employees).toEqual([])
    } finally {
      await sql().query(
        'DROP TRIGGER fail_job_assignment_event ON job_event; DROP FUNCTION fail_job_assignment_event()',
      )
    }
  })
  it('permits only the stored creator or an administrator to edit and reopen, retaining production completion and audit', async () => {
    await sql().query('UPDATE "user" SET roles=$1 WHERE id=$2', [
      'sales_manager',
      other.id,
    ])
    try {
      const { id } = await service.createCompanyJob(other, {
        ...fields,
        requestId: randomUUID(),
      })
      for (const by of [
        manager,
        worker,
        { ...worker, roles: ['admin'] as const },
      ]) {
        await expect(
          service.editCompanyJob(
            { ...by, roles: [...by.roles] },
            { ...fields, id, version: 1, createdBy: by.id },
          ),
        ).rejects.toThrow('წვდომა')
      }
      expect(await detail(id)).toMatchObject({
        createdBy: other.id,
        version: 1,
      })
      expect((await detail(id)).history).toHaveLength(1)
      await service.editCompanyJob(other, {
        ...fields,
        title: 'ავტორის ცვლილება',
        id,
        version: 1,
      })
      await service.editCompanyJob(platformAdmin, {
        ...fields,
        title: 'ადმინისტრატორის ცვლილება',
        id,
        version: 2,
      })
      await transition(id, 'completed', manager)
      for (const by of [manager, worker])
        await expect(
          transition(id, 'pending', by, 'თავიდან დაგეგმვა'),
        ).rejects.toThrow('წვდომა')
      expect(await detail(id)).toMatchObject({
        status: 'completed',
        version: 4,
      })
      await expect(transition(id, 'pending', other)).rejects.toThrow(
        'მოთხოვნა არასწორია',
      )
      await transition(id, 'pending', other, 'ავტორის გადაწყვეტილება')
      expect(await detail(id)).toMatchObject({
        status: 'pending',
        assigneeId: null,
        version: 5,
      })
      await transition(id, 'completed', manager)
      await transition(
        id,
        'pending',
        platformAdmin,
        'ადმინისტრატორის გადაწყვეტილება',
      )
      const record = await detail(id)
      expect(record).toMatchObject({
        status: 'pending',
        assigneeId: null,
        version: 7,
        createdBy: other.id,
      })
      expect(record.history).toHaveLength(7)
      expect(
        (
          await sql().query(
            'SELECT actor_id FROM job_event WHERE job_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1',
            [id],
          )
        ).rows[0].actor_id,
      ).toBe(platformAdmin.id)
      await sql().query(
        'UPDATE "user" SET permission_overrides=$1 WHERE id=$2',
        [
          JSON.stringify({ allow: [], deny: ['jobs.edit.all'] }),
          platformAdmin.id,
        ],
      )
      try {
        await expect(
          service.editCompanyJob(platformAdmin, { ...fields, id, version: 7 }),
        ).rejects.toThrow('წვდომა')
      } finally {
        await sql().query(
          'UPDATE "user" SET permission_overrides=$1 WHERE id=$2',
          [JSON.stringify({ allow: [], deny: [] }), platformAdmin.id],
        )
      }
    } finally {
      await sql().query('UPDATE "user" SET roles=$1 WHERE id=$2', [
        'production_specialist',
        other.id,
      ])
    }
  })
  it('filters related jobs by the trusted viewer as creator or current assignee without duplicate counts', async () => {
    const own = await createPin()
    const both = await createPin()
    const unmapped = await createPin({ longitude: null, latitude: null })
    await transition(both.id, 'completed', manager)
    await sql().query('UPDATE "user" SET roles=$1 WHERE id=$2', [
      'sales_manager',
      other.id,
    ])
    let assigned: { id: string }
    try {
      assigned = await service.createCompanyJob(other, {
        ...fields,
        kind: 'measurement',
        requestId: randomUUID(),
      })
      await service.createCompanyJob(other, {
        ...fields,
        requestId: randomUUID(),
      })
    } finally {
      await sql().query('UPDATE "user" SET roles=$1 WHERE id=$2', [
        'production_specialist',
        other.id,
      ])
    }
    await transition(assigned.id, 'completed', manager)
    for (const view of ['map', 'list']) {
      const result = await service.listCompanyJobs(manager, {
        ...search,
        scope: 'related',
        view,
      })
      expect(result.total).toBe(4)
      expect(result.unmappedTotal).toBe(1)
      expect(result.items.map((item) => item.id).sort()).toEqual(
        [own.id, assigned.id, both.id, unmapped.id].sort(),
      )
      expect(result.markers.map((pin) => pin.id).sort()).toEqual(
        [own.id, assigned.id, both.id].sort(),
      )
    }
    expect(
      (await service.listCompanyJobs(manager, { ...search, scope: 'mine' }))
        .total,
    ).toBe(2)
    expect(
      (await service.listCompanyJobs(worker, { ...search, scope: 'related' }))
        .total,
    ).toBe(0)
    expect(
      (
        await service.listCompanyJobs(manager, {
          ...search,
          scope: 'related',
          kind: 'measurement',
        })
      ).total,
    ).toBe(1)
    expect(
      (
        await service.listCompanyJobs(manager, {
          ...search,
          scope: 'related',
          actorId: other.id,
        })
      ).total,
    ).toBe(4)
  })
  it.each(['installation', 'measurement', 'other'])(
    'allows authorized direct completion of %s jobs with a trusted assignee and audit',
    async (kind) => {
      for (const by of [platformAdmin, manager]) {
        const { id } = await createPin({ kind })
        await service.transitionCompanyJob(by, {
          id,
          version: 1,
          status: 'completed',
          note: '',
        })
        expect(await detail(id)).toMatchObject({
          status: 'completed',
          assigneeId: by.id,
          version: 2,
        })
        expect((await detail(id)).history[0]).toMatchObject({
          status: 'completed',
          actorName: by.name,
        })
      }
    },
  )
  it('keeps new jobs unread independently and makes acknowledgement idempotent', async () => {
    const { id } = await createPin()
    expect(await service.getUnreadCompanyJobs(worker)).toEqual({
      hasUnread: true,
    })
    await expect(service.acknowledgeCompanyJob(null, { id })).rejects.toThrow()
    await expect(
      service.acknowledgeCompanyJob(worker, { id: randomUUID() }),
    ).rejects.toThrow()
    await service.acknowledgeCompanyJob(worker, { id })
    await service.acknowledgeCompanyJob(worker, { id })
    expect(await service.getUnreadCompanyJobs(worker)).toEqual({
      hasUnread: false,
    })
    expect(await service.getUnreadCompanyJobs(manager)).toEqual({
      hasUnread: true,
    })
    const result = await service.listCompanyJobs(worker, { ...search })
    expect(result.markers.find((pin) => pin.id === id)?.isUnread).toBe(false)
  })
  beforeAll(async () => {
    if (!originalUrl) throw new Error('Local PostgreSQL configuration required')
    const target = new URL(originalUrl)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
      throw new Error('Tests require local PostgreSQL')
    admin = new pg.Client({
      connectionString: originalUrl,
      connectionTimeoutMillis: 3000,
    })
    await admin.connect()
    expect(
      Number(
        (await admin.query('show server_version_num')).rows[0]
          .server_version_num,
      ),
    ).toBeGreaterThanOrEqual(180000)
    await admin.query(`CREATE DATABASE "${databaseName}"`)
    created = true
    target.pathname = `/${databaseName}`
    connection = new pg.Client({ connectionString: target.toString() })
    await connection.connect()
    for (const file of readdirSync('drizzle')
      .filter((value) => /^\d+.*\.sql$/.test(value))
      .sort()) {
      if (file === '0051_job_notification_roles.sql') {
        await sql().query(
          `INSERT INTO "user" (id, name, email, roles) VALUES ('migration-auditor', 'Migration test', 'migration@jobs.invalid', 'admin')`,
        )
        await sql().query(
          `INSERT INTO notification_policy (id, job_created_enabled) VALUES ('company', false)`,
        )
        await sql().query(
          `INSERT INTO notification_policy_audit (actor_id, before_enabled, after_enabled) VALUES ('migration-auditor', true, false)`,
        )
      }
      await sql().query(
        readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
          '--> statement-breakpoint',
          '',
        ),
      )
      if (file === '0051_job_notification_roles.sql') {
        expect(
          (
            await sql().query(
              'SELECT job_notification_roles FROM notification_policy',
            )
          ).rows,
        ).toEqual([{ job_notification_roles: [] }])
        expect(
          (
            await sql().query(
              'SELECT before_enabled, after_enabled, before_roles, after_roles FROM notification_policy_audit',
            )
          ).rows,
        ).toEqual([
          {
            before_enabled: true,
            after_enabled: false,
            before_roles: null,
            after_roles: null,
          },
        ])
        await sql().query(
          'TRUNCATE notification_policy, notification_policy_audit',
        )
        await sql().query(`DELETE FROM "user" WHERE id='migration-auditor'`)
      }
    }
    process.env.DATABASE_URL = target.toString()
    service = await import('./jobs.service.server')
    database = (await import('#/db')).db
    for (const identity of [
      manager,
      worker,
      other,
      ordinaryEmployee,
      platformAdmin,
      production,
    ])
      await sql().query(
        'INSERT INTO "user" (id, name, email, roles) VALUES ($1, $2, $3, $4)',
        [
          identity.id,
          identity.name,
          `${identity.id}@jobs.invalid`,
          identity.roles.join(','),
        ],
      )
    await sql().query(
      "INSERT INTO employee (username, user_id, full_name) VALUES ('jobs-worker', 'jobs-worker', 'თანამშრომელი'), ('jobs-other', 'jobs-other', 'სხვა თანამშრომელი')",
    )
  }, 30_000)
  beforeEach(async () => {
    await sql().query(
      'TRUNCATE payroll_award_proposal_version, payroll_award_proposal, payroll_award_pool_version, payroll_award_pool, payroll_award_source, job_employee, job_read, job_event, job',
    )
    await sql().query(
      'TRUNCATE notification, notification_policy, notification_policy_audit',
    )
    await sql().query('TRUNCATE job_geocoding_cache, job_geocoding_gate')
    geocoder.enabled = false
    geocoder.request.mockReset()
  })
  afterAll(async () => {
    await database?.$client.end()
    await connection?.end()
    process.env.DATABASE_URL = originalUrl
    if (admin) {
      if (created)
        await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
      await admin.end()
    }
  })
  it('rejects unauthenticated direct service calls and employee creation/editing', async () => {
    const { id } = await createPin()
    await expect(service.listCompanyJobs(null, search)).rejects.toThrow(
      'წვდომა',
    )
    await expect(service.getCompanyJob(null, { id })).rejects.toThrow('წვდომა')
    await expect(
      service.createCompanyJob(null, { ...fields, requestId: randomUUID() }),
    ).rejects.toThrow('წვდომა')
    await expect(
      service.createCompanyJob(worker, { ...fields, requestId: randomUUID() }),
    ).rejects.toThrow('წვდომა')
    await expect(
      service.editCompanyJob(worker, { ...fields, id, version: 1 }),
    ).rejects.toThrow('წვდომა')
    await expect(
      service.transitionCompanyJob(null, {
        id,
        version: 1,
        status: 'en_route',
        note: '',
      }),
    ).rejects.toThrow('წვდომა')
    expect((await service.listCompanyJobs(platformAdmin, search)).total).toBe(1)
    await expect(
      service.createCompanyJob(platformAdmin, {
        ...fields,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow('წვდომა')
  })
  it.each(['', '   '])(
    'rejects a blank address on direct create and edit calls: %j',
    async (address) => {
      const { id } = await createPin()
      await expect(
        service.createCompanyJob(manager, {
          ...fields,
          address,
          requestId: randomUUID(),
        }),
      ).rejects.toThrow()
      await expect(
        service.editCompanyJob(manager, {
          ...fields,
          address,
          longitude: null,
          latitude: null,
          id,
          version: 1,
        }),
      ).rejects.toThrow()
      expect((await sql().query('SELECT id FROM job')).rows).toHaveLength(1)
      expect((await detail(id)).address).toBe(fields.address)
      expect((await detail(id)).history).toHaveLength(1)
    },
  )
  it('stores unlocated jobs without geocoding and permits production staff to read and progress their own work', async () => {
    geocoder.enabled = true
    const { id } = await createPin({ longitude: null, latitude: null })
    expect(geocoder.request).not.toHaveBeenCalled()
    expect(await service.getCompanyJob(production, { id })).toMatchObject({
      longitude: null,
      latitude: null,
    })
    const result = await service.listCompanyJobs(production, search)
    expect(result).toMatchObject({
      total: 1,
      unmappedTotal: 1,
      mapTruncated: false,
      markers: [],
    })
    expect(result.items[0].id).toBe(id)
    await expect(
      service.createCompanyJob(production, {
        ...fields,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow('წვდომა')
    await expect(
      service.editCompanyJob(production, { ...fields, id, version: 1 }),
    ).rejects.toThrow('წვდომა')
    await transition(id, 'en_route', production)
    await transition(id, 'on_site', production)
    await transition(id, 'completed', production)
    expect(await detail(id)).toMatchObject({
      status: 'completed',
      assigneeId: production.id,
    })
  })
  it('rejects direct claims without a current production or administrator grant', async () => {
    const { id } = await createPin()
    const forgedProduction: Actor = {
      ...ordinaryEmployee,
      roles: ['production_specialist'],
    }
    for (const by of [manager, ordinaryEmployee, forgedProduction])
      await expect(transition(id, 'en_route', by)).rejects.toThrow('წვდომა')
    await sql().query('UPDATE "user" SET roles = $1 WHERE id = $2', [
      'employee',
      worker.id,
    ])
    try {
      await expect(transition(id, 'en_route', worker)).rejects.toThrow('წვდომა')
    } finally {
      await sql().query('UPDATE "user" SET roles = $1 WHERE id = $2', [
        'production_specialist',
        worker.id,
      ])
    }
    expect(await detail(id)).toMatchObject({
      status: 'pending',
      version: 1,
      assigneeId: null,
    })
    expect((await detail(id)).history).toHaveLength(1)
    await transition(id, 'en_route', platformAdmin)
    expect(await detail(id)).toMatchObject({
      status: 'en_route',
      assigneeId: platformAdmin.id,
    })
  })
  it('records the trusted person for every edit and status change and returns the names in details', async () => {
    const { id } = await createPin()
    await service.editCompanyJob(manager, {
      ...fields,
      id,
      version: 1,
      notes: 'განახლებული ინსტრუქცია',
    })
    await service.transitionCompanyJob(
      { ...worker, name: 'არასწორი სახელი' },
      {
        id,
        version: 2,
        status: 'en_route',
        note: '',
        actorId: manager.id,
      },
    )
    await transition(id, 'on_site', worker)
    await transition(id, 'completed', manager, 'შესრულება გადამოწმებულია')
    const events = (
      await sql().query(
        'SELECT actor_id, action, status FROM job_event WHERE job_id = $1 ORDER BY created_at, id',
        [id],
      )
    ).rows
    expect(events).toEqual([
      { actor_id: manager.id, action: 'created', status: 'pending' },
      { actor_id: manager.id, action: 'edited', status: 'pending' },
      { actor_id: worker.id, action: 'status_changed', status: 'en_route' },
      { actor_id: worker.id, action: 'status_changed', status: 'on_site' },
      { actor_id: manager.id, action: 'status_changed', status: 'completed' },
    ])
    const record = await detail(id)
    expect(
      record.history.map((event) => ({
        action: event.action,
        status: event.status,
        actorName: event.actorName,
      })),
    ).toEqual([
      {
        action: 'status_changed',
        status: 'completed',
        actorName: manager.name,
      },
      { action: 'status_changed', status: 'on_site', actorName: worker.name },
      { action: 'status_changed', status: 'en_route', actorName: worker.name },
      { action: 'edited', status: 'pending', actorName: manager.name },
      { action: 'created', status: 'pending', actorName: manager.name },
    ])
    expect(
      record.history.every(
        (event) => !Number.isNaN(Date.parse(event.createdAt)),
      ),
    ).toBe(true)
  })
  it('adds or removes a job location and clears stale street names atomically', async () => {
    const { id } = await createPin({ longitude: null, latitude: null })
    await service.editCompanyJob(manager, { ...fields, id, version: 1 })
    expect(
      (await service.listCompanyJobs(worker, search)).markers.map(
        (item) => item.id,
      ),
    ).toEqual([id])
    await sql().query(
      'UPDATE job SET street_name_ka = $1, street_name_en = $2 WHERE id = $3',
      ['ძველი ქუჩა', 'Old street', id],
    )
    await service.editCompanyJob(manager, {
      ...fields,
      id,
      version: 2,
      longitude: null,
      latitude: null,
    })
    expect(await detail(id)).toMatchObject({
      longitude: null,
      latitude: null,
      streetNameKa: null,
      streetNameEn: null,
      locationResolvedAt: null,
      version: 3,
    })
    expect(await service.listCompanyJobs(worker, search)).toMatchObject({
      markers: [],
      total: 1,
      unmappedTotal: 1,
      mapTruncated: false,
    })
    await expect(
      sql().query('UPDATE job SET longitude = 44.8 WHERE id = $1', [id]),
    ).rejects.toThrow('job_coordinates_valid')
  })
  it('reloads stored grants and rejects suspended or inactive actors', async () => {
    await expect(
      service.createCompanyJob(
        { ...worker, roles: ['owner'] },
        { ...fields, requestId: randomUUID() },
      ),
    ).rejects.toThrow('წვდომა')
    await sql().query(
      "UPDATE employee SET status = 'inactive' WHERE user_id = 'jobs-worker'",
    )
    try {
      await expect(service.listCompanyJobs(worker, search)).rejects.toThrow(
        'წვდომა',
      )
    } finally {
      await sql().query(
        "UPDATE employee SET status = 'active' WHERE user_id = 'jobs-worker'",
      )
    }
    await sql().query(
      "UPDATE \"user\" SET access_state = 'suspended' WHERE id = 'jobs-manager'",
    )
    try {
      await expect(createPin()).rejects.toThrow('წვდომა')
    } finally {
      await sql().query(
        "UPDATE \"user\" SET access_state = 'active' WHERE id = 'jobs-manager'",
      )
    }
    await sql().query(
      "UPDATE \"user\" SET roles = 'employee' WHERE id = 'jobs-manager'",
    )
    try {
      await expect(createPin()).rejects.toThrow('წვდომა')
    } finally {
      await sql().query(
        "UPDATE \"user\" SET roles = 'supervisor' WHERE id = 'jobs-manager'",
      )
    }
  })
  it('deduplicates concurrent creation retries and records only one creation event', async () => {
    const requestId = randomUUID()
    const results = await Promise.all([
      createPin({ requestId }),
      createPin({ requestId }),
    ])
    expect(results[0].id).toBe(results[1].id)
    const record = await detail(results[0].id)
    expect(record.history).toHaveLength(1)
    expect((await service.listCompanyJobs(worker, search)).total).toBe(1)
    expect(record).not.toHaveProperty('requestId')
  })
  it('serializes concurrent claims and forbids another employee from progressing the task', async () => {
    const { id } = await createPin()
    const results = await Promise.allSettled(
      [worker, other].map((by) =>
        service.transitionCompanyJob(by, {
          id,
          version: 1,
          status: 'en_route',
          note: '',
        }),
      ),
    )
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const record = await detail(id)
    const outsider = record.assigneeId === worker.id ? other : worker
    await expect(
      service.transitionCompanyJob(outsider, {
        id,
        version: record.version,
        status: 'on_site',
        note: '',
      }),
    ).rejects.toThrow('წვდომა')
    expect(record.history).toHaveLength(2)
    expect(record.version).toBe(2)
  })
  it('requires arrival, completes work, locks edits and reopens with an audited reason', async () => {
    const { id } = await createPin()
    await transition(id, 'en_route')
    await expect(transition(id, 'completed')).rejects.toThrow('წვდომა')
    await transition(id, 'on_site', worker, 'მივედი ობიექტზე')
    await transition(id, 'completed', manager, 'სამუშაო დასრულებულია')
    let record = await detail(id)
    expect(record.assigneeId).toBe(worker.id)
    await expect(
      service.editCompanyJob(manager, {
        ...fields,
        id,
        version: record.version,
      }),
    ).rejects.toThrow('თავიდან დაგეგმეთ')
    await expect(
      transition(id, 'pending', worker, 'თავიდან დაგეგმვა'),
    ).rejects.toThrow('წვდომა')
    await expect(transition(id, 'pending', manager)).rejects.toThrow(
      'მოთხოვნა არასწორია',
    )
    await transition(id, 'pending', manager, 'განმეორებითი მონტაჟი')
    record = await detail(id)
    expect(record.assigneeId).toBeNull()
    expect(record.status).toBe('pending')
    expect(record.history[0].note).toBe('განმეორებითი მონტაჟი')
  })
  it('rejects stale edits and validates direct malformed input', async () => {
    const { id } = await createPin()
    await service.editCompanyJob(manager, {
      ...fields,
      id,
      version: 1,
      kind: 'measurement',
      title: 'ახალი აზომვა',
    })
    await expect(
      service.editCompanyJob(manager, { ...fields, id, version: 1 }),
    ).rejects.toThrow('უკვე შეიცვალა')
    await expect(createPin({ latitude: 100 })).rejects.toThrow(
      'მოთხოვნა არასწორია',
    )
    await expect(
      service.listCompanyJobs(worker, { ...search, page: -1 }),
    ).rejects.toThrow('მოთხოვნა არასწორია')
    await expect(service.getCompanyJob(worker, { id: 'bad' })).rejects.toThrow(
      'მოთხოვნა არასწორია',
    )
    const record = await detail(id)
    expect(record.title).toBe('ახალი აზომვა')
    expect(record.history[0].action).toBe('edited')
  })
  it('persists calendar deadlines through reads and audited edits and rejects clearing the date', async () => {
    const { id } = await createPin({ deadline: '2026-11-20' })
    expect(await detail(id)).toMatchObject({
      deadline: '2026-11-20',
      creatorName: manager.name,
    })
    expect(
      (await service.listCompanyJobs(worker, search)).items[0].deadline,
    ).toBe('2026-11-20')
    await service.editCompanyJob(manager, {
      ...fields,
      id,
      version: 1,
      deadline: '2026-12-15',
    })
    const current = await detail(id)
    expect(current).toMatchObject({ deadline: '2026-12-15', version: 2 })
    expect(current.history[0]).toMatchObject({
      action: 'edited',
      actorName: manager.name,
    })
    await expect(
      service.editCompanyJob(manager, {
        ...fields,
        id,
        version: 1,
        deadline: '2026-12-30',
      }),
    ).rejects.toThrow('უკვე შეიცვალა')
    const { deadline: _deadline, ...withoutDeadline } = fields
    await expect(
      service.editCompanyJob(manager, { ...withoutDeadline, id, version: 2 }),
    ).rejects.toThrow('მოთხოვნა არასწორია')
    await expect(
      service.editCompanyJob(production, {
        ...fields,
        id,
        version: 2,
        deadline: '2026-12-15',
      }),
    ).rejects.toThrow('წვდომა')
    await expect(createPin({ deadline: '2026-02-30' })).rejects.toThrow(
      'მოთხოვნა არასწორია',
    )
    await expect(
      sql().query("UPDATE job SET deadline = '2101-01-01' WHERE id = $1", [id]),
    ).rejects.toThrow('job_deadline_valid')
    expect((await detail(id)).deadline).toBe('2026-12-15')
    await expect(
      service.editCompanyJob(manager, {
        ...fields,
        id,
        version: 2,
        deadline: null,
      }),
    ).rejects.toThrow('მოთხოვნა არასწორია')
    expect(await detail(id)).toMatchObject({
      deadline: '2026-12-15',
      version: 2,
    })
    expect((await detail(id)).history).toHaveLength(2)
    await expect(createPin({ deadline: null })).rejects.toThrow(
      'მოთხოვნა არასწორია',
    )
    await expect(
      service.createCompanyJob(manager, {
        ...withoutDeadline,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow('მოთხოვნა არასწორია')
  })
  it('blocks foreign creates and location edits through direct service calls', async () => {
    const { id } = await createPin()
    const foreign = { longitude: 44.681, latitude: 43.024 }
    await expect(createPin(foreign)).rejects.toThrow('მოთხოვნა არასწორია')
    await expect(
      service.editCompanyJob(manager, {
        ...fields,
        ...foreign,
        id,
        version: 1,
      }),
    ).rejects.toThrow('მოთხოვნა არასწორია')
    const record = await detail(id)
    expect(record.longitude).toBe(fields.longitude)
    expect(record.latitude).toBe(fields.latitude)
    expect(record.version).toBe(1)
    expect(record.history).toHaveLength(1)
    expect((await service.listCompanyJobs(worker, search)).total).toBe(1)
  })
  it('sorts deadlines across pages in both directions with missing deadlines last', async () => {
    const early = await createPin({ deadline: '2026-11-01' })
    const late = await createPin({ deadline: '2026-11-30' })
    const missing = await createPin()
    await sql().query('UPDATE job SET deadline = null WHERE id = $1', [
      missing.id,
    ])
    const tiedIds = []
    for (let index = 0; index < 12; index++)
      tiedIds.push((await createPin({ deadline: '2026-11-15' })).id)
    tiedIds.sort()

    for (const sort of ['deadline_asc', 'deadline_desc']) {
      const first = await service.listCompanyJobs(worker, {
        ...search,
        view: 'list',
        sort,
      })
      const second = await service.listCompanyJobs(worker, {
        ...search,
        view: 'list',
        sort,
        page: 2,
      })
      expect(first.total).toBe(15)
      expect(first.items).toHaveLength(12)
      expect(second.items).toHaveLength(3)
      expect([...first.items, ...second.items].map((item) => item.id)).toEqual([
        sort === 'deadline_asc' ? early.id : late.id,
        ...tiedIds,
        sort === 'deadline_asc' ? late.id : early.id,
        missing.id,
      ])
    }
  })
  it('filters, sorts and paginates in SQL with consistent counts and escaped wildcards', async () => {
    for (let index = 0; index < 14; index++)
      await createPin({
        title: `ობიექტი ${String(index).padStart(2, '0')}`,
        kind: index % 2 ? 'measurement' : 'installation',
      })
    const first = await service.listCompanyJobs(worker, {
      ...search,
      view: 'list',
      sort: 'title',
    })
    const second = await service.listCompanyJobs(worker, {
      ...search,
      view: 'list',
      sort: 'title',
      page: 2,
    })
    expect(first.total).toBe(14)
    expect(first.items).toHaveLength(12)
    expect(second.items).toHaveLength(2)
    const map = await service.listCompanyJobs(worker, {
      ...search,
      view: 'map',
      page: 2,
    })
    expect(map.items).toHaveLength(14)
    expect(map.markers).toHaveLength(14)
    expect(
      first.items
        .map((item) => item.id)
        .some((id) => second.items.some((item) => item.id === id)),
    ).toBe(false)
    expect(
      (
        await service.listCompanyJobs(worker, {
          ...search,
          kind: 'measurement',
        })
      ).total,
    ).toBe(7)
    expect(
      (await service.listCompanyJobs(worker, { ...search, q: '%' })).total,
    ).toBe(0)
    await transition(first.items[0].id, 'en_route')
    expect(
      (await service.listCompanyJobs(worker, { ...search, scope: 'mine' }))
        .total,
    ).toBe(1)
    expect(
      (await service.listCompanyJobs(other, { ...search, scope: 'mine' }))
        .total,
    ).toBe(0)
    expect(
      (await service.listCompanyJobs(worker, { ...search, status: 'en_route' }))
        .total,
    ).toBe(1)
    expect(
      (await service.listCompanyJobs(worker, { ...search, q: 'ინსტრუქცია' }))
        .total,
    ).toBe(14)
  })
  it('filters creation dates with inclusive Tbilisi calendar days across items, markers and totals', async () => {
    const points = []
    for (const [timestamp, located] of [
      ['2026-10-31T19:59:59.999Z', true],
      ['2026-10-31T20:00:00Z', false],
      ['2026-11-30T19:59:59.999Z', true],
      ['2026-11-30T20:00:00Z', true],
    ] as const) {
      const saved = await createPin(
        located ? {} : { longitude: null, latitude: null },
      )
      await sql().query(
        'UPDATE job SET created_at = $2::timestamptz WHERE id = $1',
        [saved.id, timestamp],
      )
      points.push(saved.id)
    }
    const november = await service.listCompanyJobs(worker, {
      ...search,
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(november.items.map((item) => item.id).sort()).toEqual(
      [points[1], points[2]].sort(),
    )
    expect(november.markers.map((item) => item.id)).toEqual([points[2]])
    expect(november).toMatchObject({
      total: 2,
      unmappedTotal: 1,
      mapTruncated: false,
    })
    expect(
      (
        await service.listCompanyJobs(worker, {
          ...search,
          from: '2026-11-01',
          to: '2026-11-01',
        })
      ).items.map((item) => item.id),
    ).toEqual([points[1]])
    expect(
      (
        await service.listCompanyJobs(worker, {
          ...search,
          from: '2026-10-01',
          to: '2026-10-31',
        })
      ).total,
    ).toBe(1)
    await expect(
      service.listCompanyJobs(worker, {
        ...search,
        from: '2026-02-30',
        to: '2026-03-01',
      }),
    ).rejects.toThrow('მოთხოვნა არასწორია')
  })
  it('stores, filters and completes generic jobs with or without a map position', async () => {
    const { id } = await createPin({ kind: 'other', title: 'სხვა სამუშაო' })
    const withoutPosition = await createPin({
      kind: 'other',
      title: 'ზოგადი სამუშაო',
      longitude: null,
      latitude: null,
    })
    await createPin()
    const result = await service.listCompanyJobs(worker, {
      ...search,
      kind: 'other',
    })
    expect(result).toMatchObject({ total: 2, unmappedTotal: 1 })
    expect(result.items.every((item) => item.kind === 'other')).toBe(true)
    expect(result.markers.map((item) => item.id)).toEqual([id])
    expect(await detail(withoutPosition.id)).toMatchObject({
      kind: 'other',
      longitude: null,
      latitude: null,
    })
    await transition(id, 'en_route', production)
    await transition(id, 'on_site', production)
    await transition(id, 'completed', production)
    expect(await detail(id)).toMatchObject({
      kind: 'other',
      status: 'completed',
    })
  })
  it('rolls back the job mutation if recording its history fails', async () => {
    const { id } = await createPin()
    await sql().query(
      "CREATE FUNCTION fail_job_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$; CREATE TRIGGER fail_job_event BEFORE INSERT ON job_event FOR EACH ROW EXECUTE FUNCTION fail_job_event();",
    )
    try {
      await expect(transition(id, 'en_route')).rejects.toThrow()
      await expect(
        service.editCompanyJob(manager, {
          ...fields,
          id,
          version: 1,
          title: 'არ უნდა შეინახოს',
        }),
      ).rejects.toThrow()
    } finally {
      await sql().query(
        'DROP TRIGGER fail_job_event ON job_event; DROP FUNCTION fail_job_event();',
      )
    }
    const record = await detail(id)
    expect(record.status).toBe('pending')
    expect(record.title).toBe(fields.title)
    expect(record.version).toBe(1)
    expect(record.assigneeId).toBeNull()
    expect(record.history).toHaveLength(1)
  })
  it('enforces database coordinate and assignment constraints', async () => {
    const { id } = await createPin()
    await expect(
      sql().query('UPDATE job SET latitude = 100 WHERE id = $1', [id]),
    ).rejects.toThrow()
    await expect(
      sql().query("UPDATE job SET status = 'completed' WHERE id = $1", [id]),
    ).rejects.toThrow()
    await transition(id, 'en_route', platformAdmin)
    await transition(id, 'rejected', platformAdmin, 'ობიექტი დაკეტილია')
    expect((await detail(id)).status).toBe('rejected')
  })
  it('persists both street names, searches either language, caches lookups and clears stale names on relocation failure', async () => {
    const { suggestCompanyJobAddress } =
      await import('./job-locations.service.server')
    geocoder.enabled = true
    await expect(suggestCompanyJobAddress(production, fields)).rejects.toThrow(
      'წვდომა',
    )
    expect(geocoder.request).not.toHaveBeenCalled()
    geocoder.request.mockImplementation(
      (
        _base: string,
        _request: unknown,
        language: string,
      ): Promise<Array<LocationFeature>> =>
        Promise.resolve([
          {
            sourceId: 'W:123',
            longitude: fields.longitude,
            latitude: fields.latitude,
            name:
              language === 'en' ? 'University Street' : 'უნივერსიტეტის ქუჩა',
            street: '',
            city: language === 'en' ? 'Tbilisi' : 'თბილისი',
            houseNumber: '',
            countryCode: 'GE',
            isStreet: true,
          },
        ]),
    )
    expect(await suggestCompanyJobAddress(manager, fields)).toBe(
      'უნივერსიტეტის ქუჩა, თბილისი',
    )
    const first = await createPin()
    await createPin()
    expect(geocoder.request).toHaveBeenCalledTimes(2)
    const saved = await detail(first.id)
    expect(saved.streetNameKa).toBe('უნივერსიტეტის ქუჩა')
    expect(saved.streetNameEn).toBe('University Street')
    expect(saved.locationResolvedAt).toEqual(expect.any(String))
    for (const q of ['უნივერსიტეტის', 'University Street'])
      expect(
        (await service.listCompanyJobs(worker, { ...search, q })).total,
      ).toBe(2)
    geocoder.request.mockRejectedValue(new Error('Provider unavailable'))
    await service.editCompanyJob(manager, {
      ...fields,
      id: first.id,
      version: 1,
      longitude: 44.81,
      address: 'ხელით მითითებული მისამართი',
    })
    const moved = await detail(first.id)
    expect(moved.streetNameKa).toBeNull()
    expect(moved.streetNameEn).toBeNull()
    expect(moved.locationResolvedAt).toBeNull()
    expect(moved.address).toBe('ხელით მითითებული მისამართი')
  })
  it('reserves provider requests globally and bounds the queue', async () => {
    const repository = await import('./job-locations.repository.server')
    const waits = await Promise.all(
      Array.from({ length: 3 }, () =>
        repository.reserveLocationRequest('test-provider'),
      ),
    )
    const ordered = waits.filter((wait) => wait !== null).sort((a, b) => a - b)
    expect(ordered).toHaveLength(3)
    expect(ordered[0]).toBeLessThan(100)
    expect(ordered[1]).toBeGreaterThan(900)
    expect(ordered[2]).toBeGreaterThan(1900)
    await sql().query(
      "UPDATE job_geocoding_gate SET next_request_at = clock_timestamp() + interval '1 minute' WHERE provider = 'test-provider'",
    )
    expect(await repository.reserveLocationRequest('test-provider')).toBeNull()
  })
  it('notifies selected roles for status changes and applies changes to the policy immediately', async () => {
    const settings =
      await import('#/features/notifications/server/notification-settings.service.server')
    await settings.saveNotificationSettings(platformAdmin, {
      jobNotificationRoles: ['supervisor'],
    })
    const { id } = await createPin()
    await transition(id, 'en_route')
    expect(
      (await sql().query('SELECT recipient_id FROM notification')).rows,
    ).toEqual([{ recipient_id: manager.id }])
    await settings.saveNotificationSettings(platformAdmin, {
      jobNotificationRoles: ['production_specialist'],
    })
    await transition(id, 'on_site', manager)
    const recipients = (
      await sql().query(
        "SELECT recipient_id FROM notification WHERE title='თანამშრომელი ადგილზე მივიდა' ORDER BY recipient_id",
      )
    ).rows.map((row) => row.recipient_id)
    expect(recipients).toEqual([other.id, production.id, worker.id].sort())
    await settings.saveNotificationSettings(platformAdmin, {
      jobNotificationRoles: [],
    })
    const count = (await sql().query('SELECT id FROM notification')).rows.length
    await transition(id, 'pending', manager, 'ხელახლა დაგეგმვა')
    expect(
      (await sql().query('SELECT id FROM notification')).rows,
    ).toHaveLength(count)
  })
  it('defaults creation alerts on, excludes the creator and readers, and deduplicates retries', async () => {
    const requestId = randomUUID()
    const result = await service.createCompanyJob(manager, {
      ...fields,
      requestId,
    })
    await service.createCompanyJob(manager, { ...fields, requestId })
    const notices = (
      await sql().query(
        'SELECT recipient_id, event_key, destination, body FROM notification ORDER BY recipient_id',
      )
    ).rows
    expect(notices.map((row) => row.recipient_id)).toEqual(
      [platformAdmin.id, other.id, production.id, worker.id].sort(),
    )
    expect(
      notices.every(
        (row) =>
          row.event_key === `job:${result.id}:created` &&
          row.destination.jobId === result.id,
      ),
    ).toBe(true)
    expect(
      notices.every(
        (row) =>
          row.body.includes(`სამუშაო: ${fields.title}`) &&
          row.body.includes(`შემქმნელი: ${manager.name}`) &&
          row.body.includes(`მისამართი: ${fields.address}`),
      ),
    ).toBe(true)
    expect(
      (await service.listCompanyJobs(worker, search)).items.some(
        (item) => item.id === result.id,
      ),
    ).toBe(true)
  })
  it('delivers a sales-manager job to every selected account through independent live inbox streams', async () => {
    const sales = actor('jobs-live-sales', ['sales_manager'])
    await sql().query(
      'INSERT INTO "user" (id,name,email,roles) VALUES ($1,$1,$2,$3)',
      [sales.id, 'live-sales@jobs.invalid', 'sales_manager'],
    )
    const { eventStreamResponse } =
      await import('#/lib/realtime/event-stream.server')
    const { notificationRealtimeHandler } =
      await import('#/features/notifications/server/notifications-stream.server')
    const recipients = [manager, platformAdmin, worker, other, production]
    const readers: Array<ReadableStreamDefaultReader<Uint8Array>> = []
    const ready: Array<Promise<void>> = []
    try {
      for (const recipient of recipients) {
        let snapshots = 0
        let connected = () => {}
        ready.push(
          new Promise<void>((resolve) => {
            connected = resolve
          }),
        )
        const response = eventStreamResponse(
          new Request('http://localhost/api/events'),
          {
            authorized: async () => true,
            accepts: (signal) => signal.recipientId === recipient.id,
            snapshot: async () => {
              if (++snapshots === 2) connected()
              return null
            },
            changed: (signal) =>
              notificationRealtimeHandler.changed(recipient, signal),
          },
        )
        if (!response.body) throw new Error('Missing event stream')
        const reader = response.body.getReader()
        readers.push(reader)
        await reader.read()
      }
      // The first stream waits for the shared PostgreSQL listener; later streams may attach after it is already connected.
      await ready[0]
      const { id } = await service.createCompanyJob(sales, {
        ...fields,
        longitude: null,
        latitude: null,
        requestId: randomUUID(),
      })
      for (let index = 0; index < readers.length; index++) {
        const frame = new TextDecoder().decode(
          (await readers[index].read()).value,
        )
        expect(frame).toContain('event: notifications')
        const data = JSON.parse(frame.split('data: ')[1])
        expect(data.recipientId).toBe(recipients[index].id)
        expect(data.notification.destination).toEqual({
          kind: 'job',
          jobId: id,
        })
        expect(data.notification.liveToast).toBe(true)
      }
      expect(
        (
          await sql().query(
            'SELECT recipient_id FROM notification ORDER BY recipient_id',
          )
        ).rows.map((row) => row.recipient_id),
      ).toEqual(recipients.map((recipient) => recipient.id).sort())
    } finally {
      await Promise.all(readers.map((reader) => reader.cancel()))
      await sql().query(
        'TRUNCATE payroll_award_proposal_version, payroll_award_proposal, payroll_award_pool_version, payroll_award_pool, payroll_award_source, job_employee, job_read, job_event, job, notification',
      )
      await sql().query('DELETE FROM "user" WHERE id=$1', [sales.id])
    }
  }, 15_000)
  it('respects selected roles and active account and employment status without granting job permissions', async () => {
    await sql().query(
      `UPDATE "user" SET permission_overrides='{"allow":[],"deny":["jobs.claim"]}' WHERE id=$1`,
      [other.id],
    )
    await sql().query(`UPDATE "user" SET access_state='invited' WHERE id=$1`, [
      production.id,
    ])
    await sql().query(
      `UPDATE employee SET status='inactive' WHERE user_id=$1`,
      [worker.id],
    )
    await sql().query(
      `UPDATE "user" SET permission_overrides='{"allow":["jobs.manage"],"deny":[]}' WHERE id=$1`,
      [ordinaryEmployee.id],
    )
    try {
      await createPin()
      expect(
        (
          await sql().query(
            'SELECT recipient_id FROM notification ORDER BY recipient_id',
          )
        ).rows.map((row) => row.recipient_id),
      ).toEqual([platformAdmin.id, other.id].sort())
    } finally {
      await sql().query(
        `UPDATE "user" SET permission_overrides='{"allow":[],"deny":[]}', access_state='active' WHERE id=ANY($1::text[])`,
        [[other.id, production.id, ordinaryEmployee.id]],
      )
      await sql().query(
        `UPDATE employee SET status='active' WHERE user_id=$1`,
        [worker.id],
      )
    }
  })
  it('allows only notification administrators to configure alerts and audits changes without hiding jobs', async () => {
    const settings =
      await import('#/features/notifications/server/notification-settings.service.server')
    await expect(settings.readNotificationSettings(worker)).rejects.toThrow()
    await expect(
      settings.saveNotificationSettings(manager, { jobNotificationRoles: [] }),
    ).rejects.toThrow()
    await expect(
      settings.saveNotificationSettings(platformAdmin, {
        jobNotificationRoles: ['unknown-role'],
      }),
    ).rejects.toThrow()
    expect(await settings.readNotificationSettings(platformAdmin)).toEqual({
      jobNotificationRoles: defaultJobNotificationRoles,
    })
    await settings.saveNotificationSettings(platformAdmin, {
      jobNotificationRoles: [],
    })
    const { id } = await createPin()
    expect(
      (await sql().query('SELECT id FROM notification')).rows,
    ).toHaveLength(0)
    expect(
      (await service.listCompanyJobs(worker, search)).items.some(
        (item) => item.id === id,
      ),
    ).toBe(true)
    expect(
      (
        await sql().query(
          'SELECT actor_id, before_roles, after_roles FROM notification_policy_audit',
        )
      ).rows,
    ).toEqual([
      {
        actor_id: platformAdmin.id,
        before_roles: defaultJobNotificationRoles,
        after_roles: [],
      },
    ])
    await settings.saveNotificationSettings(platformAdmin, {
      jobNotificationRoles: [],
    })
    expect(
      (await sql().query('SELECT id FROM notification_policy_audit')).rows,
    ).toHaveLength(1)
    await settings.saveNotificationSettings(platformAdmin, {
      jobNotificationRoles: defaultJobNotificationRoles,
    })
    await createPin()
    expect(
      (await sql().query('SELECT id FROM notification')).rows.length,
    ).toBeGreaterThan(0)
  })
  it('does not notify unchanged edits and broadcasts edits to selected roles only', async () => {
    const settings =
      await import('#/features/notifications/server/notification-settings.service.server')
    await settings.saveNotificationSettings(platformAdmin, {
      jobNotificationRoles: ['employee'],
    })
    const { id } = await createPin({ longitude: null, latitude: null })
    await transition(id, 'en_route')
    await sql().query('DELETE FROM notification')
    const edit = {
      ...fields,
      longitude: null,
      latitude: null,
      id,
      version: (await detail(id)).version,
    }
    await service.editCompanyJob(manager, edit)
    expect(
      (await sql().query('SELECT id FROM notification')).rows,
    ).toHaveLength(0)
    await service.editCompanyJob(manager, {
      ...edit,
      version: (await detail(id)).version,
      notes: 'შეცვლილი ინსტრუქცია',
    })
    expect(
      (await sql().query('SELECT recipient_id, destination FROM notification'))
        .rows,
    ).toEqual([
      {
        recipient_id: ordinaryEmployee.id,
        destination: { kind: 'job', jobId: id },
      },
    ])
    await expect(
      service.editCompanyJob(manager, { ...edit, notes: 'სხვა' }),
    ).rejects.toThrow()
    expect(
      (await sql().query('SELECT id FROM notification')).rows,
    ).toHaveLength(1)
  })
  it('delivers every job event once for overlapping selected roles without granting mutation access', async () => {
    const settings =
      await import('#/features/notifications/server/notification-settings.service.server')
    await settings.saveNotificationSettings(platformAdmin, {
      jobNotificationRoles: ['employee', 'production_specialist'],
    })
    await sql().query(
      `UPDATE "user" SET roles='employee,production_specialist' WHERE id=$1`,
      [ordinaryEmployee.id],
    )
    try {
      const { id } = await createPin({ longitude: null, latitude: null })
      await service.editCompanyJob(manager, {
        ...fields,
        longitude: null,
        latitude: null,
        id,
        version: 1,
        title: 'განახლებული სათაური',
      })
      await transition(id, 'en_route')
      const notices = (
        await sql().query(
          'SELECT event_key FROM notification WHERE recipient_id=$1',
          [ordinaryEmployee.id],
        )
      ).rows
      expect(notices).toHaveLength(3)
      expect(new Set(notices.map((row) => row.event_key)).size).toBe(3)
    } finally {
      await sql().query(`UPDATE "user" SET roles='employee' WHERE id=$1`, [
        ordinaryEmployee.id,
      ])
    }
    const { id } = await createPin({ longitude: null, latitude: null })
    await expect(
      service.transitionCompanyJob(ordinaryEmployee, {
        id,
        version: 1,
        status: 'en_route',
        note: '',
      }),
    ).rejects.toThrow()
  })
  it.each(['admin', 'owner'] as const)(
    'includes %s own actions in the inbox when selected, without duplicate action toasts',
    async (role) => {
      const settings =
        await import('#/features/notifications/server/notification-settings.service.server')
      await sql().query(
        `UPDATE "user" SET roles=$1, permission_overrides='{"allow":["jobs.manage"],"deny":[]}' WHERE id=$2`,
        [role, platformAdmin.id],
      )
      const current = actor(platformAdmin.id, [role])
      try {
        await settings.saveNotificationSettings(current, {
          jobNotificationRoles: [role],
        })
        const input = {
          ...fields,
          longitude: null,
          latitude: null,
          requestId: randomUUID(),
        }
        const { id } = await service.createCompanyJob(current, input)
        await service.createCompanyJob(current, input)
        await service.editCompanyJob(current, {
          ...fields,
          longitude: null,
          latitude: null,
          id,
          version: 1,
          notes: 'შეცვლილი ინსტრუქცია',
        })
        await transition(id, 'en_route', current)
        const notices = (
          await sql().query(
            'SELECT event_key, live_toast FROM notification WHERE recipient_id=$1',
            [current.id],
          )
        ).rows
        expect(notices).toHaveLength(3)
        expect(new Set(notices.map((row) => row.event_key)).size).toBe(3)
        expect(notices.every((row) => row.live_toast === false)).toBe(true)
        await settings.saveNotificationSettings(current, {
          jobNotificationRoles: ['employee'],
        })
        await service.editCompanyJob(current, {
          ...fields,
          longitude: null,
          latitude: null,
          id,
          version: 3,
          notes: 'შემდგომი ცვლილება',
        })
        expect(
          (
            await sql().query(
              'SELECT id FROM notification WHERE recipient_id=$1',
              [current.id],
            )
          ).rows,
        ).toHaveLength(3)
      } finally {
        await sql().query(
          `UPDATE "user" SET roles='admin', permission_overrides='{"allow":[],"deny":[]}' WHERE id=$1`,
          [platformAdmin.id],
        )
      }
    },
  )
  it('rolls back a job claim and its history if notification delivery fails', async () => {
    const { id } = await createPin()
    await sql().query(
      `CREATE FUNCTION fail_job_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test notification failure'; END $$; CREATE TRIGGER fail_job_notification BEFORE INSERT ON notification FOR EACH ROW EXECUTE FUNCTION fail_job_notification()`,
    )
    try {
      await expect(transition(id, 'en_route')).rejects.toThrow()
    } finally {
      await sql().query(
        'DROP TRIGGER fail_job_notification ON notification; DROP FUNCTION fail_job_notification()',
      )
    }
    const record = await detail(id)
    expect(record.status).toBe('pending')
    expect(record.history).toHaveLength(1)
  })

  it('accepts a full-length rejection reason and stores a bounded safe notification preview', async () => {
    const { id } = await createPin()
    await transition(id, 'en_route')
    await sql().query('DELETE FROM notification')
    await transition(id, 'rejected', worker, 'ა'.repeat(2000))
    const notice = (
      await sql().query(
        "SELECT recipient_id, body FROM notification WHERE recipient_id = 'jobs-manager'",
      )
    ).rows[0]
    expect(notice.recipient_id).toBe(manager.id)
    expect(notice.body.length).toBe(2000)
    expect((await detail(id)).status).toBe('rejected')
  })
})
