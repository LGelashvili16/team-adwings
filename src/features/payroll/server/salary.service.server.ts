import '@tanstack/react-start/server-only'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { assertPermissions } from '#/lib/authorization/access'
import { currentAuthorization } from '#/lib/authorization/permissions'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import {
  salaryDetailSchema,
  salaryDirectorySchema,
  salarySelfReadSchema,
  salarySaveSchema,
} from '../salary.schemas'
import {
  currentAccount,
  effectivePolicy,
} from './payroll-settings.repository.server'
import * as repository from './salary.repository.server'
import { employeeStatements } from './monthly.repository.server'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { Actor } from '#/lib/authorization/actor'
import type { Permission } from '#/lib/authorization/permissions'
import type {
  MySalaryDetail,
  SalaryDetail,
  SalaryDirectory,
} from '../salary.types'

export class SalaryError extends Error {}
async function authorize(
  tx: PayrollTransaction,
  actor: Actor | null,
  permission?: Permission,
) {
  if (!actor) throw new AuthorizationError()
  const { account, person } = await currentAccount(tx, actor.id)
  if (!account || account.state !== 'active' || person?.status === 'inactive')
    throw new AuthorizationError()
  const current = { ...actor, ...currentAuthorization(account) }
  if (permission)
    assertPermissions(current, [
      'manage.access',
      'payroll.read.all',
      ...(permission === 'payroll.terms.manage' ? [permission] : []),
    ])
  return current
}
async function salarySubject(tx: PayrollTransaction, userId: string) {
  const target = await repository.person(tx, userId)
  if (!target) throw new SalaryError('თანამშრომლის ჩანაწერი ვერ მოიძებნა.')
  return target
}
async function detail(
  tx: PayrollTransaction,
  target: Awaited<ReturnType<typeof salarySubject>>,
  page: number,
  audit: boolean,
): Promise<SalaryDetail> {
  const workday = await getCompanyWorkday(new Date(), tx)
  const version = await repository.latestVersion(tx, target.id)
  const current = await repository.applicable(tx, target.id, workday.date)
  const next = await repository.applicable(tx, target.id, workday.date, true)
  const rows = await repository.history(tx, target.id, page, audit)
  const total = await repository.totalHistory(tx, target.id)
  return {
    defaultAmountBasis:
      (await effectivePolicy(tx, workday.date))?.amountBasis ?? 'gross',
    employee: {
      userId: target.userId,
      name: target.name,
      username: target.username,
      jobTitle: target.jobTitle,
      status: target.status,
      version,
      current,
      next,
    },
    today: workday.date,
    timezone: workday.timezone,
    pageSize: repository.historyPageSize,
    total,
    history: rows.map((row) => ({
      version: row.version,
      effectiveFrom: row.effectiveFrom,
      kind: row.kind,
      amountMinor: row.amountMinor,
      amountBasis: row.amountBasis,
      currency: row.currency,
      recordedAt: row.createdAt.toISOString(),
      audit:
        audit &&
        'reason' in row &&
        typeof row.reason === 'string' &&
        'actorName' in row &&
        typeof row.actorName === 'string'
          ? { reason: row.reason, actorName: row.actorName }
          : null,
    })),
  }
}
export async function readMySalary(
  actor: Actor | null,
  input: unknown,
): Promise<MySalaryDetail> {
  const data = salarySelfReadSchema.parse(input)
  return repository.transactSalaries(
    async (tx) => {
      const current = await authorize(tx, actor)
      const target = await salarySubject(tx, current.id)
      const salary = await detail(tx, target, data.page, false)
      const statements = await employeeStatements(
        tx,
        target.id,
        data.statementPage,
        data.month,
      )
      return { ...salary, statements }
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function readEmployeeSalary(actor: Actor | null, input: unknown) {
  const data = salaryDetailSchema.parse(input)
  return repository.transactSalaries(
    async (tx) => {
      await authorize(tx, actor, 'payroll.read.all')
      return detail(tx, await salarySubject(tx, data.userId), data.page, true)
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function readSalaryDirectory(
  actor: Actor | null,
  input: unknown,
): Promise<SalaryDirectory> {
  const data = salaryDirectorySchema.parse(input)
  return repository.transactSalaries(
    async (tx) => {
      await authorize(tx, actor, 'payroll.read.all')
      const workday = await getCompanyWorkday(new Date(), tx)
      return {
        ...(await repository.directory(tx, data, workday.date)),
        defaultAmountBasis:
          (await effectivePolicy(tx, workday.date))?.amountBasis ?? 'gross',
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function saveSalaryTerms(actor: Actor | null, input: unknown) {
  const data = salarySaveSchema.parse(input)
  return repository.transactSalaries(async (tx) => {
    const current = await authorize(tx, actor, 'payroll.terms.manage')
    if (data.targets.some((target) => target.userId === current.id))
      throw new SalaryError(
        'საკუთარი ხელფასის განსაზღვრა დაუშვებელია. მიმართეთ სხვა უფლებამოსილ პირს.',
      )
    // All writers lock employees in the same order; a bulk save succeeds entirely or rolls back entirely.
    for (const target of [...data.targets].sort((a, b) =>
      a.userId.localeCompare(b.userId),
    )) {
      const person = await repository.person(tx, target.userId, true)
      if (!person)
        throw new SalaryError(
          'ერთ-ერთი თანამშრომელი ვერ მოიძებნა. განაახლეთ სია.',
        )
      const version = await repository.latestVersion(tx, person.id)
      if (version !== target.expectedVersion)
        throw new SalaryError(
          'ხელფასი სხვა მომხმარებელმა შეცვალა. განაახლეთ მონაცემები და გადაამოწმეთ ცვლილებები.',
        )
      await repository.insert(tx, {
        employeeId: person.id,
        version: version + 1,
        actorId: current.id,
        effectiveFrom: data.effectiveFrom,
        kind: data.kind,
        amountMinor: data.amountMinor,
        amountBasis: data.amountBasis,
        currency: data.currency,
        reason: data.reason ?? 'ხელფასის შეთანხმება შენახულია.',
      })
    }
    return { saved: data.targets.length }
  })
}
