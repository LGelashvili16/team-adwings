import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { assertPermission } from '#/lib/authorization/access'
import {
  currentAuthorization,
  hasAnyPermission,
  hasPermission,
} from '#/lib/authorization/permissions'
import { readEmploymentEligibility } from '#/features/employees/server/employment.service.server'
import { readGpsVisitsForPayroll } from '#/features/gps/server/gps-geofence-presence.service.server'
import {
  getCompanyWorkday,
  getHistoricalEmployeeSchedule,
} from '#/features/scheduling/server/scheduling.service.server'
import { monthlyBounds } from '../monthly.rules'
import {
  evaluateAttendancePayrollMonth,
  resolveRestDayPolicy,
  resolveSalaryTermOnDate,
} from '../attendance-payroll.rules'
import {
  attendancePayrollDetailSchema,
  attendancePayrollReviewSearchSchema,
  saveAttendancePayrollDecisionSchema,
} from '../attendance-payroll.schemas'
import { currentAccount } from './payroll-settings.repository.server'
import * as salaries from './salary.repository.server'
import * as monthlyRepository from './monthly.repository.server'
import * as policyRepository from './rest-day-policy.repository.server'
import * as repository from './attendance-payroll.repository.server'
import type { PayrollTransaction } from './payroll-settings.repository.server'
import type { Actor } from '#/lib/authorization/actor'
import type {
  AttendancePayrollDecisionRecord,
  AttendancePayrollEmployeeDetail,
  AttendancePayrollReviewDirectory,
  EmployeeAttendancePayrollEvaluation,
} from '../attendance-payroll.types'
import type { GpsJobVisitPayrollInput } from '../attendance-payroll.rules'

export class AttendancePayrollError extends Error {}

