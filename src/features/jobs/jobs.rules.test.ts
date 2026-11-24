import { describe, expect, it } from 'vitest'
import {
  allowedJobTransitions,
  canManageJobs,
  canEditJob,
  canAssignJobs,
} from './jobs.rules'
import { hasPermission } from '#/lib/authorization/permissions'
import type { Actor } from '#/lib/authorization/actor'

const employee: Actor = {
  id: 'worker-a',
  name: 'თანამშრომელი',
  email: null,
  emailVerified: false,
  roles: ['employee'],
}
const manager: Actor = { ...employee, id: 'manager', roles: ['supervisor'] }
describe('shared map work policy', () => {
  it('restricts assignment to administrators, owners and production supervisors, honoring denies', () => {
    for (const role of ['admin', 'owner', 'supervisor'] as const) {
      expect(canAssignJobs({ ...employee, roles: [role] })).toBe(true)
      expect(
        canAssignJobs({
          ...employee,
          roles: [role],
          permissionOverrides: { allow: [], deny: ['jobs.assign'] },
        }),
      ).toBe(false)
    }
    for (const role of [
      'employee',
      'production_specialist',
      'sales_manager',
      'hr_manager',
    ] as const) {
      expect(canAssignJobs({ ...employee, roles: [role] })).toBe(false)
      expect(
        canAssignJobs({
          ...employee,
          roles: [role],
          permissionOverrides: { allow: ['jobs.assign'], deny: [] },
        }),
      ).toBe(false)
    }
  })
  it.each(['sales_manager', 'supervisor', 'employee'] as const)(
    'allows %s to edit and reopen only their own jobs',
    (role) => {
      const creator: Actor = { ...employee, roles: [role] }
      const own = {
        status: 'pending' as const,
        createdBy: creator.id,
        assigneeId: null,
      }
      const foreign = { ...own, createdBy: 'someone-else' }
      expect(canEditJob(creator, own)).toBe(true)
      expect(canEditJob(creator, foreign)).toBe(false)
      for (const status of ['completed', 'rejected'] as const) {
        expect(canEditJob(creator, { ...own, status })).toBe(false)
        expect(allowedJobTransitions(creator, { ...own, status })).toEqual([
          'pending',
        ])
        expect(allowedJobTransitions(creator, { ...foreign, status })).toEqual(
          [],
        )
      }
    },
  )
  it.each(['admin', 'owner'] as const)(
    'allows %s to edit and reopen other users’ jobs with an explicit grant',
    (role) => {
      const admin: Actor = { ...employee, roles: [role] }
      const job = {
        status: 'pending' as const,
        createdBy: 'someone-else',
        assigneeId: null,
      }
      expect(canEditJob(admin, job)).toBe(true)
      expect(
        allowedJobTransitions(admin, { ...job, status: 'completed' }),
      ).toEqual(['pending'])
      const denied = {
        ...admin,
        permissionOverrides: { allow: [], deny: ['jobs.edit.all' as const] },
      }
      expect(canEditJob(denied, job)).toBe(false)
      expect(
        allowedJobTransitions(denied, { ...job, status: 'completed' }),
      ).toEqual([])
    },
  )
  it('lets the production lead manage jobs without granting platform access or job claiming', () => {
    expect(hasPermission(manager.roles, 'manage.access')).toBe(true)
    expect(hasPermission(manager.roles, 'admin.access')).toBe(false)
    expect(hasPermission(manager.roles, 'jobs.claim')).toBe(false)
    expect(canManageJobs(manager)).toBe(true)
    expect(canManageJobs({ ...employee, roles: ['admin'] })).toBe(false)
  })
  it('allows only production specialists and administrators to claim unassigned work', () => {
    for (const roles of [['production_specialist'], ['admin']] as const)
      expect(
        allowedJobTransitions(
          { ...employee, roles: [...roles] },
          { createdBy: manager.id, status: 'pending', assigneeId: null },
        ),
      ).toContain('en_route')
    expect(
      allowedJobTransitions(
        { ...employee, roles: ['owner'] },
        { createdBy: manager.id, status: 'pending', assigneeId: null },
      ),
    ).toEqual(['completed', 'en_route', 'rejected'])
    for (const roles of [['employee'], ['hr_manager']] as const)
      expect(
        allowedJobTransitions(
          { ...employee, roles: [...roles] },
          { createdBy: manager.id, status: 'pending', assigneeId: null },
        ),
      ).toEqual([])
    expect(
      allowedJobTransitions(manager, {
        createdBy: manager.id,
        status: 'pending',
        assigneeId: null,
      }),
    ).toEqual(['completed', 'rejected'])
    expect(
      allowedJobTransitions(
        { ...manager, roles: ['supervisor', 'production_specialist'] },
        { createdBy: manager.id, status: 'pending', assigneeId: null },
      ),
    ).toEqual(['completed', 'en_route', 'rejected'])
  })
  it('restricts progress to the responsible employee and job managers', () => {
    const production: Actor = { ...employee, roles: ['production_specialist'] }
    expect(canManageJobs(production)).toBe(false)
    expect(
      allowedJobTransitions(production, {
        createdBy: manager.id,
        status: 'on_site',
        assigneeId: employee.id,
      }),
    ).toEqual(['completed', 'rejected'])
    expect(
      allowedJobTransitions(employee, {
        createdBy: manager.id,
        status: 'en_route',
        assigneeId: employee.id,
      }),
    ).toEqual(['on_site', 'rejected'])
    expect(
      allowedJobTransitions(employee, {
        createdBy: manager.id,
        status: 'on_site',
        assigneeId: employee.id,
      }),
    ).toEqual(['completed', 'rejected'])
    expect(
      allowedJobTransitions(employee, {
        createdBy: manager.id,
        status: 'on_site',
        assigneeId: 'another-worker',
      }),
    ).toEqual([])
    expect(
      allowedJobTransitions(manager, {
        createdBy: manager.id,
        status: 'on_site',
        assigneeId: 'another-worker',
      }),
    ).toContain('completed')
  })
  it('never skips arrival or permits employees to reopen terminal jobs', () => {
    expect(
      allowedJobTransitions(employee, {
        createdBy: manager.id,
        status: 'en_route',
        assigneeId: employee.id,
      }),
    ).not.toContain('completed')
    for (const status of ['completed', 'rejected'] as const) {
      expect(
        allowedJobTransitions(employee, {
          createdBy: manager.id,
          status,
          assigneeId: employee.id,
        }),
      ).toEqual([])
      expect(
        allowedJobTransitions(manager, {
          createdBy: manager.id,
          status,
          assigneeId: employee.id,
        }),
      ).toEqual(['pending'])
    }
  })

  it('lets admins finish other workers’ jobs and reopen terminal jobs', () => {
    const admin: Actor = { ...employee, roles: ['admin'] }
    expect(
      allowedJobTransitions(admin, {
        createdBy: manager.id,
        status: 'en_route',
        assigneeId: 'other',
      }),
    ).toEqual(['completed'])
    expect(
      allowedJobTransitions(admin, {
        createdBy: manager.id,
        status: 'on_site',
        assigneeId: 'other',
      }),
    ).toEqual(['completed'])
    expect(
      allowedJobTransitions(admin, {
        createdBy: manager.id,
        status: 'rejected',
        assigneeId: 'other',
      }),
    ).toEqual(['pending'])
    expect(
      allowedJobTransitions(admin, {
        createdBy: manager.id,
        status: 'completed',
        assigneeId: 'other',
      }),
    ).toEqual(['pending'])
    expect(
      allowedJobTransitions(
        { ...employee, roles: ['sales_manager'] },
        { createdBy: manager.id, status: 'pending', assigneeId: null },
      ),
    ).not.toContain('completed')
  })
})
