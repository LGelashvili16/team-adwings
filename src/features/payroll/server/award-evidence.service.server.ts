import '@tanstack/react-start/server-only'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import { readEmploymentEligibility } from '#/features/employees/server/employment.service.server'
import { getCompletedJobAwardEvidence } from '#/features/jobs/server/job-award-evidence.service.server'
import * as repository from './award-proposals.repository.server'
import { AwardProposalError } from './award-proposals.policy.server'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { Actor } from '#/lib/authorization/actor'
import type { AwardVersion } from '../award-proposals.types'

/** Caller authorizes preparation/review and holds the source reservation. All financial inputs are re-read under locks. */
export async function resolveAwardEvidence(
  tx: PayrollTransaction,
  actor: Actor,
  input: {
    userId: string
    ruleId: string
    expectedRuleVersion: number
    workDate: string
    jobId: string | null
  },
) {
  const person = await repository.person(tx, input.userId)
  if (!person) throw new AwardProposalError('თანამშრომელი ვერ მოიძებნა.')
  const workday = await getCompanyWorkday(new Date(), tx)
  if (input.workDate > workday.date)
    throw new AwardProposalError('შესრულების თარიღი მომავალში ვერ იქნება.')
  if (!(await repository.lockRule(tx, input.ruleId)))
    throw new AwardProposalError('წესი ვერ მოიძებნა.')
  const rate = await repository.applicableRule(tx, input.ruleId, input.workDate)
  if (!rate?.enabled || rate.version !== input.expectedRuleVersion)
    throw new AwardProposalError(
      'ამ თარიღზე წესი არ მოქმედებს ან შეიცვალა. ხელახლა აირჩიეთ წესი.',
    )
  if ((rate.calculation === 'job') !== (input.jobId !== null))
    throw new AwardProposalError(
      'სამუშაოს ბონუსისთვის აირჩიეთ დასრულებული სამუშაო, სხვა შემთხვევაში მიუთითეთ წყაროს ნომერი.',
    )
  const employment = await readEmploymentEligibility(tx, {
    employeeId: person.id,
    startDate: input.workDate,
    endDate: input.workDate,
  })
  if (employment.status !== 'confirmed' || !employment.periods.length)
    throw new AwardProposalError(
      'ამ თარიღზე დასაქმების პერიოდი დადასტურებული არ არის. მიმართეთ HR-ს.',
    )
  const job = input.jobId
    ? await getCompletedJobAwardEvidence(tx, actor, {
        jobId: input.jobId,
        userId: input.userId,
      })
    : null
  if (input.jobId && (!job || job.workDate !== input.workDate))
    throw new AwardProposalError(
      'სამუშაო დასრულებული უნდა იყოს არჩეულ თარიღზე, თანამშრომელი კი მის შემსრულებლად უნდა ფიქსირდებოდეს.',
    )
  return {
    person,
    rate,
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
  }
}
export function assertEvidenceUnchanged(
  previous: Pick<AwardVersion, 'sourceSnapshot' | 'completionEventId'>,
  resolved: Awaited<ReturnType<typeof resolveAwardEvidence>>,
) {
  const before = previous.sourceSnapshot,
    after = resolved.sourceSnapshot
  if (
    before.employmentRevision !== after.employmentRevision ||
    before.timezone !== after.timezone ||
    before.jobVersion !== after.jobVersion ||
    previous.completionEventId !== resolved.completionEventId
  )
    throw new AwardProposalError(
      'განაცხადის წყარო შეიცვალა. დამტკიცებამდე ხელახლა მოამზადეთ განაცხადი.',
    )
}
