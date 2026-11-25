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
import type * as Service from './award-proposals.service.server'
import type * as Jobs from '#/features/jobs/server/job-award-evidence.service.server'
import type * as Pools from './award-pools.service.server'
import type { db as Database } from '#/db'
import type { Actor } from '#/lib/authorization/actor'

vi.mock('@tanstack/react-start/server-only', () => ({}))
const originalUrl = process.env.DATABASE_URL,
  databaseName = `team_adwings_award_test_${randomBytes(8).toString('hex')}`
let admin: pg.Client | undefined,
  connection: pg.Client | undefined,
  applicationDatabase: typeof Database | undefined,
  service: typeof Service,
  jobs: typeof Jobs,
  pools: typeof Pools,
  created = false,
  ruleId: string,
  employeeId: string
const actor: Actor = {
  id: 'award-accountant',
  name: 'ბუღალტერი',
  roles: ['accountant'],
  email: null,
  emailVerified: false,
}
function sql() {
  if (!connection) throw new Error('Isolated local database required')
  return connection
}
const input = (extra = {}) => ({
  proposalId: null,
  expectedVersion: 0,
  requestId: randomUUID(),
  userId: 'award-worker',
  ruleId,
  expectedRuleVersion: 1,
  workDate: '2026-11-25',
  jobId: null,
  reference: 'ACT-001',
  quantityMilli: 1250,
  evidence: 'დადასტურებული დამატებითი სამუშაო',
  reason: 'განაცხადის მომზადება',
  ...extra,
})
const detail = (proposalId: string, extra = {}) =>
  service.readAwardProposal(actor, { proposalId, ...extra })
const reviewer: Actor = { ...actor, id: 'award-admin', roles: ['admin'] }
const review = (proposalId: string, extra = {}) =>
  service.reviewAwardProposal(reviewer, {
    proposalId,
    expectedVersion: 1,
    requestId: randomUUID(),
    reason: 'მტკიცებულება დამოუკიდებლად გადამოწმებულია',
    decision: 'approved',
    evidenceVerified: true,
    ...extra,
  })
const poolInput = (extra = {}) => {
  const { proposalId: _id, userId: _userId, ...data } = input()
  return {
    ...data,
    poolId: null,
    allocations: [
      { userId: 'award-worker', amountMinor: 8000 },
      { userId: 'award-other', amountMinor: 7431 },
    ],
    ...extra,
  }
}
const poolDetail = (poolId: string) => pools.readAwardPool(actor, { poolId })
const poolReview = (poolId: string, extra = {}) =>
  pools.decideAwardPool(reviewer, {
    poolId,
    expectedVersion: 1,
    requestId: randomUUID(),
    reason: 'ყველა წილი და მტკიცებულება გადამოწმებულია',
    decision: 'approved',
    evidenceVerified: true,
    ...extra,
  })
