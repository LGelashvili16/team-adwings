import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { assertPermissions } from '#/lib/authorization/access'
import {
  currentAuthorization,
  hasPermission,
} from '#/lib/authorization/permissions'
import { readEmploymentEligibility } from '#/features/employees/server/employment.service.server'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import {
  monthlyDecisionSchema,
  monthlyDetailSchema,
  monthlySaveSchema,
  monthlyAdjustmentsSaveSchema,
  monthlySearchSchema,
  monthlyRemoveSchema,
} from '../monthly.schemas'
import { hourlyBase, monthlyBounds, monthlyTotals } from '../monthly.rules'
import { currentAccount } from './payroll-settings.repository.server'
import * as salaries from './salary.repository.server'
import * as repository from './monthly.repository.server'
import type { Actor } from '#/lib/authorization/actor'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type {
  MonthlyDetail,
  MonthlyDirectory,
  MonthlyEntry,
  MonthlySource,
} from '../monthly.types'

export class MonthlyPayrollError extends Error {}
class MonthlySalaryMissingError extends MonthlyPayrollError {}
const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
async function authorize(
  tx: PayrollTransaction,
  actor: Actor | null,
  write = false,
) {
  if (!actor) throw new AuthorizationError()
  const { account, person } = await currentAccount(tx, actor.id)
  if (!account || account.state !== 'active' || person?.status === 'inactive')
    throw new AuthorizationError()
  const current = { ...actor, ...currentAuthorization(account) }
  assertPermissions(current, [
    'manage.access',
    'payroll.read.all',
    ...(write ? ['payroll.manage' as const] : []),
  ])
  return current
}
async function state(tx: PayrollTransaction, month: string) {
  const rows = await repository.monthState(tx, month)
  if (rows.length > 1000)
    throw new MonthlyPayrollError(
      'ერთი თვის უწყისი მაქსიმუმ 1 000 თანამშრომელს მოიცავს.',
    )
  return {
    rows,
    closed: rows.some((r) => r.status === 'finalized'),
    token: fingerprint(rows),
  }
}
function projection(
  row: Awaited<ReturnType<typeof repository.history>>['records'][number],
): MonthlyEntry {
  const r = row.entry
  return {
    userId: row.userId,
    employeeName: row.employeeName,
    actorName: row.actorName,
    version: r.version,
    status: r.status,
    salary: r.salary,
    workedSeconds: r.workedSeconds,
    baseMinor: r.baseMinor,
    baseReason: r.baseReason,
    manualBase: r.manualBase,
    adjustments: r.adjustments,
    bonusMinor: r.bonusMinor,
    premiumMinor: r.premiumMinor,
    fineMinor: r.fineMinor,
    totalMinor: r.totalMinor,
    reason: r.reason,
    recordedAt: r.createdAt.toISOString(),
  }
}
async function source(
  tx: PayrollTransaction,
  userId: string,
  month: string,
  lock = false,
): Promise<MonthlySource & { employeeId: string }> {
  const target = await salaries.person(tx, userId, lock)
  if (!target) throw new MonthlyPayrollError('თანამშრომელი ვერ მოიძებნა.')
  const { start, end } = monthlyBounds(month)
  const eligibility = await readEmploymentEligibility(tx, {
    employeeId: target.id,
    startDate: start,
    endDate: end,
  })
  if (eligibility.status !== 'confirmed')
    throw new MonthlyPayrollError(
      'ჯერ დაადასტურეთ თანამშრომლის დასაქმების თარიღები.',
    )
  const first = eligibility.periods.at(0)
  if (!first)
    throw new MonthlyPayrollError(
      'არჩეულ თვეში დასაქმების დადასტურებული პერიოდი არ არის.',
    )
  const firstDate = first.startDate > start ? first.startDate : start
  const terms = await repository.salarySources(tx, target.id, firstDate, end)
  const initial = terms.at(0)
  if (
    !initial ||
    !eligibility.periods.some(
      (period) =>
        period.endDate === null || initial.effectiveFrom <= period.endDate,
    )
  )
    throw new MonthlySalaryMissingError(
      'არჩეულ თვეში დასაქმების პერიოდში მოქმედი ხელფასი არ არის განსაზღვრული.',
    )
  // A simple monthly entry cannot mix gross and net agreements into one unexplained total.
  if (terms.some((t) => t.amountBasis !== initial.amountBasis))
    throw new MonthlyPayrollError(
      'თვეში თანხის საფუძველი იცვლება. ჯერ გაასწორეთ ხელფასის შეთანხმება.',
    )
  const salary = {
    version: initial.version,
    effectiveFrom: initial.effectiveFrom,
    kind: initial.kind,
    amountMinor: initial.amountMinor,
    amountBasis: initial.amountBasis,
    currency: initial.currency,
  }
  const complete =
    eligibility.periods.length === 1 &&
    first.startDate <= start &&
    (first.endDate === null || first.endDate >= end)
  return {
    employeeId: target.id,
    employeeName: target.name,
    salary,
    requiresBaseConfirmation:
      !complete || initial.effectiveFrom > firstDate || terms.length > 1,
    sourceToken: fingerprint({
      eligibility,
      terms: terms.map((t) => ({
        id: t.id,
        version: t.version,
        effectiveFrom: t.effectiveFrom,
        kind: t.kind,
        amountMinor: t.amountMinor,
        amountBasis: t.amountBasis,
      })),
    }),
  }
}
async function replay(
  tx: PayrollTransaction,
  actorId: string,
  requestId: string,
  hash: string,
) {
  await repository.lockCommand(tx, actorId, requestId)
  const rows = await repository.retries(tx, actorId, requestId)
  if (rows.some((r) => r.commandHash !== hash))
    throw new MonthlyPayrollError(
      'ეს მოთხოვნა უკვე გამოყენებულია სხვა მონაცემებით. ხელახლა გახსენით ფორმა.',
    )
  return rows.length
}
function checkedTotals(
  baseMinor: number,
  adjustments: MonthlyEntry['adjustments'],
  basePending = false,
) {
  const totals = monthlyTotals(baseMinor, adjustments)
  if (
    [
      baseMinor,
      totals.bonusMinor,
      totals.premiumMinor,
      totals.fineMinor,
      Math.abs(totals.totalMinor),
    ].some((v) => v > 100000000) ||
    (!basePending && totals.totalMinor < 0)
  )
    throw new MonthlyPayrollError(
      'ჯამი უნდა იყოს 0-დან 1 000 000 ლარამდე. გადაამოწმეთ თანხები და ჯარიმები.',
    )
  return totals
}
export async function readMonthlyPayroll(
  actor: Actor | null,
  input: unknown,
): Promise<MonthlyDirectory> {
  const data = monthlySearchSchema.parse(input)
  return repository.transactMonthly(
    async (tx) => {
      const currentActor = await authorize(tx, actor)
      const month =
        data.month ?? (await getCompanyWorkday(new Date(), tx)).date.slice(0, 7)
      const snapshot = await state(tx, month)
      const includeUnprepared =
        !snapshot.closed &&
        data.view !== 'bonuses' &&
        hasPermission(currentActor, 'payroll.manage')
      const result = await repository.directory(
        tx,
        month,
        data,
        includeUnprepared ? currentActor.id : undefined,
      )
      return {
        month,
        entryCount: snapshot.rows.filter((row) => row.status !== 'voided')
          .length,
        closed: snapshot.closed,
        token: snapshot.token,
        records: result.records,
        total: result.total,
        pageSize: repository.pageSize,
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function readMonthlyEmployees(
  actor: Actor | null,
  input: unknown,
) {
  const data = monthlySearchSchema.parse(input)
  return repository.transactMonthly(async (tx) => {
    await authorize(tx, actor, true)
    return repository.employees(tx, data.q, data.page)
  })
}
export async function readMonthlyEmployee(
  actor: Actor | null,
  input: unknown,
): Promise<MonthlyDetail> {
  const data = monthlyDetailSchema.parse(input)
  return repository.transactMonthly(
    async (tx) => {
      await authorize(tx, actor)
      const target = await salaries.person(tx, data.userId)
      if (!target) throw new MonthlyPayrollError('თანამშრომელი ვერ მოიძებნა.')
      const rows = await repository.history(
        tx,
        target.id,
        data.month,
        data.page,
      )
      const latest =
        data.page === 1
          ? rows.records
          : (await repository.history(tx, target.id, data.month, 1)).records
      let currentSource: MonthlySource | null = null,
        sourceMessage: string | null = null,
        salaryMissing = false
      try {
        const { employeeId: _id, ...value } = await source(
          tx,
          data.userId,
          data.month,
        )
        currentSource = value
      } catch (error) {
        if (!(error instanceof MonthlyPayrollError)) throw error
        sourceMessage = error.message
        // Employment validation can stop source resolution before it checks salary.
        salaryMissing =
          error instanceof MonthlySalaryMissingError ||
          !(await salaries.applicable(
            tx,
            target.id,
            monthlyBounds(data.month).end,
          ))
      }
      return {
        timezone: (await getCompanyWorkday(new Date(), tx)).timezone,
        source: currentSource,
        sourceMessage,
        salaryMissing,
        current: latest[0] ? projection(latest[0]) : null,
        history: rows.records.map(projection),
        total: rows.total,
        pageSize: repository.historyPageSize,
        closed: (await state(tx, data.month)).closed,
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
export async function saveMonthlyEmployee(actor: Actor | null, input: unknown) {
  const data = monthlySaveSchema.parse(input),
    hash = fingerprint({ operation: 'save', ...data })
  return repository.transactMonthly(async (tx) => {
    const current = await authorize(tx, actor, true)
    if (current.id === data.userId)
      throw new MonthlyPayrollError(
        'საკუთარი უწყისის შეცვლა დაუშვებელია. მიმართეთ სხვა უფლებამოსილ პირს.',
      )
    if (await replay(tx, current.id, data.requestId, hash)) return { saved: 1 }
    await repository.lockMonth(tx, data.month)
    const monthSnapshot = await state(tx, data.month)
    if (monthSnapshot.closed)
      throw new MonthlyPayrollError(
        'თვე დასრულებულია. ცვლილებისთვის ჯერ გახსენით უწყისი.',
      )
    const prepared = await source(tx, data.userId, data.month, true)
    if (prepared.sourceToken !== data.sourceToken)
      throw new MonthlyPayrollError(
        'დასაქმება ან ხელფასი შეიცვალა. ხელახლა გახსენით ჩანაწერი.',
      )
    const previous = await repository.currentEntry(
      tx,
      prepared.employeeId,
      data.month,
    )
    if (!previous && monthSnapshot.rows.length >= 1000)
      throw new MonthlyPayrollError(
        'ერთი თვის უწყისი მაქსიმუმ 1 000 თანამშრომელს მოიცავს.',
      )
    if ((previous?.version ?? 0) !== data.expectedVersion)
      throw new MonthlyPayrollError(
        'ჩანაწერი უკვე შეიცვალა. ხელახლა გახსენით ფორმა.',
      )
    if (prepared.requiresBaseConfirmation && data.baseOverrideMinor === null)
      throw new MonthlyPayrollError(
        'არასრული თვის ან შეცვლილი ტარიფის საბაზო თანხა ცალკე დაადასტურეთ.',
      )
    if (prepared.salary.kind === 'monthly' && data.workedSeconds !== 0)
      throw new MonthlyPayrollError(
        'ფიქსირებული ხელფასისთვის საათები არ გამოიყენება.',
      )
    const { start, end } = monthlyBounds(data.month)
    if (
      data.workedSeconds >
      (Date.parse(end) - Date.parse(start) + 86400000) / 1000
    )
      throw new MonthlyPayrollError('საათები თვის ხანგრძლივობას აღემატება.')
    const baseMinor =
      data.baseOverrideMinor ??
      (prepared.salary.kind === 'monthly'
        ? prepared.salary.amountMinor
        : hourlyBase(prepared.salary.amountMinor, data.workedSeconds))
    const totals = checkedTotals(baseMinor, data.adjustments)
    await repository.insert(tx, {
      employeeId: prepared.employeeId,
      month: `${data.month}-01`,
      version: data.expectedVersion + 1,
      status: 'draft',
      salary: prepared.salary,
      sourceToken: prepared.sourceToken,
      workedSeconds: data.workedSeconds,
      manualBase: data.baseOverrideMinor !== null,
      baseReason:
        data.baseOverrideMinor === null
          ? ''
          : (data.baseReason ?? 'საბაზო თანხა დადასტურებულია.'),
      baseMinor,
      adjustments: data.adjustments,
      ...totals,
      actorId: current.id,
      reason: data.reason ?? 'თვის ჩანაწერი შენახულია.',
      requestId: data.requestId,
      commandHash: hash,
    })
    return { saved: 1 }
  })
}
export async function saveMonthlyAdjustments(
  actor: Actor | null,
  input: unknown,
) {
  const data = monthlyAdjustmentsSaveSchema.parse(input)
  const hash = fingerprint({ operation: 'adjustments', ...data })
  return repository.transactMonthly(async (tx) => {
    const current = await authorize(tx, actor, true)
    if (current.id === data.userId)
      throw new MonthlyPayrollError('საკუთარი უწყისის შეცვლა დაუშვებელია.')
    if (await replay(tx, current.id, data.requestId, hash)) return { saved: 1 }
    await repository.lockMonth(tx, data.month)
    const snapshot = await state(tx, data.month)
    if (snapshot.closed)
      throw new MonthlyPayrollError(
        'თვე დასრულებულია. ცვლილებისთვის ჯერ გახსენით უწყისი.',
      )
    const target = await salaries.person(tx, data.userId, true)
    if (!target) throw new MonthlyPayrollError('თანამშრომელი ვერ მოიძებნა.')
    const previous = await repository.currentEntry(tx, target.id, data.month)
    if ((previous?.version ?? 0) !== data.expectedVersion)
      throw new MonthlyPayrollError(
        'ჩანაწერი უკვე შეიცვალა. ხელახლა გახსენით ფორმა.',
      )
    if (!previous && snapshot.rows.length >= 1000)
      throw new MonthlyPayrollError(
        'ერთი თვის უწყისი მაქსიმუმ 1 000 თანამშრომელს მოიცავს.',
      )
    const draft = previous?.status === 'draft' ? previous : undefined
    const { adjustments } = data
    if (!draft && !adjustments.length)
      throw new MonthlyPayrollError('დაამატეთ ბონუსი, პრემია ან ჯარიმა.')
    const baseMinor = draft?.baseMinor ?? 0
    await repository.insert(tx, {
      employeeId: target.id,
      month: `${data.month}-01`,
      version: data.expectedVersion + 1,
      status: !draft?.salary && !adjustments.length ? 'voided' : 'draft',
      salary: draft?.salary ?? null,
      sourceToken: draft?.sourceToken ?? null,
      workedSeconds: draft?.workedSeconds ?? 0,
      manualBase: draft?.manualBase ?? false,
      baseReason: draft?.baseReason ?? '',
      baseMinor,
      adjustments,
      ...checkedTotals(baseMinor, adjustments, !draft?.salary),
      actorId: current.id,
      reason: adjustments.length
        ? 'თვის დამატებითი ჩანაწერები განახლდა.'
        : 'თვის დამატებითი ჩანაწერები ამოღებულია.',
      requestId: data.requestId,
      commandHash: hash,
    })
    return { saved: 1 }
  })
}
export async function decideMonthlyPayroll(
  actor: Actor | null,
  input: unknown,
) {
  const data = monthlyDecisionSchema.parse(input),
    hash = fingerprint({ operation: 'decision', ...data })
  return repository.transactMonthly(async (tx) => {
    const current = await authorize(tx, actor, true)
    const replayed = await replay(tx, current.id, data.requestId, hash)
    if (replayed) return { saved: replayed }
    await repository.lockMonth(tx, data.month)
    const snapshot = await state(tx, data.month)
    if (snapshot.token !== data.expectedToken)
      throw new MonthlyPayrollError(
        'უწყისი შეიცვალა. განაახლეთ გვერდი და გადაამოწმეთ ჩანაწერები.',
      )
    const activeRows = snapshot.rows.filter((r) => r.status !== 'voided')
    if (!activeRows.length)
      throw new MonthlyPayrollError('ჯერ დაამატეთ თანამშრომლის უწყისი.')
    if ((data.action === 'finalize') === snapshot.closed)
      throw new MonthlyPayrollError(
        'თვის მდგომარეობა შეიცვალა. განაახლეთ გვერდი.',
      )
    if (
      data.action === 'finalize' &&
      data.month > (await getCompanyWorkday(new Date(), tx)).date.slice(0, 7)
    )
      throw new MonthlyPayrollError('მომავალი თვის დასრულება ჯერ შეუძლებელია.')
    for (const row of activeRows) {
      const record = await repository.currentEntry(
        tx,
        row.employeeId,
        data.month,
      )
      if (!record) throw new MonthlyPayrollError('ჩანაწერი ვერ მოიძებნა.')
      const target = (
        await repository.history(tx, row.employeeId, data.month, 1)
      ).records[0]
      if (target.userId === current.id)
        throw new MonthlyPayrollError(
          'უწყისი თქვენს ჩანაწერსაც შეიცავს. მიმართეთ სხვა უფლებამოსილ პირს.',
        )
      if (data.action === 'finalize') {
        if (!record.salary)
          throw new MonthlyPayrollError(
            'თვის დასრულებამდე დაადასტურეთ ყველა თანამშრომლის საბაზო თანხა.',
          )
        const prepared = await source(tx, target.userId, data.month, true)
        if (prepared.sourceToken !== record.sourceToken)
          throw new MonthlyPayrollError(
            'დასაქმება ან ტარიფი შეიცვალა. ჯერ ხელახლა შეინახეთ შესაბამისი ჩანაწერი.',
          )
      }
      const { id: _id, createdAt: _created, ...values } = record
      await repository.insert(tx, {
        ...values,
        version: record.version + 1,
        status: data.action === 'finalize' ? 'finalized' : 'draft',
        actorId: current.id,
        reason: data.reason,
        requestId: data.requestId,
        commandHash: hash,
      })
    }
    return { saved: activeRows.length }
  })
}
export async function removeMonthlyEmployee(
  actor: Actor | null,
  input: unknown,
) {
  const data = monthlyRemoveSchema.parse(input),
    hash = fingerprint({ operation: 'remove', ...data })
  return repository.transactMonthly(async (tx) => {
    const current = await authorize(tx, actor, true)
    if (current.id === data.userId)
      throw new MonthlyPayrollError('საკუთარი უწყისის შეცვლა დაუშვებელია.')
    if (await replay(tx, current.id, data.requestId, hash)) return { saved: 1 }
    await repository.lockMonth(tx, data.month)
    if ((await state(tx, data.month)).closed)
      throw new MonthlyPayrollError('ჯერ გახსენით დასრულებული თვე.')
    const target = await salaries.person(tx, data.userId, true)
    if (!target) throw new MonthlyPayrollError('თანამშრომელი ვერ მოიძებნა.')
    const previous = await repository.currentEntry(tx, target.id, data.month)
    if (
      !previous ||
      previous.status !== 'draft' ||
      previous.version !== data.expectedVersion
    )
      throw new MonthlyPayrollError(
        'ჩანაწერი შეიცვალა. ხელახლა გახსენით ფორმა.',
      )
    const { id: _id, createdAt: _created, ...values } = previous
    await repository.insert(tx, {
      ...values,
      version: previous.version + 1,
      status: 'voided',
      actorId: current.id,
      reason: data.reason,
      requestId: data.requestId,
      commandHash: hash,
    })
    return { saved: 1 }
  })
}
