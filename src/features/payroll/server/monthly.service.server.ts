import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { assertPermissions } from '#/lib/authorization/access'
import {
  currentAuthorization,
  hasPermission,
} from '#/lib/authorization/permissions'
import { readEmploymentEligibility } from '#/features/employees/server/employment.service.server'
import { getCompanyWorkday } from '#/features/scheduling/server/scheduling.service.server'
import { followingDate } from '#/features/scheduling/scheduling.rules'
import { deliverNotificationBatch } from '#/features/notifications/server/notifications.service.server'
import { formatGeorgianMonth } from '#/lib/date-format'
import {
  paymentPreviewSchema,
  publishPaymentsSchema,
  monthlyDetailSchema,
  monthlySaveSchema,
  monthlyAdjustmentsSaveSchema,
  monthlySearchSchema,
  monthlyRemoveSchema,
} from '../monthly.schemas'
import {
  firstSalaryPayment,
  hourlyBase,
  monthlyBounds,
  monthlyTotals,
  paymentDateIssue,
  paymentWindow,
} from '../monthly.rules'
import {
  currentAccount,
  latestPolicy,
  lockPolicy,
  policyVersion,
} from './payroll-settings.repository.server'
import * as salaries from './salary.repository.server'
import * as repository from './monthly.repository.server'
import { evaluateEmployeeAttendancePayroll } from './attendance-payroll.service.server'
import { payStageLabel } from '../payroll-settings.schemas'
import type { Actor } from '#/lib/authorization/actor'
import type { MonthlyPaymentDates } from '../monthly.schemas'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type {
  MonthlyDetail,
  MonthlyDirectory,
  MonthlyEntry,
  MonthlySource,
  PaymentAmounts,
  PublishedPayment,
  PayStageWindow,
} from '../monthly.types'
import type {
  FineStage,
  PaymentSchedule,
  PayStage,
} from '../payroll-settings.schemas'

export class MonthlyPayrollError extends Error {}
class MonthlySalaryMissingError extends MonthlyPayrollError {}
class MonthlyEmploymentError extends MonthlyPayrollError {}
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
    firstPaymentMinor: r.firstPaymentMinor,
    fineStage: r.fineStage,
    paymentDates: r.paymentDates,
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
async function scheduleForMonth(
  tx: PayrollTransaction,
  month: string,
  publishedVersion?: number,
) {
  const version =
    publishedVersion ?? (await repository.monthPaymentPolicy(tx, month))
  return version ? policyVersion(tx, version) : latestPolicy(tx)
}

function paymentWindows(
  month: string,
  schedule: PaymentSchedule | null | undefined,
): PayStageWindow[] {
  if (!schedule) return []
  const stages = ['first', 'salary', 'adjustments'] as const
  return stages.flatMap((stage) => {
    const window = schedule[stage]
    return window ? [{ stage, ...paymentWindow(month, window) }] : []
  })
}

function updatedPaymentDates(
  month: string,
  previous: MonthlyPaymentDates | null | undefined,
  requested: MonthlyPaymentDates | undefined,
  payments: PublishedPayment[],
  schedule: PaymentSchedule | null | undefined,
) {
  if (!requested) return previous ?? null
  for (const stage of ['salary', 'adjustments'] as const) {
    const date = requested[stage]
    if (date === previous?.[stage]) continue
    if (payments.some((payment) => payment.stage === stage))
      throw new MonthlyPayrollError('გაცემული გადახდის თარიღი ვერ შეიცვლება.')
    if (!date) continue
    const opening = schedule
      ? paymentWindow(month, schedule[stage]).start
      : undefined
    const issue = paymentDateIssue(month, date, opening)
    if (issue) throw new MonthlyPayrollError(issue)
  }
  return requested
}