async function rate(calculation = 'additional_work', kind = 'bonus') {
  const id = randomUUID()
  await sql().query('insert into payroll_bonus_rule(id) values ($1)', [id])
  await sql().query(
    `insert into payroll_bonus_rule_version(rule_id,version,effective_from,name,kind,calculation,unit_label,qualification,amount_minor,amount_basis,currency,enabled,actor_id,request_id,reason) values ($1,1,'2026-11-01','დამატებითი სამუშაო',$2,$3,$4,'დადასტურებული სამუშაო',12345,'gross','GEL',true,$5,$6,'დადასტურებული ტარიფი')`,
    [
      id,
      kind,
      calculation,
      calculation === 'additional_work' ? 'მეტრი' : '',
      actor.id,
      randomUUID(),
    ],
  )
  return id
}
async function completedJob() {
  const id = randomUUID()
  await sql().query(
    `insert into job(id,title,kind,status,assignee_id,created_by,request_id) values ($1,'მონტაჟი','installation','completed','award-worker','award-admin',$2)`,
    [id, randomUUID()],
  )
  await sql().query(
    `insert into job_event(job_id,actor_id,action,status,created_at) values ($1,'award-worker','status_changed','completed','2026-11-25T06:00:00Z')`,
    [id],
  )
  return id
}
describe.runIf(process.env.RUN_AWARD_DB_TESTS === '1')(
  'individual award proposals against PostgreSQL',
  () => {
    beforeAll(async () => {
      if (!originalUrl) throw new Error('Local database required')
      const target = new URL(originalUrl)
      if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
        throw new Error('Local database required')
      admin = new pg.Client({
        connectionString: originalUrl,
        connectionTimeoutMillis: 3000,
      })
      await admin.connect()
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      created = true
      target.pathname = `/${databaseName}`
      connection = new pg.Client({ connectionString: target.toString() })
      await connection.connect()
      for (const file of readdirSync('drizzle')
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort())
        await sql().query(
          readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        )
      for (const role of [
        'accountant',
        'admin',
        'hr_manager',
        'worker',
        'other',
      ]) {
        const id = `award-${role}`
        await sql().query(
          'insert into "user"(id,name,email,roles,access_state) values ($1,$1,$2,$3,\'active\')',
          [
            id,
            `${id}@example.invalid`,
            ['worker', 'other'].includes(role) ? 'employee' : role,
          ],
        )
        const person = await sql().query(
          'insert into employee(user_id,full_name,username,employment_revision) values ($1,$1,$1,1) returning id',
          [id],
        )
        if (role === 'worker') employeeId = person.rows[0].id
      }
      await sql().query(
        "insert into company_schedule(effective_from,timezone,late_grace_minutes,early_departure_grace_minutes) values ('2026-01-01','Asia/Tbilisi',0,0)",
      )
      process.env.DATABASE_URL = target.toString()
      vi.resetModules()
      applicationDatabase = (await import('#/db')).db
      service = await import('./award-proposals.service.server')
      pools = await import('./award-pools.service.server')
      jobs =
        await import('#/features/jobs/server/job-award-evidence.service.server')
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-25T12:00:00+04:00'))
    }, 30000)
    beforeEach(async () => {
      await sql().query(
        'truncate payroll_award_proposal_version,payroll_award_proposal,payroll_bonus_rule_version,payroll_bonus_rule,employee_employment_audit,employee_employment_period,job_event,job cascade',
      )
      await sql().query(
        "update employee set status='active',employment_revision=1",
      )
      await sql().query(
        `update "user" set access_state='active',permission_overrides='{"allow":[],"deny":[]}',roles=case when id='award-admin' then 'admin' when id='award-accountant' then 'accountant' when id='award-hr_manager' then 'hr_manager' else 'employee' end`,
      )
      await sql().query(
        "insert into employee_employment_period(employee_id,start_date) select id,'2026-11-01' from employee",
      )
      ruleId = await rate()
    })
    afterAll(async () => {
      vi.useRealTimers()
      await applicationDatabase?.$client.end()
      await connection?.end()
      process.env.DATABASE_URL = originalUrl
      if (admin) {
        if (created)
          await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
        await admin.end()
      }
    })
    it('requires independent attested approval and locks approved preparation until revocation', async () => {
      const saved = await service.saveAwardProposal(actor, input())
      await expect(
        service.reviewAwardProposal(actor, {
          proposalId: saved.proposalId,
          expectedVersion: 1,
          requestId: randomUUID(),
          reason: 'დამოუკიდებელი განხილვა',
          decision: 'approved',
          evidenceVerified: true,
        }),
      ).rejects.toThrow('მომმზადებელი')
      await expect(
        review(saved.proposalId, { evidenceVerified: false }),
      ).rejects.toThrow('გადამოწმება')
      const command = { requestId: randomUUID() }
      const approved = await review(saved.proposalId, command)
      expect(await review(saved.proposalId, command)).toEqual(approved)
      expect((await detail(saved.proposalId)).current).toMatchObject({
        status: 'approved',
        version: 2,
        evidenceVerified: true,
        actorName: reviewer.id,
        amountMinor: 15431,
      })
      await expect(
        service.saveAwardProposal(
          actor,
          input({ proposalId: saved.proposalId, expectedVersion: 2 }),
        ),
      ).rejects.toThrow('ჩაკეტილია')
      await review(saved.proposalId, {
        expectedVersion: 2,
        decision: 'revoked',
        evidenceVerified: false,
      })
      await service.saveAwardProposal(
        actor,
        input({ proposalId: saved.proposalId, expectedVersion: 3 }),
      )
      expect((await detail(saved.proposalId)).current.status).toBe('proposed')
    })
    it('denies beneficiaries, all historical preparers and freshly revoked review grants', async () => {
      const saved = await service.saveAwardProposal(actor, input())
      await sql().query(
        "update \"user\" set roles='accountant' where id='award-worker'",
      )
      await expect(
        service.reviewAwardProposal(
          { ...reviewer, id: 'award-worker' },
          {
            proposalId: saved.proposalId,
            expectedVersion: 1,
            requestId: randomUUID(),
            reason: 'დამოუკიდებელი განხილვა',
            decision: 'approved',
            evidenceVerified: true,
          },
        ),
      ).rejects.toThrow('ბენეფიციარი')
      await service.saveAwardProposal(
        reviewer,
        input({ proposalId: saved.proposalId, expectedVersion: 1 }),
      )
      await expect(
        review(saved.proposalId, { expectedVersion: 2 }),
      ).rejects.toThrow('მომმზადებელი')
      await expect(
        service.reviewAwardProposal(actor, {
          proposalId: saved.proposalId,
          expectedVersion: 2,
          requestId: randomUUID(),
          reason: 'დამოუკიდებელი განხილვა',
          decision: 'approved',
          evidenceVerified: true,
        }),
      ).rejects.toThrow('მომმზადებელი')
      await sql().query(
        `update "user" set permission_overrides='{"allow":[],"deny":["payroll.awards.review"]}' where id=$1`,
        [reviewer.id],
      )
      await expect(
        review(saved.proposalId, { expectedVersion: 2 }),
      ).rejects.toThrow()
    })
    it('revalidates employment and tariff revisions before accepting, but permits rejection of stale evidence', async () => {
      const saved = await service.saveAwardProposal(actor, input())
      await sql().query(
        'update employee set employment_revision=2 where id=$1',
        [employeeId],
      )
      await expect(review(saved.proposalId)).rejects.toThrow('შეიცვალა')
      expect((await detail(saved.proposalId)).total).toBe(1)
      await review(saved.proposalId, {
        decision: 'rejected',
        evidenceVerified: false,
      })
      await service.saveAwardProposal(
        actor,
        input({ proposalId: saved.proposalId, expectedVersion: 2 }),
      )
      await sql().query(
        'update payroll_bonus_rule_version set enabled=false where rule_id=$1',
        [ruleId],
      )
      await expect(
        review(saved.proposalId, { expectedVersion: 3 }),
      ).rejects.toThrow('წესი არ მოქმედებს')
    })
    it('allows one concurrent review and rejects source changes even when the job remains completed', async () => {
      const saved = await service.saveAwardProposal(actor, input())
      const results = await Promise.allSettled([
        review(saved.proposalId),
        review(saved.proposalId, {
          decision: 'rejected',
          evidenceVerified: false,
        }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const jobId = await completedJob(),
        jobRate = await rate('job')
      const jobProposal = await service.saveAwardProposal(
        actor,
        input({ ruleId: jobRate, jobId, reference: '', quantityMilli: 1000 }),
      )
      await sql().query('update job set version=2 where id=$1', [jobId])
      await expect(review(jobProposal.proposalId)).rejects.toThrow('შეიცვალა')
    })
    it('creates exact pool shares once, reserves allocation mode and prevents child bypass', async () => {
      const payload = poolInput(),
        saved = await pools.saveAwardPool(actor, payload)
      expect(await pools.saveAwardPool(actor, payload)).toEqual(saved)
      const record = await poolDetail(saved.poolId)
      expect(record).toMatchObject({
        current: { totalMinor: 15431, quantityMilli: 1250, status: 'proposed' },
        members: expect.any(Array),
      })
      expect(
        record.members.map((m) => m.current.amountMinor).sort((a, b) => a - b),
      ).toEqual([7431, 8000])
      expect(
        record.members.every((m) => m.current.allocation?.totalMinor === 15431),
      ).toBe(true)
      await expect(service.saveAwardProposal(actor, input())).rejects.toThrow(
        'ფონდ',
      )
      const member = record.members[0]
      await expect(
        service.withdrawAwardProposal(actor, {
          proposalId: member.proposalId,
          expectedVersion: 1,
          requestId: randomUUID(),
          reason: 'ცალკე წილის გაუქმება',
        }),
      ).rejects.toThrow('ფონდის წილი')
      await expect(review(member.proposalId)).rejects.toThrow('ფონდის წილი')
      await poolReview(saved.poolId)
      expect(
        (await poolDetail(saved.poolId)).members.every(
          (m) => m.current.status === 'approved' && m.current.version === 2,
        ),
      ).toBe(true)
      await expect(
        pools.saveAwardPool(
          actor,
          poolInput({ poolId: saved.poolId, expectedVersion: 2 }),
        ),
      ).rejects.toThrow('ჩაკეტილია')
      await poolReview(saved.poolId, {
        expectedVersion: 2,
        decision: 'revoked',
        evidenceVerified: false,
      })
      expect(
        (await poolDetail(saved.poolId)).members.every(
          (m) => m.current.status === 'revoked',
        ),
      ).toBe(true)
    })
    it('rejects invalid pool totals, duplicate members, own shares and individual source overlap atomically', async () => {
      await expect(
        pools.saveAwardPool(
          actor,
          poolInput({
            allocations: [
              { userId: 'award-worker', amountMinor: 8000 },
              { userId: 'award-other', amountMinor: 7430 },
            ],
          }),
        ),
      ).rejects.toThrow('ზუსტად')
      await expect(
        pools.saveAwardPool(
          actor,
          poolInput({
            allocations: [
              { userId: 'award-worker', amountMinor: 8000 },
              { userId: 'award-worker', amountMinor: 7431 },
            ],
          }),
        ),
      ).rejects.toThrow('განმეორდეს')
      await expect(
        pools.saveAwardPool(
          actor,
          poolInput({
            allocations: [
              { userId: actor.id, amountMinor: 8000 },
              { userId: 'award-other', amountMinor: 7431 },
            ],
          }),
        ),
      ).rejects.toThrow('საკუთარი')
      expect(
        (
          await sql().query(
            'select count(*)::int as total from payroll_award_pool',
          )
        ).rows[0].total,
      ).toBe(0)
      const saved = await service.saveAwardProposal(actor, input())
      await service.withdrawAwardProposal(actor, {
        proposalId: saved.proposalId,
        expectedVersion: 1,
        requestId: randomUUID(),
        reason: 'დამატებითი შემოწმება',
      })
      await expect(pools.saveAwardPool(actor, poolInput())).rejects.toThrow(
        'ინდივიდუალური',
      )
    })
    it('retains withdrawn and removed shares, resubmits the same pool and blocks historic beneficiaries from review', async () => {
      const saved = await pools.saveAwardPool(actor, poolInput())
      const first = await poolDetail(saved.poolId),
        removed = first.members.find((m) => m.userId === 'award-other')!
      await pools.saveAwardPool(
        actor,
        poolInput({
          poolId: saved.poolId,
          expectedVersion: 1,
          allocations: [
            { userId: 'award-worker', amountMinor: 8000 },
            { userId: 'award-admin', amountMinor: 7431 },
          ],
        }),
      )
      expect((await detail(removed.proposalId)).current.status).toBe(
        'withdrawn',
      )
      await pools.saveAwardPool(
        actor,
        poolInput({ poolId: saved.poolId, expectedVersion: 2 }),
      )
      await expect(
        poolReview(saved.poolId, { expectedVersion: 3 }),
      ).rejects.toThrow('ბენეფიციარი')
      await pools.withdrawAwardPool(actor, {
        poolId: saved.poolId,
        expectedVersion: 3,
        requestId: randomUUID(),
        reason: 'მტკიცებულება დასაზუსტებელია',
      })
      expect(
        (await poolDetail(saved.poolId)).members.every(
          (m) => m.current.status === 'withdrawn',
        ),
      ).toBe(true)
      await pools.saveAwardPool(
        actor,
        poolInput({ poolId: saved.poolId, expectedVersion: 4 }),
      )
      const next = await poolDetail(saved.poolId)
      expect(next.current).toMatchObject({ version: 5, status: 'proposed' })
      expect(
        next.members.find((m) => m.userId === 'award-other')?.proposalId,
      ).toBe(removed.proposalId)
    })
    it('rechecks every pool beneficiary and rolls the entire decision back if one changed', async () => {
      const saved = await pools.saveAwardPool(actor, poolInput())
      await sql().query(
        "update employee set employment_revision=2 where user_id='award-other'",
      )
      await expect(poolReview(saved.poolId)).rejects.toThrow('შეიცვალა')
      const unchanged = await poolDetail(saved.poolId)
      expect(unchanged.total).toBe(1)
      expect(
        unchanged.members.every(
          (m) => m.current.status === 'proposed' && m.current.version === 1,
        ),
      ).toBe(true)
      await poolReview(saved.poolId, {
        decision: 'rejected',
        evidenceVerified: false,
      })
      expect(
        (await poolDetail(saved.poolId)).members.every(
          (m) => m.current.status === 'rejected',
        ),
      ).toBe(true)
    })
    it('serializes competing allocation modes and competing pool decisions', async () => {
      const race = await Promise.allSettled([
        pools.saveAwardPool(actor, poolInput()),
        service.saveAwardProposal(actor, input()),
      ])
      expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const saved = await pools.saveAwardPool(
        actor,
        poolInput({ reference: 'POOL-SECOND' }),
      )
      const decisions = await Promise.allSettled([
        poolReview(saved.poolId),
        poolReview(saved.poolId, {
          decision: 'rejected',
          evidenceVerified: false,
        }),
      ])
      expect(decisions.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect((await poolDetail(saved.poolId)).total).toBe(2)
    })
    it('retains beneficiary, exact quantity, applicable rate, evidence and trusted author without posting salary', async () => {
      const saved = await service.saveAwardProposal(actor, input()),
        record = await detail(saved.proposalId)
      expect(record).toMatchObject({
        userId: 'award-worker',
        current: {
          quantityMilli: 1250,
          amountMinor: 15431,
          status: 'proposed',
          rule: { version: 1, amountMinor: 12345 },
          actorName: actor.id,
          sourceSnapshot: { employmentRevision: 1, timezone: 'Asia/Tbilisi' },
        },
      })
      expect(JSON.stringify(record)).not.toMatch(/commandHash|requestId/)
      expect(
        (
          await sql().query(
            'select count(*)::int as total from employee_salary_term',
          )
        ).rows[0].total,
      ).toBe(0)
    })
    it('retries commands exactly once and rejects changed retries or fresh duplicate source claims', async () => {
      const payload = input(),
        results = await Promise.all([
          service.saveAwardProposal(actor, payload),
          service.saveAwardProposal(actor, payload),
        ])
      expect(results[0]).toEqual(results[1])
      expect(
        await service.saveAwardProposal(actor, {
          ...payload,
          requestId: payload.requestId.toUpperCase(),
          ruleId: payload.ruleId.toUpperCase(),
        }),
      ).toEqual(results[0])
      expect((await detail(results[0].proposalId)).total).toBe(1)
      await expect(
        service.saveAwardProposal(actor, { ...payload, quantityMilli: 2000 }),
      ).rejects.toThrow('მოთხოვნის მონაცემები შეიცვალა')
      await expect(
        service.saveAwardProposal(
          actor,
          input({ reference: '  act-００１  ' }),
        ),
      ).rejects.toThrow('უკვე არსებობს')
    })
    it('prevents duplicate concurrent claims even with different command identities', async () => {
      const results = await Promise.allSettled([
        service.saveAwardProposal(actor, input()),
        service.saveAwardProposal(actor, input()),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect((await service.readAwardProposals(actor, {})).total).toBe(1)
    })
    it('retains corrections, withdrawal and resubmission without releasing the source identity', async () => {
      const saved = await service.saveAwardProposal(actor, input())
      await service.saveAwardProposal(
        actor,
        input({
          proposalId: saved.proposalId,
          expectedVersion: 1,
          quantityMilli: 2000,
        }),
      )
      await service.withdrawAwardProposal(actor, {
        proposalId: saved.proposalId,
        expectedVersion: 2,
        requestId: randomUUID(),
        reason: 'დამატებითი გადამოწმება',
      })
      expect((await detail(saved.proposalId)).current.status).toBe('withdrawn')
      await expect(service.saveAwardProposal(actor, input())).rejects.toThrow(
        'უკვე არსებობს',
      )
      await service.saveAwardProposal(
        actor,
        input({ proposalId: saved.proposalId, expectedVersion: 3 }),
      )
      expect(await detail(saved.proposalId)).toMatchObject({
        total: 4,
        current: { version: 4, status: 'proposed' },
      })
      expect((await detail(saved.proposalId, { q: 'დამატებითი' })).total).toBe(
        1,
      )
      expect((await detail(saved.proposalId, { q: '%' })).total).toBe(0)
      await expect(
        service.saveAwardProposal(
          actor,
          input({
            proposalId: saved.proposalId,
            expectedVersion: 4,
            reference: 'OTHER',
          }),
        ),
      ).rejects.toThrow('უცვლელია')
    })
    it('rejects stale corrections and snapshots previous rule versions after later changes', async () => {
      const saved = await service.saveAwardProposal(actor, input())
      await sql().query(
        `insert into payroll_bonus_rule_version(rule_id,version,effective_from,name,kind,calculation,unit_label,qualification,amount_minor,amount_basis,currency,enabled,actor_id,request_id,reason) select rule_id,2,effective_from,name,kind,calculation,unit_label,qualification,20000,amount_basis,currency,enabled,actor_id,$2,reason from payroll_bonus_rule_version where rule_id=$1`,
        [ruleId, randomUUID()],
      )
      expect((await detail(saved.proposalId)).current.rule.amountMinor).toBe(
        12345,
      )
      await expect(
        service.saveAwardProposal(
          actor,
          input({ proposalId: saved.proposalId, expectedVersion: 1 }),
        ),
      ).rejects.toThrow('წესი არ მოქმედებს ან შეიცვალა')
      const results = await Promise.allSettled(
        [1, 2].map((n) =>
          service.saveAwardProposal(
            actor,
            input({
              proposalId: saved.proposalId,
              expectedVersion: 1,
              expectedRuleVersion: 2,
              quantityMilli: n * 1000,
            }),
          ),
        ),
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect((await detail(saved.proposalId)).total).toBe(2)
    })
    it('independently verifies job completion and assigned beneficiary through the jobs contract', async () => {
      const jobId = await completedJob(),
        jobRate = await rate('job')
      const saved = await service.saveAwardProposal(
        actor,
        input({ ruleId: jobRate, jobId, reference: '', quantityMilli: 1000 }),
      )
      expect((await detail(saved.proposalId)).current).toMatchObject({
        completionEventId: expect.any(String),
        sourceSnapshot: {
          jobTitle: 'მონტაჟი',
          jobVersion: 1,
          completedBy: 'award-worker',
        },
      })
      await expect(
        service.saveAwardProposal(
          actor,
          input({
            ruleId: jobRate,
            jobId,
            userId: 'award-other',
            reference: '',
            quantityMilli: 1000,
          }),
        ),
      ).rejects.toThrow('შემსრულებლად')
      await expect(
        applicationDatabase!.transaction((tx) =>
          jobs.getCompletedJobAwardEvidence(
            tx,
            { ...actor, id: 'award-worker' },
            { jobId, userId: 'award-worker' },
          ),
        ),
      ).rejects.toThrow()
      const choices = await service.lookupAwardInputs(actor, {
        kind: 'job',
        workDate: '2026-11-25',
        userId: 'award-worker',
      })
      expect(choices.records[0].id).toBe(jobId)
      expect(
        (
          await service.lookupAwardInputs(actor, {
            kind: 'job',
            workDate: '2026-11-24',
            userId: 'award-worker',
          })
        ).records,
      ).toEqual([])
    })
    it('does not create another claim after reopening and completing the same job again', async () => {
      const jobId = await completedJob(),
        jobRate = await rate('job'),
        payload = input({
          ruleId: jobRate,
          jobId,
          reference: '',
          quantityMilli: 1000,
        })
      const saved = await service.saveAwardProposal(actor, payload),
        first = (await detail(saved.proposalId)).current.completionEventId
      await sql().query(
        "update job set status='pending',assignee_id=null,version=2 where id=$1",
        [jobId],
      )
      expect(
        (
          await service.lookupAwardInputs(actor, {
            kind: 'job',
            workDate: '2026-11-25',
            userId: 'award-worker',
          })
        ).records,
      ).toEqual([])
      await sql().query(
        "update job set status='completed',assignee_id='award-worker',version=3 where id=$1",
        [jobId],
      )
      await sql().query(
        "insert into job_event(job_id,actor_id,action,status,created_at) values ($1,'award-worker','status_changed','completed','2026-11-25T07:00:00Z')",
        [jobId],
      )
      await expect(
        service.saveAwardProposal(actor, {
          ...payload,
          requestId: randomUUID(),
        }),
      ).rejects.toThrow('უკვე არსებობს')
      await service.saveAwardProposal(actor, {
        ...payload,
        proposalId: saved.proposalId,
        expectedVersion: 1,
        requestId: randomUUID(),
      })
      expect(
        (await detail(saved.proposalId)).current.completionEventId,
      ).not.toBe(first)
      expect((await service.readAwardProposals(actor, {})).total).toBe(1)
    })
    it('requires confirmed eligible dates, applicable active rules and non-future work', async () => {
      await sql().query(
        'delete from employee_employment_period where employee_id=$1',
        [employeeId],
      )
      await expect(service.saveAwardProposal(actor, input())).rejects.toThrow(
        'დასაქმების პერიოდი',
      )
      await expect(
        service.saveAwardProposal(actor, input({ workDate: '2026-11-26' })),
      ).rejects.toThrow('მომავალში')
      await sql().query(
        'update payroll_bonus_rule_version set enabled=false where rule_id=$1',
        [ruleId],
      )
      expect(
        (
          await service.lookupAwardInputs(actor, {
            kind: 'rule',
            workDate: '2026-11-25',
          })
        ).records,
      ).toEqual([])
      await expect(service.saveAwardProposal(actor, input())).rejects.toThrow(
        'წესი არ მოქმედებს',
      )
    })
    it('supports fixed premiums and whole task quantities while rejecting fractional task counts', async () => {
      const premium = await rate('fixed', 'premium'),
        task = await rate('task')
      expect(
        (
          await detail(
            (
              await service.saveAwardProposal(
                actor,
                input({ ruleId: premium, quantityMilli: 1000 }),
              )
            ).proposalId,
          )
        ).current.rule.kind,
      ).toBe('premium')
      await expect(
        service.saveAwardProposal(
          actor,
          input({ ruleId: task, quantityMilli: 1500 }),
        ),
      ).rejects.toThrow('მთელი რიცხვი')
      expect(
        (
          await detail(
            (
              await service.saveAwardProposal(
                actor,
                input({ ruleId: task, quantityMilli: 2000 }),
              )
            ).proposalId,
          )
        ).current.amountMinor,
      ).toBe(24690)
    })
    it('enforces fresh read/proposal permissions, inactive accounts and self-proposal denial', async () => {
      await expect(service.readAwardProposals(null, {})).rejects.toThrow()
      await expect(
        service.saveAwardProposal(
          { ...actor, id: 'award-hr_manager' },
          input(),
        ),
      ).rejects.toThrow()
      await expect(
        service.saveAwardProposal(actor, input({ userId: actor.id })),
      ).rejects.toThrow('საკუთარი')
      const payload = input()
      await service.saveAwardProposal(actor, payload)
      await sql().query(
        `update "user" set permission_overrides='{"allow":[],"deny":["payroll.awards.propose"]}' where id=$1`,
        [actor.id],
      )
      expect((await service.readAwardProposals(actor, {})).total).toBe(1)
      await expect(service.saveAwardProposal(actor, payload)).rejects.toThrow()
      await expect(
        service.lookupAwardInputs(actor, {
          kind: 'employee',
          workDate: '2026-11-25',
        }),
      ).rejects.toThrow()
      await sql().query(
        'update "user" set access_state=\'suspended\' where id=$1',
        [actor.id],
      )
      await expect(service.readAwardProposals(actor, {})).rejects.toThrow()
    })
    it('bounds and searches proposal lists without exposing internal command fields', async () => {
      for (let n = 0; n < 21; n++)
        await service.saveAwardProposal(actor, input({ reference: `ACT-${n}` }))
      expect((await service.readAwardProposals(actor, {})).items).toHaveLength(
        20,
      )
      expect(
        (await service.readAwardProposals(actor, { page: 2 })).items,
      ).toHaveLength(1)
      expect((await service.readAwardProposals(actor, { q: '%' })).total).toBe(
        0,
      )
      expect(
        (
          await service.lookupAwardInputs(actor, {
            kind: 'employee',
            workDate: '2026-11-25',
          })
        ).records.some((r) => r.id === actor.id),
      ).toBe(false)
    })
    it('rolls back source claims when the immutable audit write fails', async () => {
      await sql().query(
        "create function reject_award_version() returns trigger language plpgsql as $$ begin raise exception 'test'; end $$",
      )
      await sql().query(
        'create trigger reject_award_version before insert on payroll_award_proposal_version for each row execute function reject_award_version()',
      )
      try {
        await expect(
          service.saveAwardProposal(actor, input()),
        ).rejects.toThrow()
        await expect(pools.saveAwardPool(actor, poolInput())).rejects.toThrow()
      } finally {
        await sql().query(
          'drop trigger reject_award_version on payroll_award_proposal_version',
        )
        await sql().query('drop function reject_award_version()')
      }
      expect(
        (
          await sql().query(
            'select count(*)::int as total from payroll_award_proposal',
          )
        ).rows[0].total,
      ).toBe(0)
      expect(
        (
          await sql().query(
            'select count(*)::int as total from payroll_award_pool',
          )
        ).rows[0].total,
      ).toBe(0)
      expect(
        (
          await sql().query(
            'select count(*)::int as total from payroll_award_source',
          )
        ).rows[0].total,
      ).toBe(0)
    })
    it('permits a review-only actor to revalidate native evidence without granting proposal pickers', async () => {
      const jobId = await completedJob(),
        jobRate = await rate('job')
      const saved = await service.saveAwardProposal(
        actor,
        input({ ruleId: jobRate, jobId, reference: '', quantityMilli: 1000 }),
      )
      await sql().query(
        `update "user" set permission_overrides='{"allow":["payroll.read.all","payroll.awards.review"],"deny":[]}' where id='award-hr_manager'`,
      )
      const reviewOnly: Actor = {
        ...actor,
        id: 'award-hr_manager',
        roles: ['hr_manager'],
      }
      await expect(
        service.lookupAwardInputs(reviewOnly, {
          kind: 'job',
          userId: 'award-worker',
          workDate: '2026-11-25',
        }),
      ).rejects.toThrow()
      await service.reviewAwardProposal(reviewOnly, {
        proposalId: saved.proposalId,
        expectedVersion: 1,
        requestId: randomUUID(),
        reason: 'სამუშაო და ბენეფიციარი გადამოწმებულია',
        decision: 'approved',
        evidenceVerified: true,
      })
      expect((await detail(saved.proposalId)).current.status).toBe('approved')
    })
    it('rolls back the parent and every share when a review audit write fails', async () => {
      const saved = await pools.saveAwardPool(actor, poolInput())
      await sql().query(
        "create function reject_pool_review() returns trigger language plpgsql as $$ begin raise exception 'test'; end $$",
      )
      await sql().query(
        'create trigger reject_pool_review before insert on payroll_award_proposal_version for each row execute function reject_pool_review()',
      )
      try {
        await expect(poolReview(saved.poolId)).rejects.toThrow()
      } finally {
        await sql().query(
          'drop trigger reject_pool_review on payroll_award_proposal_version',
        )
        await sql().query('drop function reject_pool_review()')
      }
      const view = await poolDetail(saved.poolId)
      expect(view.current.status).toBe('proposed')
      expect(view.total).toBe(1)
      expect(view.members.every((m) => m.current.version === 1)).toBe(true)
    })
  },
)
