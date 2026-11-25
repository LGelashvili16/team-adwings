import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'
import { hasPermission } from '#/lib/authorization/permissions'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import { readEmploymentEligibility } from '#/features/employees/server/employment.service.server'
import {
  getCompletedJobAwardEvidence,
  listCompletedJobsForAward,
} from '#/features/jobs/server/job-award-evidence.service.server'
import {
  authorizeAward,
  AwardProposalError,
} from './award-proposals.policy.server'
import {
  resolveAwardEvidence,
  assertEvidenceUnchanged,
} from './award-evidence.service.server'
import { reviewAwardSchema } from '../award-review.schemas'
import * as repository from './award-proposals.repository.server'
import {
  awardDetailSchema,
  awardLookupSchema,
  awardSearchSchema,
  normalizeAwardReference,
  saveAwardSchema,
  withdrawAwardSchema,
} from '../award-proposals.schemas'
import { proposedAwardAmount } from '../award-proposals.rules'
import { bonusCalculationLabels } from '../bonus-rules.presentation'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { Actor } from '#/lib/authorization/actor'
import type { BonusRuleVersion } from '../bonus-rules.types'
import type {
  AwardChoice,
  AwardDetail,
  AwardDirectory,
  AwardSummary,
} from '../award-proposals.types'
import type { payrollBonusRuleVersion } from '#/db/schema'

