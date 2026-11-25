import '@tanstack/react-start/server-only'
import { createHash, randomUUID } from 'node:crypto'
import { hasPermission } from '#/lib/authorization/permissions'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import { normalizeAwardReference } from '../award-proposals.schemas'
import {
  awardPoolDetailSchema,
  withdrawAwardPoolSchema,
  saveAwardPoolSchema,
  reviewPoolSchema,
} from '../award-review.schemas'
import { proposedAwardAmount } from '../award-proposals.rules'
import {
  AwardProposalError,
  authorizeAward,
} from './award-proposals.policy.server'
import {
  resolveAwardEvidence,
  assertEvidenceUnchanged,
} from './award-evidence.service.server'
import { ruleFact, awardView } from './award-proposals.service.server'
import * as awards from './award-proposals.repository.server'
import * as repository from './award-pools.repository.server'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { Actor } from '#/lib/authorization/actor'
import type { AwardPoolDetail, PoolVersion } from '../award-pools.types'
import type { payrollAwardPoolVersion } from '#/db/schema'

const hash = (action: string, input: unknown) =>
  createHash('sha256').update(JSON.stringify({ action, input })).digest('hex')
async function replay(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
  commandHash: string,
) {
  await awards.commandLock(tx, `pool-command:${actorId}:${requestId}`)
  const prior = await repository.command(tx, actorId, requestId)
  if (!prior) return null
  if (prior.commandHash !== commandHash)
    throw new AwardProposalError(
      'ამ მოთხოვნის მონაცემები შეიცვალა. განაახლეთ ფონდი.',
    )
  return { poolId: prior.poolId, version: prior.version }
}
async function appendChild(
  tx: PayrollTransaction,
  root: Awaited<ReturnType<typeof awards.lockProposal>>,
  facts: Omit<
    Parameters<typeof awards.appendVersion>[1],
    'proposalId' | 'version' | 'requestId' | 'commandHash'
  >,
  parentHash: string,
) {
  if (!root) throw new AwardProposalError('ფონდის წილი ვერ მოიძებნა.')
  const version = root.version + 1
  await awards.appendVersion(tx, {
    ...facts,
    proposalId: root.id,
    version,
    requestId: randomUUID(),
    commandHash: hash('pool-share', {
      parentHash,
      proposalId: root.id,
      version,
    }),
  })
  await awards.setCurrent(tx, root.id, version, facts.status)
}
export async function saveAwardPool(actor: Actor | null, input: unknown) {
  const data = saveAwardPoolSchema.parse(input),
    commandHash = hash('prepare', data)
  return awards.transactAwards(async (tx) => {
    const current = await authorizeAward(tx, actor, 'propose'),
      prior = await replay(tx, current.id, data.requestId, commandHash)
    if (prior) return prior
    if (data.allocations.some((a) => a.userId === current.id))
      throw new AwardProposalError(
        'საკუთარი წილის მომზადება დაუშვებელია. მიმართეთ სხვა უფლებამოსილ პირს.',
      )
    const sourceType = data.jobId ? ('job' as const) : ('external' as const),
      sourceKey = data.jobId ?? normalizeAwardReference(data.reference)
    if (
      (await awards.sourceMode(
        tx,
        data.ruleId,
        sourceType,
        sourceKey,
        'pool',
      )) !== 'pool'
    )
      throw new AwardProposalError(
        'ამ წყაროზე ინდივიდუალური განაცხადები არსებობს. განიხილეთ არსებული განაცხადები.',
      )
    const existing = data.poolId ? await repository.lock(tx, data.poolId) : null
    if (data.poolId && !existing)
      throw new AwardProposalError('ფონდი ვერ მოიძებნა.')
    if (
      existing &&
      (existing.ruleId !== data.ruleId ||
        existing.sourceType !== sourceType ||
        existing.sourceKey !== sourceKey)
    )
      throw new AwardProposalError('ფონდის წესი და წყარო უცვლელია.')
    if ((existing?.version ?? 0) !== data.expectedVersion)
      throw new AwardProposalError('ფონდი შეიცვალა. განაახლეთ მონაცემები.')
    if (existing?.status === 'approved')
      throw new AwardProposalError(
        'დამტკიცებული ფონდი ჩაკეტილია. ცვლილებამდე გააუქმეთ დამტკიცება.',
      )
    if (
      existing &&
      (await repository.wasBeneficiary(tx, existing.id, current.id))
    )
      throw new AwardProposalError('საკუთარი წილის მქონე ფონდს ვერ შეცვლით.')
    const other = await repository.bySource(
      tx,
      data.ruleId,
      sourceType,
      sourceKey,
    )
    if (other && other.id !== existing?.id)
      throw new AwardProposalError(
        'ამ წყაროს ფონდი უკვე არსებობს. შეცვალეთ არსებული ფონდი.',
      )
    const resolved = []
    for (const allocation of [...data.allocations].sort((a, b) =>
      a.userId.localeCompare(b.userId),
    )) {
      const inputs = await resolveAwardEvidence(tx, current, {
        ...data,
        userId: allocation.userId,
      })
      resolved.push({ ...inputs, allocation })
    }
    const rate = resolved[0].rate
    let totalMinor: number
    try {
      totalMinor = proposedAwardAmount(
        rate.amountMinor,
        data.quantityMilli,
        rate.calculation,
      )
    } catch (error) {
      throw new AwardProposalError(
        error instanceof Error ? error.message : 'ფონდის თანხა არასწორია.',
      )
    }
    if (
      data.allocations.reduce((sum, a) => sum + a.amountMinor, 0) !== totalMinor
    )
      throw new AwardProposalError(
        'ბენეფიციარების წილების ჯამი ფონდის თანხას ზუსტად უნდა უდრიდეს.',
      )
    const root =
      existing ??
      (await repository.create(tx, {
        ruleId: data.ruleId,
        sourceType,
        sourceKey,
        jobId: data.jobId,
        version: 1,
        status: 'proposed',
      }))
    const active = existing ? await repository.activeMembers(tx, root.id) : []
    if (active.length > 20)
      throw new AwardProposalError('ფონდის წილები გადასამოწმებელია.')
    const version = data.expectedVersion + 1
    const recorded = await repository.append(tx, {
      poolId: root.id,
      version,
      status: 'proposed',
      ruleVersionId: rate.id,
      workDate: data.workDate,
      quantityMilli: data.quantityMilli,
      totalMinor,
      reference: data.reference,
      evidence: data.evidence,
      allocations: resolved.map((r) => ({
        userId: r.person.userId,
        name: r.person.name,
        amountMinor: r.allocation.amountMinor,
      })),
      actorId: current.id,
      reason: data.reason,
      requestId: data.requestId,
      commandHash,
    })
    const included = new Set(resolved.map((r) => r.person.id))
    for (const member of active.filter((m) => !included.has(m.employeeId))) {
      const previous = await awards.rawCurrent(tx, member.id, member.version)
      if (!previous)
        throw new AwardProposalError('წილის ისტორია გადასამოწმებელია.')
      const {
        id: _id,
        createdAt: _at,
        proposalId: _proposalId,
        version: _version,
        requestId: _requestId,
        commandHash: _hash,
        ...facts
      } = previous
      await appendChild(
        tx,
        member,
        {
          ...facts,
          status: 'withdrawn',
          evidenceVerified: false,
          actorId: current.id,
          reason: data.reason,
        },
        commandHash,
      )
    }
    for (const r of resolved) {
      const claimed = await awards.claim(
        tx,
        data.ruleId,
        r.person.id,
        sourceType,
        sourceKey,
      )
      let member = claimed ? await awards.lockProposal(tx, claimed.id) : null
      if (member && member.poolId !== root.id)
        throw new AwardProposalError(
          'ერთ-ერთი ბენეფიციარის წყაროს განაცხადი უკვე არსებობს.',
        )
      const facts = {
        status: 'proposed' as const,
        poolVersionId: recorded.id,
        ruleVersionId: rate.id,
        workDate: data.workDate,
        quantityMilli: data.quantityMilli,
        amountMinor: r.allocation.amountMinor,
        reference: data.reference,
        evidence: data.evidence,
        completionEventId: r.completionEventId,
        sourceSnapshot: r.sourceSnapshot,
        evidenceVerified: false,
        actorId: current.id,
        reason: data.reason,
      }
      if (!member) {
        member = await awards.createProposal(tx, {
          ruleId: data.ruleId,
          employeeId: r.person.id,
          sourceType,
          sourceKey,
          jobId: data.jobId,
          poolId: root.id,
          version: 1,
          status: 'proposed',
        })
        await awards.appendVersion(tx, {
          ...facts,
          proposalId: member.id,
          version: 1,
          requestId: randomUUID(),
          commandHash: hash('pool-share', {
            commandHash,
            proposalId: member.id,
            version: 1,
          }),
        })
      } else await appendChild(tx, member, facts, commandHash)
    }
    if (existing) await repository.setCurrent(tx, root.id, version, 'proposed')
    return { poolId: root.id, version }
  })
}
export async function decideAwardPool(actor: Actor | null, input: unknown) {
  const data = reviewPoolSchema.parse(input),
    commandHash = hash('review', data)
  return awards.transactAwards(async (tx) => {
    const current = await authorizeAward(tx, actor, 'review'),
      prior = await replay(tx, current.id, data.requestId, commandHash)
    if (prior) return prior
    const peek = await repository.peek(tx, data.poolId)
    if (!peek) throw new AwardProposalError('ფონდი ვერ მოიძებნა.')
    await awards.sourceMode(tx, peek.ruleId, peek.sourceType, peek.sourceKey)
    const root = await repository.lock(tx, peek.id)
    if (!root || root.version !== data.expectedVersion)
      throw new AwardProposalError('ფონდი შეიცვალა. განაახლეთ მონაცემები.')
    if (!(await repository.mayReview(tx, root.id, current.id)))
      throw new AwardProposalError(
        'მომმზადებელი ან ბენეფიციარი ფონდის განხილვაში ვერ მონაწილეობს.',
      )
    if (
      data.decision === 'revoked'
        ? root.status !== 'approved'
        : root.status !== 'proposed'
    )
      throw new AwardProposalError(
        'არჩეული მოქმედება ამ სტატუსისთვის დაუშვებელია.',
      )
    const previous = await repository.current(tx, root.id, root.version)
    if (!previous)
      throw new AwardProposalError('ფონდის ისტორია გადასამოწმებელია.')
    const members = await repository.activeMembers(tx, root.id),
      rate = await repository.rateVersion(tx, previous.ruleVersionId)
    if (!rate || members.length !== previous.allocations.length)
      throw new AwardProposalError(
        'ფონდის წილები შეიცვალა. ხელახლა მოამზადეთ ფონდი.',
      )
    const memberRows = []
    for (const member of members) {
      const row = await awards.readCurrent(tx, member.id)
      const allocated = previous.allocations.find(
        (a) => a.userId === row?.userId,
      )
      if (
        !row ||
        !allocated ||
        row.decision.poolVersionId !== previous.id ||
        row.decision.amountMinor !== allocated.amountMinor ||
        row.proposal.status !== root.status
      )
        throw new AwardProposalError(
          'ფონდის წილები შეიცვალა. ხელახლა მოამზადეთ ფონდი.',
        )
      if (data.decision === 'approved') {
        const resolved = await resolveAwardEvidence(tx, current, {
          userId: row.userId,
          ruleId: root.ruleId,
          expectedRuleVersion: rate.version,
          workDate: previous.workDate,
          jobId: root.jobId,
        })
        assertEvidenceUnchanged(awardView(row).current, resolved)
        if (resolved.rate.id !== previous.ruleVersionId)
          throw new AwardProposalError('ფონდის ტარიფი შეიცვალა.')
      }
      memberRows.push({ root: member, decision: row.decision })
    }
    if (
      data.decision === 'approved' &&
      (proposedAwardAmount(
        rate.amountMinor,
        previous.quantityMilli,
        rate.calculation,
      ) !== previous.totalMinor ||
        previous.allocations.reduce((sum, a) => sum + a.amountMinor, 0) !==
          previous.totalMinor)
    )
      throw new AwardProposalError('ფონდის თანხა გადასამოწმებელია.')
    const { id: _parentId, createdAt: _parentCreatedAt, ...facts } = previous,
      version = root.version + 1
    const recorded = await repository.append(tx, {
      ...facts,
      version,
      status: data.decision,
      evidenceVerified: data.decision === 'approved',
      actorId: current.id,
      reason: data.reason,
      requestId: data.requestId,
      commandHash,
    })
    for (const member of memberRows) {
      const {
        id: _id,
        createdAt: _at,
        proposalId: _proposalId,
        version: _v,
        requestId: _request,
        commandHash: _hash,
        ...body
      } = member.decision
      await appendChild(
        tx,
        member.root,
        {
          ...body,
          poolVersionId: recorded.id,
          status: data.decision,
          evidenceVerified: data.decision === 'approved',
          actorId: current.id,
          reason: data.reason,
        },
        commandHash,
      )
    }
    await repository.setCurrent(tx, root.id, version, data.decision)
    return { poolId: root.id, version }
  })
}
export async function withdrawAwardPool(actor: Actor | null, input: unknown) {
  // Withdrawal is preparation authority, and never revokes an approval.
  const data = withdrawAwardPoolSchema.parse(input),
    commandHash = hash('withdraw', data)
  return awards.transactAwards(async (tx) => {
    const current = await authorizeAward(tx, actor, 'propose'),
      prior = await replay(tx, current.id, data.requestId, commandHash)
    if (prior) return prior
    const peek = await repository.peek(tx, data.poolId)
    if (!peek) throw new AwardProposalError('ფონდი ვერ მოიძებნა.')
    await awards.sourceMode(tx, peek.ruleId, peek.sourceType, peek.sourceKey)
    const root = await repository.lock(tx, peek.id)
    if (
      !root ||
      root.version !== data.expectedVersion ||
      root.status !== 'proposed'
    )
      throw new AwardProposalError(
        'ფონდი შეიცვალა ან მის გაუქმებას ვერ შეასრულებთ.',
      )
    const previous = await repository.current(tx, root.id, root.version),
      members = await repository.activeMembers(tx, root.id)
    if (!previous || (await repository.wasBeneficiary(tx, root.id, current.id)))
      throw new AwardProposalError('საკუთარი წილის მქონე ფონდს ვერ შეცვლით.')
    const { id: _parentId, createdAt: _parentCreatedAt, ...facts } = previous,
      version = root.version + 1
    const recorded = await repository.append(tx, {
      ...facts,
      version,
      status: 'withdrawn',
      evidenceVerified: false,
      actorId: current.id,
      reason: data.reason,
      requestId: data.requestId,
      commandHash,
    })
    for (const member of members) {
      const old = await awards.rawCurrent(tx, member.id, member.version)
      if (!old) throw new AwardProposalError('წილის ისტორია გადასამოწმებელია.')
      const {
        id: _id,
        createdAt: _at,
        proposalId: _p,
        version: _v,
        requestId: _req,
        commandHash: _hash,
        ...body
      } = old
      await appendChild(
        tx,
        member,
        {
          ...body,
          poolVersionId: recorded.id,
          status: 'withdrawn',
          evidenceVerified: false,
          actorId: current.id,
          reason: data.reason,
        },
        commandHash,
      )
    }
    await repository.setCurrent(tx, root.id, version, 'withdrawn')
    return { poolId: root.id, version }
  })
}
export async function readAwardPool(
  actor: Actor | null,
  input: unknown,
): Promise<AwardPoolDetail> {
  const data = awardPoolDetailSchema.parse(input)
  return awards.transactAwards(
    async (tx) => {
      const current = await authorizeAward(tx, actor),
        root = await repository.peek(tx, data.poolId)
      if (!root) throw new AwardProposalError('ფონდი ვერ მოიძებნა.')
      const version = await repository.current(tx, root.id, root.version),
        history = await repository.history(tx, root.id, data.page, data.q)
      if (!version)
        throw new AwardProposalError('ფონდის ისტორია გადასამოწმებელია.')
      const rate = await repository.rateVersion(tx, version.ruleVersionId)
      if (!rate) throw new AwardProposalError('ფონდის ტარიფი ვერ მოიძებნა.')
      const memberIds = await repository.versionMembers(tx, version.id),
        members = []
      for (const member of memberIds) {
        const row = await awards.readCurrent(tx, member.id)
        if (row) members.push(awardView(row))
      }
      const fact = (
        row: typeof payrollAwardPoolVersion.$inferSelect,
        actorName: string,
        rule: ReturnType<typeof ruleFact>,
      ): PoolVersion => ({
        version: row.version,
        status: row.status,
        workDate: row.workDate,
        quantityMilli: row.quantityMilli,
        totalMinor: row.totalMinor,
        reference: row.reference,
        evidence: row.evidence,
        reason: row.reason,
        actorName,
        recordedAt: row.createdAt.toISOString(),
        evidenceVerified: row.evidenceVerified,
        rule,
        allocations: row.allocations,
      })
      const actorName =
        (await repository.history(tx, root.id, 1, '')).records.find(
          (r) => r.record.version === version.version,
        )?.actorName ?? ''
      return {
        poolId: root.id,
        ruleId: root.ruleId,
        sourceType: root.sourceType,
        jobId: root.jobId,
        today: (await getCompanyWorkday(new Date(), tx)).date,
        timezone: (await getCompanyWorkday(new Date(), tx)).timezone,
        preparationEligible:
          hasPermission(current, 'payroll.awards.propose') &&
          !(await repository.wasBeneficiary(tx, root.id, current.id)),
        current: fact(version, actorName, ruleFact(rate)),
        members,
        history: history.records.map((r) =>
          fact(r.record, r.actorName, ruleFact(r.rule)),
        ),
        total: history.total,
        pageSize: history.pageSize,
        reviewEligible:
          hasPermission(current, 'payroll.awards.review') &&
          (await repository.mayReview(tx, root.id, current.id)),
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