function shiftDate(date: string, delta: number) {
  const dt = new Date(`${date}T12:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function authorize(
  tx: PayrollTransaction,
  actor: Actor | null,
  write: boolean,
) {
  if (!actor) throw new AuthorizationError()
  const { account, person } = await currentAccount(tx, actor.id)
  if (!account || account.state !== 'active' || person?.status === 'inactive')
    throw new AuthorizationError()
  const current = { ...actor, ...currentAuthorization(account) }
  assertPermission(current, 'manage.access')
  if (write) {
    assertPermission(current, 'payroll.attendance.review')
  } else if (
    !hasAnyPermission(current, ['payroll.attendance.review', 'payroll.read.all'])
  ) {
    throw new AuthorizationError()
  }
  return current
}

/** Optional hook populated once GPS job visits are enabled (Phase 4). */
export type GpsVisitsReader = (
  tx: PayrollTransaction,
  employeeId: string,
  startDate: string,
  endDate: string,
) => Promise<GpsJobVisitPayrollInput[]>

let registeredGpsVisitsReader: GpsVisitsReader | null = null
export function registerGpsVisitsPayrollReader(reader: GpsVisitsReader) {
  registeredGpsVisitsReader = reader
}

/** Internal evaluation shared by HR/admin review screens and monthly payroll calculations. Caller owns transaction and authorization. */
export async function evaluateEmployeeAttendancePayroll(
  tx: PayrollTransaction,
  params: {
    employeeId: string
    userId: string
    employeeName: string
    month: string
    today: string
    timezone: string
  },
): Promise<{
  evaluation: EmployeeAttendancePayrollEvaluation
  history: Record<string, AttendancePayrollDecisionRecord[]>
}> {
  const { start, end } = monthlyBounds(params.month)
  const prevDay = shiftDate(start, -1)
  const nextDay = shiftDate(end, 1)

  const [
    eligibility,
    salaryRows,
    scheduleDays,
    approvedLeaves,
    restDayTimeline,
    sessions,
    decisionRows,
    gpsVisits,
  ] = await Promise.all([
    readEmploymentEligibility(tx, {
      employeeId: params.employeeId,
      startDate: start,
      endDate: end,
    }),
    monthlyRepository.salarySources(tx, params.employeeId, start, end),
    getHistoricalEmployeeSchedule(tx, {
      employeeId: params.employeeId,
      startDate: start,
      endDate: end,
    }),
    repository.readApprovedLeavesInMonth(tx, params.userId, start, end),
    policyRepository.readEmployeeRestDayPolicyTimeline(
      tx,
      params.employeeId,
      end,
    ),
    repository.readMonthAttendanceSessions(tx, params.employeeId, prevDay, nextDay),
    repository.readEmployeeMonthDecisions(tx, params.employeeId, params.month),
    registeredGpsVisitsReader
      ? registeredGpsVisitsReader(tx, params.employeeId, start, end)
      : readGpsVisitsForPayroll(tx, params.employeeId, start, end),
  ])

  const salaryTerms = salaryRows.map((row) => ({
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    kind: row.kind,
    amountBasis: row.amountBasis,
    amountMinor: row.amountMinor,
    currency: row.currency,
  }))

  const latestDecisionByKey = new Map<string, AttendancePayrollDecisionRecord>()
  const history: Record<string, AttendancePayrollDecisionRecord[]> = {}
  for (const row of decisionRows) {
    const record: AttendancePayrollDecisionRecord = {
      version: row.version,
      action: row.action,
      sourceHash: row.sourceHash,
      calculatedSeconds: row.calculatedSeconds,
      overrideSeconds: row.overrideSeconds,
      calculatedAmountMinor: row.calculatedAmountMinor,
      overrideAmountMinor: row.overrideAmountMinor,
      note: row.note,
      reason: row.reason,
      actorName: row.actorName,
      recordedAt: row.createdAt.toISOString(),
    }
    if (!latestDecisionByKey.has(row.itemKey)) {
      latestDecisionByKey.set(row.itemKey, record)
    }
    const bucket = history[row.itemKey] ?? []
    bucket.push(record)
    history[row.itemKey] = bucket
  }

  const effectiveToday = params.today < end ? params.today : end
  const currentPolicy = resolveRestDayPolicy(restDayTimeline, effectiveToday)
  const latestSalary = resolveSalaryTermOnDate(salaryTerms, end)

  const computed = evaluateAttendancePayrollMonth({
    month: params.month,
    today: params.today,
    timezone: params.timezone,
    employmentPeriods: eligibility.periods,
    employmentConfirmed: eligibility.status === 'confirmed',
    salaryTerms,
    scheduleDays,
    approvedLeaves: approvedLeaves.map((leave) => ({
      kind: leave.kind,
      startDate: leave.startDate,
      endDate: leave.endDate,
    })),
    restDayPolicyTimeline: restDayTimeline,
    sessions,
    gpsVisits,
    decisionsByKey: latestDecisionByKey,
  })

  return {
    evaluation: {
      userId: params.userId,
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      month: params.month,
      timezone: params.timezone,
      salary: latestSalary,
      restDayClockInAllowed: currentPolicy.restDayClockInAllowed,
      autoRestDayBonusEnabled: currentPolicy.autoRestDayBonusEnabled,
      ...computed,
    },
    history,
  }
}

export async function readAttendancePayrollReview(
  actor: Actor | null,
  input: unknown,
): Promise<AttendancePayrollReviewDirectory> {
  const data = attendancePayrollReviewSearchSchema.parse(input)
  return repository.transactAttendancePayroll(
    async (tx) => {
      const currentActor = await authorize(tx, actor, false)
      const workday = await getCompanyWorkday(new Date(), tx)
      const month = data.month ?? workday.date.slice(0, 7)
      const people = await repository.listReviewEmployees(tx, data.q)

      const evaluated = await Promise.all(
        people.map(async (person) => {
          const { evaluation } = await evaluateEmployeeAttendancePayroll(tx, {
            employeeId: person.employeeId,
            userId: person.userId,
            employeeName: person.fullName,
            month,
            today: workday.date,
            timezone: workday.timezone,
          })
          return {
            userId: evaluation.userId,
            employeeName: evaluation.employeeName,
            salaryKind: evaluation.salary?.kind ?? null,
            hasMixedSalaryKinds: evaluation.hasMixedSalaryKinds,
            proratedFixedMinor: evaluation.proratedFixedMinor,
            autoRestDayBonusEnabled: evaluation.autoRestDayBonusEnabled,
            restDayClockInAllowed: evaluation.restDayClockInAllowed,
            autoBonusMinor: evaluation.autoBonusMinor,
            hourlyCalculatedMinor: evaluation.hourlyCalculatedMinor,
            hourlyPayableSeconds: evaluation.hourlyPayableSeconds,
            needsReviewCount:
              evaluation.salaryNeedsReviewCount +
              evaluation.adjustmentsNeedsReviewCount,
            totalItems: evaluation.items.length,
          }
        }),
      )

      const filtered = data.onlyFlagged
        ? evaluated.filter((row) => row.needsReviewCount > 0)
        : evaluated

      // Put employees needing review first, then alphabetically.
      filtered.sort(
        (a, b) =>
          (b.needsReviewCount > 0 ? 1 : 0) - (a.needsReviewCount > 0 ? 1 : 0) ||
          b.needsReviewCount - a.needsReviewCount ||
          a.employeeName.localeCompare(b.employeeName, 'ka'),
      )

      const total = filtered.length
      const startIndex = (data.page - 1) * repository.reviewPageSize
      const records = filtered.slice(
        startIndex,
        startIndex + repository.reviewPageSize,
      )

      return {
        month,
        records,
        total,
        pageSize: repository.reviewPageSize,
        canReview: hasPermission(currentActor, 'payroll.attendance.review'),
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}

export async function readEmployeeAttendancePayrollDetail(
  actor: Actor | null,
  input: unknown,
): Promise<AttendancePayrollEmployeeDetail> {
  const data = attendancePayrollDetailSchema.parse(input)
  return repository.transactAttendancePayroll(
    async (tx) => {
      const currentActor = await authorize(tx, actor, false)
      const target = await salaries.person(tx, data.userId)
      if (!target)
        throw new AttendancePayrollError('თანამშრომლის ჩანაწერი ვერ მოიძებნა.')
      const workday = await getCompanyWorkday(new Date(), tx)
      const { evaluation, history } = await evaluateEmployeeAttendancePayroll(
        tx,
        {
          employeeId: target.id,
          userId: target.userId,
          employeeName: target.name,
          month: data.month,
          today: workday.date,
          timezone: workday.timezone,
        },
      )
      return {
        ...evaluation,
        canReview:
          currentActor.id !== target.userId &&
          hasPermission(currentActor, 'payroll.attendance.review'),
        canEditSelf: currentActor.id === target.userId,
        history,
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}

export async function saveAttendancePayrollDecision(
  actor: Actor | null,
  input: unknown,
) {
  const data = saveAttendancePayrollDecisionSchema.parse(input)
  const commandHash = fingerprint({ operation: 'attendance-decision', ...data })
  return repository.transactAttendancePayroll(async (tx) => {
    const currentActor = await authorize(tx, actor, true)
    if (currentActor.id === data.userId)
      throw new AttendancePayrollError(
        'საკუთარი გამოთვლების გადამოწმება ან შეცვლა დაუშვებელია.',
      )
    await repository.lockDecisionCommand(tx, currentActor.id, data.requestId)
    const prior = (
      await repository.decisionRetry(tx, currentActor.id, data.requestId)
    ).at(0)
    if (prior) {
      if (prior.commandHash !== commandHash)
        throw new AttendancePayrollError(
          'ეს მოთხოვნა უკვე გამოყენებულია სხვა მონაცემებით. განაახლეთ გვერდი.',
        )
      return { version: prior.version }
    }
    const target = await salaries.person(tx, data.userId, 'update')
    if (!target)
      throw new AttendancePayrollError('თანამშრომლის ჩანაწერი ვერ მოიძებნა.')
    const workday = await getCompanyWorkday(new Date(), tx)
    const { evaluation } = await evaluateEmployeeAttendancePayroll(tx, {
      employeeId: target.id,
      userId: target.userId,
      employeeName: target.name,
      month: data.month,
      today: workday.date,
      timezone: workday.timezone,
    })
    const item = evaluation.items.find(
      (entry) =>
        entry.itemKey === data.itemKey && entry.itemKind === data.itemKind,
    )
    if (!item)
      throw new AttendancePayrollError(
        'გამოთვლილი ჩანაწერი აღარ არსებობს. განაახლეთ გვერდი.',
      )
    if (item.sourceHash !== data.sourceHash)
      throw new AttendancePayrollError(
        'წყარო მონაცემები შეიცვალა. განაახლეთ და ხელახლა გადაამოწმეთ ჩანაწერი.',
      )
    const latestVersion = await repository.latestDecisionVersion(
      tx,
      target.id,
      data.month,
      data.itemKey,
    )
    if (latestVersion !== data.expectedVersion)
      throw new AttendancePayrollError(
        'ეს ჩანაწერი უკვე გადაამოწმა სხვა მომხმარებელმა. განაახლეთ გვერდი.',
      )
    // Protect already-published payment stages from silent retroactive overrides.
    const payments = await monthlyRepository.employeePayments(
      tx,
      target.id,
      data.month,
    )
    if (
      (item.stage === 'adjustments' &&
        payments.some((p) => p.stage === 'adjustments')) ||
      (item.stage === 'salary' && payments.some((p) => p.stage === 'salary'))
    ) {
      throw new AttendancePayrollError(
        'ამ ეტაპის თანხა უკვე გაცემულია და ვერ შეიცვლება. გაცემის შემდეგ კორექტირება უნდა აისახოს მომდევნო ეტაპზე.',
      )
    }

    const nextVersion = latestVersion + 1
    await repository.insertAttendancePayrollDecision(tx, {
      employeeId: target.id,
      month: `${data.month}-01`,
      itemKey: data.itemKey,
      itemKind: data.itemKind,
      version: nextVersion,
      action: data.action,
      sourceHash: data.sourceHash,
      calculatedSeconds: item.calculatedSeconds,
      overrideSeconds:
        data.action === 'overridden' ? (data.overrideSeconds ?? null) : null,
      calculatedAmountMinor: item.calculatedAmountMinor,
      overrideAmountMinor:
        data.action === 'overridden' ? (data.overrideAmountMinor ?? null) : null,
      note: data.note ?? '',
      reason: data.reason,
      actorId: currentActor.id,
      requestId: data.requestId,
      commandHash,
    })
    return { version: nextVersion }
  })
}