export { AwardProposalError } from './award-proposals.policy.server'
async function authorize(
  tx: PayrollTransaction,
  actor: Actor | null,
  write = false,
) {
  return authorizeAward(tx, actor, write ? 'propose' : 'read')
}
export function ruleFact(
  r: typeof payrollBonusRuleVersion.$inferSelect,
): BonusRuleVersion {
  return {
    version: r.version,
    effectiveFrom: r.effectiveFrom,
    name: r.name,
    kind: r.kind,
    calculation: r.calculation,
    unitLabel: r.unitLabel,
    qualification: r.qualification,
    amountMinor: r.amountMinor,
    amountBasis: r.amountBasis,
    currency: r.currency,
    enabled: r.enabled,
  }
}
export function awardView(
  row: NonNullable<Awaited<ReturnType<typeof repository.readCurrent>>>,
): AwardSummary {
  const { proposal: p, decision: a, rate: r } = row
  return {
    proposalId: p.id,
    employeeName: row.employeeName,
    userId: row.userId,
    ruleId: p.ruleId,
    sourceType: p.sourceType,
    sourceKey: p.sourceKey,
    jobId: p.jobId,
    poolId: p.poolId,
    current: {
      version: a.version,
      status: a.status,
      workDate: a.workDate,
      quantityMilli: a.quantityMilli,
      amountMinor: a.amountMinor,
      reference: a.reference,
      evidence: a.evidence,
      reason: a.reason,
      actorName: row.actorName,
      recordedAt: a.createdAt.toISOString(),
      rule: ruleFact(r),
      completionEventId: a.completionEventId,
      sourceSnapshot: a.sourceSnapshot,
      evidenceVerified: a.evidenceVerified,
      allocation:
        p.poolId && row.poolTotalMinor !== null
          ? { poolId: p.poolId, totalMinor: row.poolTotalMinor }
          : null,
    },
  }
}
export async function readAwardProposals(
  actor: Actor | null,
  input: unknown,
): Promise<AwardDirectory> {
  const data = awardSearchSchema.parse(input)
  return repository.transactAwards(
    async (tx) => {
      await authorize(tx, actor)
      const { date } = await getCompanyWorkday(new Date(), tx)
      const rows = await repository.directory(tx, data)
      return {
        today: date,
        items: rows.records.map(awardView),
        total: rows.total,
        pageSize: rows.pageSize,
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function readAwardProposal(
  actor: Actor | null,
  input: unknown,
): Promise<AwardDetail> {
  const data = awardDetailSchema.parse(input)
  return repository.transactAwards(
    async (tx) => {
      const current = await authorize(tx, actor)
      const found = await repository.readCurrent(tx, data.proposalId)
      if (!found) throw new AwardProposalError('განაცხადი ვერ მოიძებნა.')
      const { date } = await getCompanyWorkday(new Date(), tx)
      const rows = await repository.history(
        tx,
        data.proposalId,
        data.page,
        data.q,
      )
      return {
        ...awardView(found),
        reviewEligible:
          hasPermission(current, 'payroll.awards.review') &&
          !found.proposal.poolId &&
          found.userId !== current.id &&
          !(await repository.preparedBy(tx, data.proposalId, current.id)),
        today: date,
        history: rows.records.map((row) => awardView(row).current),
        total: rows.total,
        pageSize: rows.pageSize,
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function lookupAwardInputs(
  actor: Actor | null,
  input: unknown,
): Promise<{ records: AwardChoice[]; total: number; pageSize: number }> {
  const data = awardLookupSchema.parse(input)
  return repository.transactAwards(
    async (tx) => {
      const current = await authorize(tx, actor, true)
      if (data.kind === 'employee') {
        const rows = await repository.employeeChoices(
          tx,
          current.id,
          data.q,
          data.page,
        )
        return {
          ...rows,
          records: rows.records.map((r) => ({
            ...r,
            description: r.description ? `@${r.description}` : '',
            rule: null,
          })),
        }
      }
      if (data.kind === 'rule') {
        const rows = await repository.ruleChoices(
          tx,
          data.workDate,
          data.q,
          data.page,
          data.ruleId,
        )
        return {
          ...rows,
          records: rows.records.map((r) => ({
            id: r.ruleId,
            label: r.name,
            description: bonusCalculationLabels[r.calculation],
            rule: ruleFact(r),
          })),
        }
      }
      if (!data.userId || data.userId === current.id)
        throw new AwardProposalError('აირჩიეთ სხვა თანამშრომელი.')
      const rows = await listCompletedJobsForAward(tx, current, {
        q: data.q,
        page: data.page,
        userId: data.userId,
        workDate: data.workDate,
      })
      return {
        ...rows,
        records: rows.records.map((r) => ({
          id: r.id,
          label: r.title,
          description: `ვერსია ${r.version}`,
          rule: null,
        })),
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
function fingerprint(action: string, data: unknown) {
  return createHash('sha256')
    .update(JSON.stringify({ action, data }))
    .digest('hex')
}

export async function reviewAwardProposal(actor: Actor | null, input: unknown) {
  const data = reviewAwardSchema.parse(input),
    hash = fingerprint('review', data)
  return repository.transactAwards(async (tx) => {
    const current = await authorizeAward(tx, actor, 'review'),
      prior = await replay(tx, current.id, data.requestId, hash)
    if (prior) return prior
    const peek = await repository.peekProposal(tx, data.proposalId)
    if (!peek) throw new AwardProposalError('განაცხადი ვერ მოიძებნა.')
    await repository.sourceMode(
      tx,
      peek.ruleId,
      peek.sourceType,
      peek.sourceKey,
    )
    const record = await repository.lockProposal(tx, peek.id)
    if (!record || record.version !== data.expectedVersion)
      throw new AwardProposalError('განაცხადი შეიცვალა. განაახლეთ მონაცემები.')
    if (record.poolId)
      throw new AwardProposalError(
        'ფონდის წილი ცალკე ვერ განიხილება. განიხილეთ საერთო ფონდი.',
      )
    const found = await repository.readCurrent(tx, record.id)
    if (!found)
      throw new AwardProposalError('განაცხადის ისტორია გადასამოწმებელია.')
    if (
      found.userId === current.id ||
      (await repository.preparedBy(tx, record.id, current.id))
    )
      throw new AwardProposalError(
        'ბენეფიციარი ან განაცხადის მომმზადებელი მის განხილვაში ვერ მონაწილეობს.',
      )
    if (
      data.decision === 'revoked'
        ? record.status !== 'approved'
        : record.status !== 'proposed'
    )
      throw new AwardProposalError(
        'არჩეული მოქმედება ამ სტატუსისთვის დაუშვებელია.',
      )
    if (data.decision === 'approved') {
      const resolved = await resolveAwardEvidence(tx, current, {
        userId: found.userId,
        ruleId: record.ruleId,
        workDate: found.decision.workDate,
        expectedRuleVersion: found.rate.version,
        jobId: record.jobId,
      })
      assertEvidenceUnchanged(awardView(found).current, resolved)
      if (
        resolved.rate.id !== found.decision.ruleVersionId ||
        proposedAwardAmount(
          resolved.rate.amountMinor,
          found.decision.quantityMilli,
          resolved.rate.calculation,
        ) !== found.decision.amountMinor
      )
        throw new AwardProposalError(
          'ტარიფი ან თანხა შეიცვალა. ხელახლა მოამზადეთ განაცხადი.',
        )
    }
    const previous = await repository.rawCurrent(tx, record.id, record.version)
    if (!previous)
      throw new AwardProposalError('განაცხადის ისტორია გადასამოწმებელია.')
    const { id: _id, createdAt: _createdAt, ...facts } = previous,
      version = record.version + 1
    await repository.appendVersion(tx, {
      ...facts,
      version,
      status: data.decision,
      evidenceVerified: data.decision === 'approved' && data.evidenceVerified,
      actorId: current.id,
      reason: data.reason,
      requestId: data.requestId,
      commandHash: hash,
    })
    await repository.setCurrent(tx, record.id, version, data.decision)
    return { proposalId: record.id, version }
  })
}
async function replay(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
  hash: string,
) {
  await repository.commandLock(tx, `command:${actorId}:${requestId}`)
  const prior = await repository.command(tx, actorId, requestId)
  if (!prior) return null
  if (prior.commandHash !== hash)
    throw new AwardProposalError(
      'ამ მოთხოვნის მონაცემები შეიცვალა. განაახლეთ განაცხადი.',
    )
  return { proposalId: prior.proposalId, version: prior.version }
}
export async function saveAwardProposal(actor: Actor | null, input: unknown) {
  const data = saveAwardSchema.parse(input),
    hash = fingerprint('save', data)
  return repository.transactAwards(async (tx) => {
    const current = await authorize(tx, actor, true)
    const prior = await replay(tx, current.id, data.requestId, hash)
    if (prior) return prior
    if (
      (await repository.sourceMode(
        tx,
        data.ruleId,
        data.jobId ? 'job' : 'external',
        data.jobId ?? normalizeAwardReference(data.reference),
        'individual',
      )) !== 'individual'
    )
      throw new AwardProposalError(
        'ამ წყაროზე საერთო ფონდი არსებობს. გამოიყენეთ ფონდის ცვლილება.',
      )
    if (data.userId === current.id)
      throw new AwardProposalError(
        'საკუთარი წახალისების განაცხადს ვერ მოამზადებთ. მიმართეთ სხვა უფლებამოსილ პირს.',
      )
    const existing = data.proposalId
      ? await repository.lockProposal(tx, data.proposalId)
      : null
    if (data.proposalId && !existing)
      throw new AwardProposalError('განაცხადი ვერ მოიძებნა.')
    if (existing?.poolId)
      throw new AwardProposalError(
        'ფონდის წილი ცალკე ვერ შეიცვლება. შეცვალეთ საერთო ფონდი.',
      )
    if (existing?.status === 'approved')
      throw new AwardProposalError(
        'დამტკიცებული წახალისება ჩაკეტილია. ცვლილებამდე გააუქმეთ დამტკიცება.',
      )
    if ((existing?.version ?? 0) !== data.expectedVersion)
      throw new AwardProposalError(
        'განაცხადი შეიცვალა. განაახლეთ მონაცემები და გადაამოწმეთ ცვლილება.',
      )
    const person = await repository.person(tx, data.userId)
    if (!person) throw new AwardProposalError('თანამშრომელი ვერ მოიძებნა.')
    const workday = await getCompanyWorkday(new Date(), tx)
    if (data.workDate > workday.date)
      throw new AwardProposalError('შესრულების თარიღი მომავალში ვერ იქნება.')
    if (!(await repository.lockRule(tx, data.ruleId)))
      throw new AwardProposalError('წესი ვერ მოიძებნა.')
    const rate = await repository.applicableRule(tx, data.ruleId, data.workDate)
    if (!rate?.enabled || rate.version !== data.expectedRuleVersion)
      throw new AwardProposalError(
        'ამ თარიღზე წესი არ მოქმედებს ან შეიცვალა. ხელახლა აირჩიეთ წესი.',
      )
    const sourceType =
      rate.calculation === 'job' ? ('job' as const) : ('external' as const)
    if ((sourceType === 'job') !== (data.jobId !== null))
      throw new AwardProposalError(
        'სამუშაოს ბონუსისთვის აირჩიეთ დასრულებული სამუშაო, სხვა შემთხვევაში მიუთითეთ წყაროს ნომერი.',
      )
    const sourceKey = data.jobId ?? normalizeAwardReference(data.reference)
    if (
      existing &&
      (existing.ruleId !== data.ruleId ||
        existing.employeeId !== person.id ||
        existing.sourceType !== sourceType ||
        existing.sourceKey !== sourceKey)
    )
      throw new AwardProposalError(
        'განაცხადის თანამშრომელი, წესი და წყარო უცვლელია. სხვა წყაროსთვის შექმენით ახალი განაცხადი.',
      )
    await repository.commandLock(
      tx,
      `claim:${data.ruleId}:${person.id}:${sourceType}:${sourceKey}`,
    )
    const claim = await repository.claim(
      tx,
      data.ruleId,
      person.id,
      sourceType,
      sourceKey,
    )
    if (claim && claim.id !== existing?.id)
      throw new AwardProposalError(
        'ამ თანამშრომლის, წესისა და წყაროს განაცხადი უკვე არსებობს. შეცვალეთ არსებული განაცხადი.',
      )
    const employment = await readEmploymentEligibility(tx, {
      employeeId: person.id,
      startDate: data.workDate,
      endDate: data.workDate,
    })
    if (employment.status !== 'confirmed' || !employment.periods.length)
      throw new AwardProposalError(
        'ამ თარიღზე დასაქმების პერიოდი დადასტურებული არ არის. მიმართეთ HR-ს.',
      )
    const job = data.jobId
      ? await getCompletedJobAwardEvidence(tx, current, {
          jobId: data.jobId,
          userId: data.userId,
        })
      : null
    if (data.jobId && (!job || job.workDate !== data.workDate))
      throw new AwardProposalError(
        'სამუშაო დასრულებული უნდა იყოს არჩეულ თარიღზე, თანამშრომელი კი მის შემსრულებლად უნდა ფიქსირდებოდეს.',
      )
    let amountMinor: number
    try {
      amountMinor = proposedAwardAmount(
        rate.amountMinor,
        data.quantityMilli,
        rate.calculation,
      )
    } catch (error) {
      throw new AwardProposalError(
        error instanceof Error ? error.message : 'რაოდენობა არასწორია.',
      )
    }
    const proposal =
      existing ??
      (await repository.createProposal(tx, {
        ruleId: data.ruleId,
        employeeId: person.id,
        sourceType,
        sourceKey,
        jobId: data.jobId,
        version: 1,
        status: 'proposed',
      }))
    const version = data.expectedVersion + 1
    await repository.appendVersion(tx, {
      proposalId: proposal.id,
      version,
      status: 'proposed',
      ruleVersionId: rate.id,
      workDate: data.workDate,
      quantityMilli: data.quantityMilli,
      amountMinor,
      reference: data.reference,
      evidence: data.evidence,
      completionEventId: job?.completionEventId ?? null,
      sourceSnapshot: {
        ...(job
          ? {
              jobTitle: job.jobTitle,
              jobVersion: job.jobVersion,
              completedAt: job.completedAt,
              completedBy: job.completedBy,
              assigneeId: job.assigneeId,
            }
          : {}),
        employmentRevision: employment.revision,
        timezone: workday.timezone,
      },
      actorId: current.id,
      reason: data.reason,
      requestId: data.requestId,
      commandHash: hash,
    })
    if (existing)
      await repository.setCurrent(tx, existing.id, version, 'proposed')
    return { proposalId: proposal.id, version }
  })
}
export async function withdrawAwardProposal(
  actor: Actor | null,
  input: unknown,
) {
  const data = withdrawAwardSchema.parse(input),
    hash = fingerprint('withdraw', data)
  return repository.transactAwards(async (tx) => {
    const current = await authorize(tx, actor, true),
      prior = await replay(tx, current.id, data.requestId, hash)
    if (prior) return prior
    const peek = await repository.peekProposal(tx, data.proposalId)
    if (peek?.poolId)
      throw new AwardProposalError(
        'ფონდის წილი ცალკე ვერ გაუქმდება. გამოიყენეთ საერთო ფონდი.',
      )
    if (peek)
      await repository.sourceMode(
        tx,
        peek.ruleId,
        peek.sourceType,
        peek.sourceKey,
      )
    const record = await repository.lockProposal(tx, data.proposalId)
    if (
      !record ||
      record.version !== data.expectedVersion ||
      record.status !== 'proposed'
    )
      throw new AwardProposalError(
        'განაცხადი შეიცვალა ან უკვე გაუქმებულია. განაახლეთ მონაცემები.',
      )
    const row = await repository.readCurrent(tx, record.id)
    if (!row || row.userId === current.id)
      throw new AwardProposalError(
        'საკუთარი წახალისების განაცხადს ვერ შეცვლით.',
      )
    const previous = await repository.rawCurrent(tx, record.id, record.version)
    if (!previous)
      throw new AwardProposalError('განაცხადის ისტორია გადასამოწმებელია.')
    const { id: _id, createdAt: _createdAt, ...facts } = previous
    const version = record.version + 1
    await repository.appendVersion(tx, {
      ...facts,
      version,
      status: 'withdrawn',
      actorId: current.id,
      reason: data.reason,
      requestId: data.requestId,
      commandHash: hash,
    })
    await repository.setCurrent(tx, record.id, version, 'withdrawn')
    return { proposalId: record.id, version }
  })
}