function assertPaymentEdits(
  payments: PublishedPayment[],
  amounts: PaymentAmounts,
  firstPaymentMinor: number | null,
  fineStage: FineStage,
) {
  const first = payments.find((line) => line.stage === 'first')
  const salary = payments.find((line) => line.stage === 'salary')
  const adjustments = payments.find((line) => line.stage === 'adjustments')
  if (
    (first &&
      (amounts.baseMinor < first.baseMinor ||
        (firstPaymentMinor !== null &&
          firstPaymentMinor !== first.baseMinor))) ||
    (salary &&
      (amounts.baseMinor !== salary.baseMinor + (first?.baseMinor ?? 0) ||
        salary.fineMinor !==
          (fineStage === 'salary' ? amounts.fineMinor : 0))) ||
    (adjustments &&
      (amounts.bonusMinor !== adjustments.bonusMinor ||
        amounts.premiumMinor !== adjustments.premiumMinor ||
        adjustments.fineMinor !==
          (fineStage === 'adjustments' ? amounts.fineMinor : 0)))
  ) {
    throw new MonthlyPayrollError(
      'გაცემული თანხების შეცვლა შეუძლებელია. შეგიძლიათ შეცვალოთ ჯერ გაუცემელი თანხები.',
    )
  }
}
async function source(
  tx: PayrollTransaction,
  userId: string,
  month: string,
  lock = false,
): Promise<MonthlySource & { employeeId: string }> {
  // Salary and employment writers lock this row for update.
  const target = await salaries.person(tx, userId, lock ? 'share' : undefined)
  if (!target) throw new MonthlyPayrollError('თანამშრომელი ვერ მოიძებნა.')
  const { start, end } = monthlyBounds(month)
  const eligibility = await readEmploymentEligibility(tx, {
    employeeId: target.id,
    startDate: start,
    endDate: end,
  })
  if (eligibility.status !== 'confirmed')
    throw new MonthlyEmploymentError(
      'ჯერ დაადასტურეთ თანამშრომლის დასაქმების თარიღები.',
    )
  const first = eligibility.periods.at(0)
  if (!first)
    throw new MonthlyEmploymentError(
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
function refreshedDraftBase(
  draft: {
    salary: MonthlyEntry['salary']
    sourceToken: string | null
    manualBase: boolean | null
    baseMinor: number | null
    firstPaymentMinor: number | null
  },
  prepared: MonthlySource,
  firstPaidBase: number | null,
): number | null | undefined {
  // An undefined result keeps the draft. Null means the amount needs review.
  if (prepared.sourceToken === draft.sourceToken) return undefined
  const { salary } = prepared
  if (
    draft.salary?.kind === 'monthly' &&
    salary.kind === 'monthly' &&
    salary.version !== draft.salary.version &&
    salary.amountBasis === 'net' &&
    draft.salary.amountBasis === salary.amountBasis &&
    !prepared.requiresBaseConfirmation &&
    (!draft.manualBase || draft.baseMinor === draft.salary.amountMinor) &&
    salary.amountMinor >= (firstPaidBase ?? draft.firstPaymentMinor ?? 0)
  )
    return salary.amountMinor
  return null
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
  exportAll = false,
): Promise<MonthlyDirectory> {
  const data = monthlySearchSchema.parse(input)
  return repository.transactMonthly(
    async (tx) => {
      const currentActor = await authorize(tx, actor)
      const now = new Date()
      const currentWorkday = await getCompanyWorkday(now, tx)
      const workday = !data.view && !data.period ? currentWorkday : null
      const month = data.month ?? currentWorkday.date.slice(0, 7)
      const snapshot = await state(tx, month)
      const policy = snapshot.closed ? null : await scheduleForMonth(tx, month)
      const windows = paymentWindows(month, policy?.schedule)
      const windowsByStage = new Map(
        windows.map((window) => [window.stage, window]),
      )
      const split = !data.view && Boolean(policy?.schedule?.first)
      const currentCalendar =
        split && !data.period && workday?.date.startsWith(`${month}-`)
          ? workday
          : null
      const defaultPeriod = currentCalendar
        ? Number(currentCalendar.date.slice(8)) <= 15
          ? 'first'
          : 'salary'
        : 'all'
      const period = split ? (data.period ?? defaultPeriod) : 'all'
      const includeUnprepared =
        !snapshot.closed &&
        data.view !== 'bonuses' &&
        hasPermission(currentActor, 'payroll.manage')
      const result = await repository.directory(
        tx,
        month,
        exportAll ? { ...data, page: 1 } : data,
        includeUnprepared ? currentActor.id : undefined,
        exportAll ? 1000 : undefined,
      )
      if (exportAll && result.total > 1000)
        throw new MonthlyPayrollError(
          'ექსპორტის ლიმიტი 1 000 თანამშრომელია. დააზუსტეთ ძიება.',
        )
      const { start, end } = monthlyBounds(month)
      const salaryLookupIds =
        data.view === 'bonuses' || snapshot.closed
          ? []
          : result.records
              .filter(
                (row) =>
                  !row.salary ||
                  (row.status === 'draft' &&
                    row.salary.kind === 'monthly' &&
                    !row.salaryPaidOn),
              )
              .map((row) => row.employeeId)
      const terms = salaryLookupIds.length
        ? await repository.directorySalaryTerms(tx, salaryLookupIds, start, end)
        : []
      const salaryByEmployee = new Map(
        terms.map((term) => [term.employeeId, term]),
      )
      const revisedDrafts = new Map<
        string,
        { salary: MonthlySource['salary']; baseMinor: number | null }
      >()
      await Promise.all(
        result.records.map(async (row) => {
          const term = salaryByEmployee.get(row.employeeId)
          if (
            !term ||
            row.status !== 'draft' ||
            row.salary?.kind !== 'monthly' ||
            (term.salary.version === row.salary.version &&
              row.salary.effectiveFrom <= start)
          )
            return
          try {
            const prepared = await source(tx, row.userId, month)
            const baseMinor = refreshedDraftBase(
              row,
              prepared,
              row.firstPaidBase,
            )
            if (baseMinor !== undefined)
              revisedDrafts.set(row.employeeId, {
                salary: prepared.salary,
                baseMinor,
              })
          } catch (error) {
            if (!(error instanceof MonthlyPayrollError)) throw error
            revisedDrafts.set(row.employeeId, {
              salary: term.salary,
              baseMinor: null,
            })
          }
        }),
      )
      const attendanceEvaluations = new Map<
        string,
        Awaited<ReturnType<typeof evaluateEmployeeAttendancePayroll>>['evaluation']
      >()
      if (!snapshot.closed) {
        await Promise.all(
          result.records.map(async (row) => {
            const { evaluation } = await evaluateEmployeeAttendancePayroll(tx, {
              employeeId: row.employeeId,
              userId: row.userId,
              employeeName: row.employeeName,
              month,
              today: currentWorkday.date,
              timezone: currentWorkday.timezone,
            })
            attendanceEvaluations.set(row.employeeId, evaluation)
          }),
        )
      }
      const records = result.records.map(
        ({
          employeeId,
          sourceToken: _sourceToken,
          manualBase: _manualBase,
          fineStage: storedFineStage,
          paymentDates,
          firstPaidOn,
          salaryPaidOn,
          salaryBaseMinor,
          firstPaidBase,
          salaryPaidFine,
          firstPaymentMinor,
          adjustmentsPaidOn,
          salaryFinePaidOn,
          ...row
        }) => {
          const term = salaryByEmployee.get(employeeId)
          const revised = revisedDrafts.get(employeeId)
          const attendanceEval = attendanceEvaluations.get(employeeId)
          const autoBonusMinor = adjustmentsPaidOn
            ? 0
            : (attendanceEval?.autoBonusMinor ?? 0)
          const salary = revised?.salary ?? row.salary ?? term?.salary ?? null
          const automatic =
            term?.fullEmployment &&
            term.salary.kind === 'monthly' &&
            term.salary.amountBasis === 'net' &&
            term.salary.effectiveFrom <= start
          const autoMixedBase =
            !row.salary &&
            salary?.amountBasis === 'net' &&
            attendanceEval?.fixedProrationComplete
              ? attendanceEval.proratedFixedMinor +
                attendanceEval.hourlyCalculatedMinor
              : null
          const autoHourlyBase =
            !row.salary &&
            autoMixedBase === null &&
            salary?.kind === 'hourly' &&
            salary.amountBasis === 'net' &&
            (attendanceEval?.hourlyCalculatedMinor ?? 0) > 0
              ? attendanceEval!.hourlyCalculatedMinor
              : null
          // An adjustments-only revision stores zero without preparing a base.
          const baseMinor = salaryPaidOn
            ? salaryBaseMinor
            : revised
              ? revised.baseMinor
              : row.salary
                ? row.baseMinor
                : autoMixedBase !== null
                  ? autoMixedBase
                  : automatic
                    ? term.salary.amountMinor
                    : autoHourlyBase
          const effectiveBonusMinor =
            row.bonusMinor === null && autoBonusMinor === 0
              ? null
              : (row.bonusMinor ?? 0) + autoBonusMinor
          const calculatedTotal =
            baseMinor === null
              ? null
              : baseMinor +
                (effectiveBonusMinor ?? 0) +
                (row.premiumMinor ?? 0) -
                (row.fineMinor ?? 0)
          const fineStage =
            storedFineStage ?? policy?.schedule?.fineStage ?? 'salary'
          const hasSalaryFine = fineStage === 'salary' && Boolean(row.fineMinor)
          const hasAdjustments = Boolean(
            effectiveBonusMinor ||
            row.premiumMinor ||
            (fineStage === 'adjustments' && row.fineMinor),
          )
          const scheduled = (stage: PayStage, preferred?: string) => {
            const window = windowsByStage.get(stage)
            if (preferred && (!window || preferred >= window.start))
              return { start: preferred, end: preferred }
            return window ? { start: window.start, end: window.end } : undefined
          }
          const firstWindow = scheduled('first')
          const salaryWindow = scheduled(
            'salary',
            hasSalaryFine ? paymentDates?.salary : undefined,
          )
          const adjustmentsWindow = scheduled(
            'adjustments',
            paymentDates?.adjustments,
          )
          const payoutDates = {
            first:
              firstPaidOn ||
              (salary &&
                !salaryPaidOn &&
                firstWindow &&
                firstPaymentMinor !== 0)
                ? {
                    ...firstWindow,
                    ...(firstPaidOn ? { paidOn: firstPaidOn } : {}),
                  }
                : undefined,
            salary:
              salaryPaidOn || ((salary || hasSalaryFine) && salaryWindow)
                ? {
                    ...salaryWindow,
                    ...(salaryPaidOn ? { paidOn: salaryPaidOn } : {}),
                  }
                : undefined,
            adjustments:
              adjustmentsPaidOn || (hasAdjustments && adjustmentsWindow)
                ? {
                    ...adjustmentsWindow,
                    ...(adjustmentsPaidOn ? { paidOn: adjustmentsPaidOn } : {}),
                  }
                : undefined,
          }
          const adjustmentDates = (['adjustments', 'salary'] as const).flatMap(
            (stage) => {
              const actual =
                stage === 'salary' ? salaryFinePaidOn : adjustmentsPaidOn
              if (actual) return [{ stage, start: actual, paid: true }]
              const window =
                stage === 'salary'
                  ? hasSalaryFine && salaryWindow
                  : hasAdjustments && adjustmentsWindow
              return window
                ? [
                    {
                      stage,
                      start: window.start,
                      ...(window.start !== window.end
                        ? { end: window.end }
                        : {}),
                      paid: false,
                    },
                  ]
                : []
            },
          )
          const attendanceReviewCount = attendanceEval
            ? attendanceEval.salaryNeedsReviewCount +
              attendanceEval.adjustmentsNeedsReviewCount
            : 0
          const full = {
            ...row,
            salary,
            baseMinor,
            bonusMinor: effectiveBonusMinor,
            totalMinor:
              row.salary && !revised && !salaryPaidOn && autoBonusMinor === 0
                ? row.totalMinor
                : calculatedTotal !== null && calculatedTotal >= 0
                  ? calculatedTotal
                  : null,
            baseNeedsConfirmation:
              baseMinor === null && salary !== null && !snapshot.closed,
            hasMixedSalaryKinds: attendanceEval?.hasMixedSalaryKinds ?? false,
            attendanceReviewCount,
            adjustmentDates,
            payoutDates,
          }
          if (period === 'all') return full
          const plannedFirst =
            baseMinor === null
              ? null
              : !row.salary && autoMixedBase !== null
                ? Math.min(
                    autoMixedBase,
                    (attendanceEval?.firstHalfProratedFixedMinor ?? 0) +
                      (attendanceEval?.firstHalfHourlyMinor ?? 0),
                  )
                : salary?.kind === 'monthly'
                  ? firstSalaryPayment(baseMinor, firstPaymentMinor)
                  : !row.salary && autoHourlyBase !== null
                    ? (attendanceEval?.firstHalfHourlyMinor ?? 0)
                    : baseMinor
          const first = period === 'first'
          const published = first
            ? firstPaidBase !== null
            : Boolean(salaryPaidOn)
          // Hourly hours are cumulative. Without a first payment there is no second-part balance yet.
          const installment = first
            ? (firstPaidBase ?? (salaryPaidOn ? null : plannedFirst))
            : salaryPaidOn
              ? salaryBaseMinor - (firstPaidBase ?? 0)
              : baseMinor !== null &&
                  (firstPaidBase !== null ||
                    salary?.kind === 'monthly' ||
                    autoMixedBase !== null ||
                    autoHourlyBase !== null)
                ? baseMinor - (firstPaidBase ?? plannedFirst ?? 0)
                : null
          const fineMinor = first
            ? 0
            : published
              ? (salaryPaidFine ?? 0)
              : fineStage === 'salary'
                ? (row.fineMinor ?? 0)
                : 0
          const totalMinor =
            installment === null || installment < fineMinor
              ? null
              : installment - fineMinor
          return {
            ...full,
            baseMinor:
              installment !== null && installment >= 0 ? installment : null,
            bonusMinor: null,
            premiumMinor: null,
            fineMinor,
            totalMinor,
            paidMinor: published ? totalMinor : null,
          }
        },
      )
      return {
        month,
        entryCount: snapshot.rows.filter((row) => row.status !== 'voided')
          .length,
        closed: snapshot.closed,
        paymentWindows: windows,
        period,
        nextPeriodChangeAt:
          currentCalendar && !exportAll
            ? await repository.periodBoundary(
                tx,
                period === 'first' ? `${month}-16` : followingDate(end),
                currentCalendar.timezone,
              )
            : null,
        records,
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
      const currentActor = await authorize(tx, actor)
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
      const policy = await scheduleForMonth(tx, data.month)
      let currentSource: MonthlySource | null = null,
        sourceMessage: string | null = null,
        salaryMissing = false,
        employmentNeedsReview = false
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
        employmentNeedsReview = error instanceof MonthlyEmploymentError
        // Employment validation can stop source resolution before it checks salary.
        salaryMissing =
          error instanceof MonthlySalaryMissingError ||
          !(await salaries.applicable(
            tx,
            target.id,
            monthlyBounds(data.month).end,
          ))
      }
      const closed = (await state(tx, data.month)).closed
      const payments = await repository.employeePayments(
        tx,
        target.id,
        data.month,
      )
      const entry = latest.at(0)?.entry
      const workday = await getCompanyWorkday(new Date(), tx)
      const attendanceSummary = closed
        ? null
        : (
            await evaluateEmployeeAttendancePayroll(tx, {
              employeeId: target.id,
              userId: target.userId,
              employeeName: target.name,
              month: data.month,
              today: workday.date,
              timezone: workday.timezone,
            })
          ).evaluation
      return {
        timezone: workday.timezone,
        source: currentSource,
        baseNeedsReview:
          !closed &&
          entry?.status === 'draft' &&
          !!entry.salary &&
          !!currentSource &&
          !payments.some((payment) => payment.stage === 'salary') &&
          refreshedDraftBase(
            entry,
            currentSource,
            payments.find((payment) => payment.stage === 'first')?.baseMinor ??
              null,
          ) === null,
        sourceMessage,
        salaryMissing,
        employmentNeedsReview,
        canOpenEmployeeProfile: hasPermission(currentActor, 'employees.manage'),
        current: latest[0] ? projection(latest[0]) : null,
        history: rows.records.map(projection),
        total: rows.total,
        pageSize: repository.historyPageSize,
        closed,
        payments,
        firstPaymentEnabled: Boolean(policy?.schedule?.first),
        defaultFineStage: policy?.schedule?.fineStage ?? 'salary',
        paymentWindows: paymentWindows(data.month, policy?.schedule),
        attendanceSummary,
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
      throw new MonthlyPayrollError('ეს თვე ძველი ფორმატით არის დასრულებული.')
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
        'არასრული თვის ან შეცვლილი ტარიფის შემთხვევაში დაადასტურეთ თვის ხელფასი.',
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
    const draft = previous?.status === 'draft' ? previous : null
    const fineStage =
      data.fineStage === undefined ? (draft?.fineStage ?? null) : data.fineStage
    const payments = await repository.employeePayments(
      tx,
      prepared.employeeId,
      data.month,
    )
    const policy = await scheduleForMonth(tx, data.month)
    const paymentDates = updatedPaymentDates(
      data.month,
      previous?.paymentDates,
      data.paymentDates,
      payments,
      policy?.schedule,
    )
    const allowsFirstOverride =
      policy?.schedule?.first && prepared.salary.kind === 'monthly'
    const firstPaymentMinor =
      data.firstPaymentMinor === undefined
        ? allowsFirstOverride
          ? (draft?.firstPaymentMinor ?? null)
          : null
        : data.firstPaymentMinor
    if (
      firstPaymentMinor !== null &&
      (!allowsFirstOverride || firstPaymentMinor > baseMinor)
    )
      throw new MonthlyPayrollError(
        'პირველი გადახდა თვის ხელფასს არ უნდა აღემატებოდეს.',
      )
    assertPaymentEdits(
      payments,
      { ...totals, baseMinor },
      firstPaymentMinor,
      fineStage ?? policy?.schedule?.fineStage ?? 'salary',
    )
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
          : (data.baseReason ?? 'თვის ხელფასი დადასტურებულია.'),
      baseMinor,
      firstPaymentMinor,
      fineStage,
      paymentDates,
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
      throw new MonthlyPayrollError('ეს თვე ძველი ფორმატით არის დასრულებული.')
    const target = await salaries.person(tx, data.userId, 'share')
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
    const totals = checkedTotals(baseMinor, adjustments, !draft?.salary)
    const payments = await repository.employeePayments(
      tx,
      target.id,
      data.month,
    )
    const policy = await scheduleForMonth(tx, data.month)
    const paymentDates = updatedPaymentDates(
      data.month,
      draft?.paymentDates,
      data.paymentDates,
      payments,
      policy?.schedule,
    )
    // Adjustment-only drafts may coexist with a fixed salary issued from the agreement.
    const publishedBase = payments
      .filter((line) => line.stage !== 'adjustments')
      .reduce((sum, line) => sum + line.baseMinor, 0)
    const fineStage =
      data.fineStage === undefined ? (draft?.fineStage ?? null) : data.fineStage
    assertPaymentEdits(
      payments,
      { ...totals, baseMinor: draft?.salary ? baseMinor : publishedBase },
      draft?.firstPaymentMinor ?? null,
      fineStage ?? policy?.schedule?.fineStage ?? 'salary',
    )
    await repository.insert(tx, {
      employeeId: target.id,
      month: `${data.month}-01`,
      version: data.expectedVersion + 1,
      status:
        !draft?.salary && !adjustments.length && !payments.length
          ? 'voided'
          : 'draft',
      salary: draft?.salary ?? null,
      sourceToken: draft?.sourceToken ?? null,
      workedSeconds: draft?.workedSeconds ?? 0,
      manualBase: draft?.manualBase ?? false,
      baseReason: draft?.baseReason ?? '',
      baseMinor,
      adjustments,
      firstPaymentMinor: draft?.firstPaymentMinor,
      fineStage,
      paymentDates,
      ...totals,
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
async function planPayment(
  tx: PayrollTransaction,
  actorId: string,
  {
    month,
    stage,
    userId: selectedUserId,
  }: z.infer<typeof paymentPreviewSchema>,
  lock: boolean,
) {
  const companyWorkday = await getCompanyWorkday(new Date(), tx)
  const paidOn = companyWorkday.date
  if ((await state(tx, month)).closed)
    throw new MonthlyPayrollError('ეს თვე ძველი ფორმატით არის დასრულებული.')
  if (selectedUserId === actorId)
    throw new MonthlyPayrollError(
      'საკუთარი თანხა სხვა უფლებამოსილმა პირმა უნდა გასცეს.',
    )
  const candidates = await repository.paymentCandidates(
    tx,
    month,
    monthlyBounds(month).end,
    selectedUserId,
  )
  const target = selectedUserId === undefined ? undefined : candidates[0]
  if (selectedUserId !== undefined && !target)
    throw new MonthlyPayrollError('თანამშრომელი ვერ მოიძებნა.')
  if (candidates.length > 1000)
    throw new MonthlyPayrollError(
      'ერთი თვის უწყისი მაქსიმუმ 1 000 თანამშრომელს მოიცავს.',
    )
  const issued = await repository.monthPayments(tx, month, target?.employeeId)
  // The first payment for anyone in the month pins the schedule for everyone.
  const policy = target
    ? await scheduleForMonth(tx, month)
    : issued.length
      ? await scheduleForMonth(tx, month, issued[0].policyVersion)
      : await latestPolicy(tx)
  const schedule = policy?.schedule
  if (!policy || !schedule)
    throw new MonthlyPayrollError('ჯერ შეინახეთ ხელფასის გაცემის გრაფიკი.')
  const window = schedule[stage]
  if (!window)
    throw new MonthlyPayrollError('გაცემის ეს ეტაპი გრაფიკში არ არის.')
  const dates = paymentWindow(month, window)
  const byEmployee = new Map<string, typeof issued>()
  for (const line of issued) {
    const employeeLines = byEmployee.get(line.employeeId) ?? []
    employeeLines.push(line)
    byEmployee.set(line.employeeId, employeeLines)
  }
  const ready: (PaymentAmounts & {
    employeeId: string
    userId: string
    name: string
  })[] = []
  const pending: { name: string; message: string }[] = []
  for (const person of candidates.sort((a, b) =>
    a.userId.localeCompare(b.userId),
  )) {
    const { employeeId, userId, name, draft } = person
    const entry = draft?.status === 'draft' ? draft : null
    const payments = byEmployee.get(employeeId) ?? []
    if (
      payments.some(
        (line) =>
          line.stage === stage ||
          (stage === 'first' && line.stage === 'salary'),
      )
    )
      continue
    const fineStage = entry?.fineStage ?? schedule.fineStage
    const { evaluation: attendanceEval } =
      await evaluateEmployeeAttendancePayroll(tx, {
        employeeId,
        userId,
        employeeName: name,
        month,
        today: paidOn,
        timezone: companyWorkday.timezone,
      })
    const bonusMinor =
      stage === 'adjustments'
        ? (entry?.bonusMinor ?? 0) + attendanceEval.autoBonusMinor
        : 0
    const premiumMinor =
      stage === 'adjustments' ? (entry?.premiumMinor ?? 0) : 0
    const fineMinor = stage === fineStage ? (entry?.fineMinor ?? 0) : 0
    if (
      stage === 'adjustments' &&
      !bonusMinor &&
      !premiumMinor &&
      !fineMinor &&
      attendanceEval.adjustmentsNeedsReviewCount === 0
    )
      continue
    try {
      if (userId === actorId)
        throw new MonthlyPayrollError(
          'საკუთარი თანხა სხვა უფლებამოსილმა პირმა უნდა გასცეს.',
        )
      if (
        stage === 'adjustments' &&
        attendanceEval.adjustmentsNeedsReviewCount > 0
      )
        throw new MonthlyPayrollError(
          'დასწრებით გამოთვლილი ბონუსი საჭიროებს HR-ის ან ადმინისტრატორის გადამოწმებას.',
        )
      if (stage !== 'adjustments' && attendanceEval.salaryNeedsReviewCount > 0)
        throw new MonthlyPayrollError(
          'დასწრების გადასამოწმებელი ჩანაწერები დასადასტურებელია HR-ის ან ადმინისტრატორის მიერ.',
        )
      const plannedDate =
        stage === 'adjustments' || (stage === 'salary' && fineMinor)
          ? entry?.paymentDates?.[stage]
          : undefined
      if (plannedDate && paidOn < plannedDate)
        throw new MonthlyPayrollError(
          'ამ თანამშრომლისთვის არჩეული გადახდის თარიღი ჯერ არ დამდგარა.',
        )
      const prepared = await source(tx, userId, month, lock)
      if (prepared.salary.amountBasis !== 'net')
        throw new MonthlyPayrollError(
          'განსაზღვრეთ თანამშრომლისთვის გასაცემი თანხა.',
        )
      let baseMinor = 0
      if (stage !== 'adjustments') {
        const first = payments.find((line) => line.stage === 'first')
        const refreshed = entry?.salary
          ? refreshedDraftBase(entry, prepared, first?.baseMinor ?? null)
          : undefined
        if (refreshed === null)
          throw new MonthlyPayrollError(
            'ხელფასი ან დასაქმების თარიღები შეიცვალა. ხელახლა შეინახეთ უწყისი.',
          )
        const hasAutoMixed =
          !entry?.salary && attendanceEval.fixedProrationComplete
        const hasAutoHourly =
          !entry?.salary &&
          !hasAutoMixed &&
          prepared.salary.kind === 'hourly' &&
          attendanceEval.hourlyCalculatedMinor > 0
        if (
          !entry?.salary &&
          !hasAutoMixed &&
          !hasAutoHourly &&
          (prepared.salary.kind === 'hourly' ||
            prepared.requiresBaseConfirmation)
        )
          throw new MonthlyPayrollError(
            'ჯერ დაადასტურეთ თვის ხელფასი ან სამუშაო საათები.',
          )
        const base =
          refreshed ??
          (entry?.salary
            ? entry.baseMinor
            : hasAutoMixed
              ? attendanceEval.proratedFixedMinor +
                attendanceEval.hourlyCalculatedMinor
              : hasAutoHourly
                ? attendanceEval.hourlyCalculatedMinor
                : prepared.salary.amountMinor)
        baseMinor =
          stage === 'first'
            ? hasAutoMixed
              ? Math.min(
                  base,
                  attendanceEval.firstHalfProratedFixedMinor +
                    attendanceEval.firstHalfHourlyMinor,
                )
              : prepared.salary.kind === 'monthly'
                ? firstSalaryPayment(base, entry?.firstPaymentMinor ?? null)
                : hasAutoHourly
                  ? attendanceEval.firstHalfHourlyMinor
                  : base
            : base - (first?.baseMinor ?? 0)
        if (baseMinor < 0)
          throw new MonthlyPayrollError(
            'თვის თანხა უკვე გაცემულ პირველ ნაწილზე ნაკლებია.',
          )
      }
      const totalMinor = baseMinor + bonusMinor + premiumMinor - fineMinor
      if (totalMinor < 0)
        throw new MonthlyPayrollError(
          'ამ ეტაპზე ჯარიმა გასაცემ თანხაზე მეტია. გადაამოწმეთ დაქვითვის ეტაპი.',
        )
      if (baseMinor || bonusMinor || premiumMinor || fineMinor)
        ready.push({
          employeeId,
          userId,
          name,
          baseMinor,
          bonusMinor,
          premiumMinor,
          fineMinor,
          totalMinor,
        })
    } catch (error) {
      if (!(error instanceof MonthlyPayrollError)) throw error
      pending.push({ name, message: error.message })
    }
  }
  const token = fingerprint({
    month,
    stage,
    userId: selectedUserId,
    paidOn,
    policy: policy.version,
    ready: ready.map(({ userId: _userId, ...line }) => line),
  })
  return {
    ...dates,
    policyVersion: policy.version,
    firstPaymentEnabled: !!schedule.first,
    paidOn,
    available: paidOn >= dates.start,
    ready,
    pending,
    token,
  }
}

export async function previewMonthlyPayments(
  actor: Actor | null,
  input: unknown,
) {
  const data = paymentPreviewSchema.parse(input)
  return repository.transactMonthly(
    async (tx) => {
      const current = await authorize(tx, actor, true)
      const {
        ready,
        firstPaymentEnabled: _firstPaymentEnabled,
        ...preview
      } = await planPayment(tx, current.id, data, false)
      return {
        ...preview,
        ready: ready.map(
          ({ employeeId: _employeeId, userId: _userId, ...line }) => line,
        ),
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}

export async function publishMonthlyPayments(
  actor: Actor | null,
  input: unknown,
) {
  const data = publishPaymentsSchema.parse(input)
  const commandHash = fingerprint(data)
  return repository.transactMonthly(async (tx) => {
    const current = await authorize(tx, actor, true)
    await repository.lockCommand(tx, current.id, data.requestId)
    const existing = await repository.paymentRetries(
      tx,
      current.id,
      data.requestId,
    )
    if (existing.length) {
      if (existing.some((line) => line.commandHash !== commandHash))
        throw new MonthlyPayrollError(
          'ეს მოთხოვნა უკვე გამოყენებულია სხვა თანხებისთვის.',
        )
      return { saved: existing.length }
    }
    await repository.lockMonth(tx, data.month)
    await lockPolicy(tx)
    const plan = await planPayment(tx, current.id, data, true)
    if (!plan.available)
      throw new MonthlyPayrollError('გაცემის პერიოდი ჯერ არ დაწყებულა.')
    if (plan.token !== data.expectedToken)
      throw new MonthlyPayrollError(
        'გასაცემი თანხები შეიცვალა. ხელახლა გადაამოწმეთ სია.',
      )
    if (!plan.ready.length)
      throw new MonthlyPayrollError('გასაცემი ჩანაწერები ჯერ არ არის.')
    await repository.insertPayments(
      tx,
      plan.ready.map(({ name: _name, userId: _userId, ...line }) => ({
        ...line,
        month: `${data.month}-01`,
        stage: data.stage,
        policyVersion: plan.policyVersion,
        actorId: current.id,
        paidOn: plan.paidOn,
        requestId: data.requestId,
        commandHash,
      })),
    )
    const monthLabel = formatGeorgianMonth(data.month)
    const componentList = new Intl.ListFormat('ka')
    await deliverNotificationBatch(
      tx,
      plan.ready.map((line) => {
        const components = [
          ...(line.baseMinor
            ? [payStageLabel(data.stage, plan.firstPaymentEnabled)]
            : []),
          ...(line.bonusMinor ? ['ბონუსი'] : []),
          ...(line.premiumMinor ? ['პრემია'] : []),
          ...(line.fineMinor ? ['ჯარიმის დაქვითვა'] : []),
        ]
        return {
          eventKey: `payroll:published:${data.month}:${data.stage}`,
          recipientIds: [line.userId],
          title:
            data.stage === 'adjustments'
              ? 'სახელფასო დამატებების განახლება'
              : 'ხელფასის გაცემა აისახა',
          body: `${monthLabel}. ${componentList.format(components)} აისახა თქვენს სახელფასო ჩანაწერში.`,
          destination: { kind: 'payroll', month: data.month },
        }
      }),
    )
    return { saved: plan.ready.length }
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
      throw new MonthlyPayrollError('ეს თვე ძველი ფორმატით არის დასრულებული.')
    const target = await salaries.person(tx, data.userId, 'share')
    if (!target) throw new MonthlyPayrollError('თანამშრომელი ვერ მოიძებნა.')
    if ((await repository.employeePayments(tx, target.id, data.month)).length)
      throw new MonthlyPayrollError(
        'გაცემული თანხის მქონე ჩანაწერი ვერ ამოიღება.',
      )
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
      reason: data.reason || 'თვის ჩანაწერი ამოღებულია.',
      requestId: data.requestId,
      commandHash: hash,
    })
    return { saved: 1 }
  })
}
