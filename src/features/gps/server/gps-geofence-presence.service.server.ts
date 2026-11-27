import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from 'drizzle-orm'
import { db } from '#/db'
import {
  attendanceSession,
  attendanceSetting,
  employee,
  gpsDevice,
  gpsJobPresence,
  gpsJobVisit,
  gpsJobVisitCrew,
  gpsPosition,
  job,
  jobEmployee,
  jobGeofenceSetting,
  user,
} from '#/db/schema'
import { defaultJobGeofenceDiameter } from '#/features/jobs/jobs.schemas'
import {
  getCompanyWorkday,
  getEmployeeWorkday,
} from '#/features/scheduling/server/scheduling.service.server'
import { companyLocalDate } from '#/features/scheduling/scheduling.rules'
import { signalRealtime } from '#/lib/realtime/postgres-events.server'
import { evaluatePresenceFix } from '../gps-geofence.rules'
import type { GpsJobVisitPayrollInput } from '#/features/payroll/attendance-payroll.rules'
import type { PayrollTransaction } from '#/features/payroll/server/payroll-settings.repository.server'

type GpsPresenceTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type ProcessGpsPresenceResult = {
  devicesProcessed: number
  fixesEvaluated: number
  visitsOpened: number
  visitsCompleted: number
  sessionsClockedIn: number
  sessionsClockedOut: number
  conflictsRecorded: number
}

async function readCurrentGeofenceSetting(tx: GpsPresenceTx) {
  const row = (
    await tx
      .select({
        version: jobGeofenceSetting.version,
        diameter: jobGeofenceSetting.diameter,
        autoAttendanceEnabled: jobGeofenceSetting.autoAttendanceEnabled,
      })
      .from(jobGeofenceSetting)
      .orderBy(desc(jobGeofenceSetting.version))
      .limit(1)
  ).at(0)
  return (
    row ?? {
      version: 0,
      diameter: defaultJobGeofenceDiameter,
      autoAttendanceEnabled: false,
    }
  )
}

async function handleVisitEntry(
  tx: GpsPresenceTx,
  params: {
    deviceId: string
    jobId: string
    entryAt: Date
    entryFixId: string
    geofenceVersion: number
    geofenceDiameter: number
    autoAttendanceEnabled: boolean
    timezone: string
    overlappingOtherJob: boolean
    now: Date
  },
) {
  const workDate = companyLocalDate(params.entryAt, params.timezone)
  const mode = params.autoAttendanceEnabled ? 'automatic' : 'observation'
  const status = params.overlappingOtherJob ? 'uncertain' : 'open'
  const note = params.overlappingOtherJob
    ? 'ტრეკერი ერთდროულად რამდენიმე აქტიური სამუშაოს გეოზონაში დაფიქსირდა - საჭიროა HR/ადმინისტრატორის გადამოწმება.'
    : ''

  const inserted = (
    await tx
      .insert(gpsJobVisit)
      .values({
        jobId: params.jobId,
        deviceId: params.deviceId,
        workDate,
        timezone: params.timezone,
        geofenceVersion: params.geofenceVersion,
        geofenceDiameter: params.geofenceDiameter,
        entryFixId: params.entryFixId,
        confirmedEntryAt: params.entryAt,
        onSiteSeconds: 0,
        mode,
        status,
        note,
        processedAt: params.now,
      })
      .onConflictDoNothing({
        target: [
          gpsJobVisit.deviceId,
          gpsJobVisit.jobId,
          gpsJobVisit.entryFixId,
        ],
      })
      .returning()
  ).at(0)

  if (!inserted) {
    const existing = (
      await tx
        .select()
        .from(gpsJobVisit)
        .where(
          and(
            eq(gpsJobVisit.deviceId, params.deviceId),
            eq(gpsJobVisit.jobId, params.jobId),
            eq(gpsJobVisit.entryFixId, params.entryFixId),
          ),
        )
        .limit(1)
    ).at(0)
    return {
      visit: existing ?? null,
      created: false,
      clockedIn: 0,
      conflicts: 0,
    }
  }

  // Snapshot assigned crew at confirmed entry.
  const crewRows = await tx
    .select({
      employeeId: employee.id,
      userId: employee.userId,
      employeeStatus: employee.status,
      accessState: user.accessState,
    })
    .from(jobEmployee)
    .innerJoin(user, eq(user.id, jobEmployee.userId))
    .innerJoin(employee, eq(employee.userId, jobEmployee.userId))
    .where(eq(jobEmployee.jobId, params.jobId))
    .orderBy(asc(employee.id))

  const maxOpenHours =
    (
      await tx
        .select({ hours: attendanceSetting.maxOpenHours })
        .from(attendanceSetting)
        .limit(1)
    ).at(0)?.hours ?? 16

  let clockedIn = 0
  let conflicts = 0

  for (const member of crewRows) {
    if (member.employeeStatus !== 'active' || member.accessState !== 'active') {
      await tx
        .insert(gpsJobVisitCrew)
        .values({
          visitId: inserted.id,
          employeeId: member.employeeId,
          userId: member.userId,
          outcome: 'ineligible',
          onSiteSeconds: 0,
          conflictReason: 'თანამშრომლის ანგარიში არააქტიურია.',
        })
        .onConflictDoNothing()
      continue
    }

    if (mode === 'observation' || status === 'uncertain') {
      await tx
        .insert(gpsJobVisitCrew)
        .values({
          visitId: inserted.id,
          employeeId: member.employeeId,
          userId: member.userId,
          outcome: 'observed',
          onSiteSeconds: 0,
          conflictReason: note,
        })
        .onConflictDoNothing()
      continue
    }

    // Lock employee row to serialize against manual clock-in/out and corrections.
    await tx
      .select({ id: employee.id })
      .from(employee)
      .where(eq(employee.id, member.employeeId))
      .for('update')

    const openManual = (
      await tx
        .select({ id: attendanceSession.id })
        .from(attendanceSession)
        .where(
          and(
            eq(attendanceSession.employeeId, member.employeeId),
            isNull(attendanceSession.endedAt),
          ),
        )
        .limit(1)
    ).at(0)

    if (openManual) {
      conflicts++
      await tx
        .insert(gpsJobVisitCrew)
        .values({
          visitId: inserted.id,
          employeeId: member.employeeId,
          userId: member.userId,
          outcome: 'conflict_open_session',
          onSiteSeconds: 0,
          conflictReason:
            'თანამშრომელს უკვე ჰქონდა ღია ხელით დასწრების სესია. ობიექტზე გატარებული დრო ცალკე დაფიქსირდა.',
        })
        .onConflictDoNothing()
      continue
    }

    const overlapping = (
      await tx
        .select({ id: attendanceSession.id })
        .from(attendanceSession)
        .where(
          and(
            eq(attendanceSession.employeeId, member.employeeId),
            lte(attendanceSession.startedAt, params.entryAt),
            gte(attendanceSession.endedAt, params.entryAt),
          ),
        )
        .limit(1)
    ).at(0)

    if (overlapping) {
      conflicts++
      await tx
        .insert(gpsJobVisitCrew)
        .values({
          visitId: inserted.id,
          employeeId: member.employeeId,
          userId: member.userId,
          outcome: 'conflict_overlap',
          onSiteSeconds: 0,
          conflictReason:
            'GPS ვიზიტის დრო დაემთხვა უკვე დაფიქსირებულ დასწრების ჩანაწერს. ობიექტზე გატარებული დრო ცალკე დაფიქსირდა.',
        })
        .onConflictDoNothing()
      continue
    }

    const workday = await getEmployeeWorkday(
      params.entryAt,
      member.employeeId,
      tx,
    )
    if (
      workday.kind === 'unconfigured' ||
      !workday.effectiveFrom ||
      (workday.kind === 'scheduled' && (!workday.startsAt || !workday.endsAt))
    ) {
      conflicts++
      await tx
        .insert(gpsJobVisitCrew)
        .values({
          visitId: inserted.id,
          employeeId: member.employeeId,
          userId: member.userId,
          outcome: 'ineligible',
          onSiteSeconds: 0,
          conflictReason:
            'თანამშრომლის სამუშაო განრიგი განსაზღვრული არ არის — ავტომატური შესვლა ვერ დაფიქსირდა.',
        })
        .onConflictDoNothing()
      continue
    }

    const nonWorking = workday.kind === 'day_off'
    const session = (
      await tx
        .insert(attendanceSession)
        .values({
          employeeId: member.employeeId,
          requestId: randomUUID(),
          workDate: workday.date,
          timezone: workday.timezone,
          scheduleEffectiveFrom: workday.effectiveFrom,
          expectedStartAt: nonWorking
            ? params.entryAt
            : new Date(workday.startsAt!),
          expectedEndAt: nonWorking ? params.entryAt : new Date(workday.endsAt!),
          startedAt: params.entryAt,
          originalStartedAt: params.entryAt,
          maxOpenHours,
          gpsVisitId: inserted.id,
        })
        .returning({ id: attendanceSession.id })
    ).at(0)

    if (session) {
      clockedIn++
      await tx
        .insert(gpsJobVisitCrew)
        .values({
          visitId: inserted.id,
          employeeId: member.employeeId,
          userId: member.userId,
          attendanceSessionId: session.id,
          outcome: 'clocked_in',
          onSiteSeconds: 0,
          conflictReason: '',
        })
        .onConflictDoNothing()
    }
  }

  return { visit: inserted, created: true, clockedIn, conflicts }
}

async function handleVisitExit(
  tx: GpsPresenceTx,
  params: {
    visitId: string
    exitAt: Date
    exitFixId: string
    now: Date
  },
) {
  const visit = (
    await tx
      .select()
      .from(gpsJobVisit)
      .where(eq(gpsJobVisit.id, params.visitId))
      .for('update')
  ).at(0)
  if (!visit || visit.confirmedExitAt) return { completed: false, clockedOut: 0 }

  const onSiteSeconds = Math.max(
    0,
    Math.round((params.exitAt.getTime() - visit.confirmedEntryAt.getTime()) / 1000),
  )

  await tx
    .update(gpsJobVisit)
    .set({
      exitFixId: params.exitFixId,
      confirmedExitAt: params.exitAt,
      onSiteSeconds,
      status: visit.status === 'uncertain' ? 'uncertain' : 'completed',
      processedAt: params.now,
    })
    .where(eq(gpsJobVisit.id, visit.id))

  const crewRows = await tx
    .select()
    .from(gpsJobVisitCrew)
    .where(eq(gpsJobVisitCrew.visitId, visit.id))

  let clockedOut = 0
  for (const row of crewRows) {
    // Always store detected on-site duration, including on conflict rows so HR sees exact job time.
    if (row.outcome === 'clocked_in' && row.attendanceSessionId) {
      await tx
        .select({ id: employee.id })
        .from(employee)
        .where(eq(employee.id, row.employeeId))
        .for('update')

      const closed = await tx
        .update(attendanceSession)
        .set({
          endedAt: params.exitAt,
          originalEndedAt: params.exitAt,
          revision: sql`${attendanceSession.revision} + 1`,
        })
        .where(
          and(
            eq(attendanceSession.id, row.attendanceSessionId),
            eq(attendanceSession.gpsVisitId, visit.id),
            isNull(attendanceSession.endedAt),
            lte(attendanceSession.startedAt, params.exitAt),
          ),
        )
        .returning({ id: attendanceSession.id })

      if (closed.length === 1) clockedOut++

      await tx
        .update(gpsJobVisitCrew)
        .set({
          outcome: 'completed',
          onSiteSeconds,
        })
        .where(eq(gpsJobVisitCrew.id, row.id))
    } else {
      await tx
        .update(gpsJobVisitCrew)
        .set({ onSiteSeconds })
        .where(eq(gpsJobVisitCrew.id, row.id))
    }
  }

  return { completed: true, clockedOut }
}

/**
 * Evaluates persisted, authenticated GPS fixes against active mapped jobs with assigned trackers.
 * Runs outside the TCP receiver's acknowledgment path and is completely retry-safe.
 */
export async function processGpsGeofencePresence(options?: {
  now?: Date
  deviceId?: string
}): Promise<ProcessGpsPresenceResult> {
  const now = options?.now ?? new Date()
  const activeJobs = await db
    .select({
      jobId: job.id,
      deviceId: job.gpsDeviceId,
      latitude: job.latitude,
      longitude: job.longitude,
    })
    .from(job)
    .innerJoin(gpsDevice, eq(gpsDevice.id, job.gpsDeviceId))
    .where(
      and(
        inArray(job.status, ['pending', 'en_route', 'on_site']),
        isNotNull(job.gpsDeviceId),
        isNotNull(job.latitude),
        isNotNull(job.longitude),
        eq(gpsDevice.enabled, true),
        options?.deviceId ? eq(job.gpsDeviceId, options.deviceId) : undefined,
      ),
    )

  const jobsByDevice = new Map<
    string,
    { jobId: string; latitude: number; longitude: number }[]
  >()
  for (const row of activeJobs) {
    if (!row.deviceId || row.latitude === null || row.longitude === null)
      continue
    const list = jobsByDevice.get(row.deviceId) ?? []
    list.push({
      jobId: row.jobId,
      latitude: row.latitude,
      longitude: row.longitude,
    })
    jobsByDevice.set(row.deviceId, list)
  }

  const summary: ProcessGpsPresenceResult = {
    devicesProcessed: 0,
    fixesEvaluated: 0,
    visitsOpened: 0,
    visitsCompleted: 0,
    sessionsClockedIn: 0,
    sessionsClockedOut: 0,
    conflictsRecorded: 0,
  }

  let anyTransition = false

  for (const [deviceId, deviceJobs] of jobsByDevice) {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('gps-geofence-presence'), hashtext(${deviceId}))`,
      )
      summary.devicesProcessed++
      const setting = await readCurrentGeofenceSetting(tx)
      const workday = await getCompanyWorkday(now, tx)

      const existingRows = await tx
        .select()
        .from(gpsJobPresence)
        .where(
          and(
            eq(gpsJobPresence.deviceId, deviceId),
            inArray(
              gpsJobPresence.jobId,
              deviceJobs.map((j) => j.jobId),
            ),
          ),
        )
      const presenceByJob = new Map(existingRows.map((row) => [row.jobId, row]))

      // Find the earliest watermark across this device's active jobs (or last 24h for brand-new pairs).
      let earliestWatermark: Date | null = null
      for (const j of deviceJobs) {
        const row = presenceByJob.get(j.jobId)
        if (!row?.lastFixAt) {
          earliestWatermark = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        }
        if (!earliestWatermark || row.lastFixAt < earliestWatermark) {
          earliestWatermark = row.lastFixAt
        }
      }

      const fixes = await tx
        .select({
          id: gpsPosition.id,
          fixAt: gpsPosition.fixAt,
          valid: gpsPosition.valid,
          latitude: gpsPosition.latitude,
          longitude: gpsPosition.longitude,
        })
        .from(gpsPosition)
        .where(
          and(
            eq(gpsPosition.deviceId, deviceId),
            eq(gpsPosition.valid, true),
            earliestWatermark
              ? gt(gpsPosition.fixAt, earliestWatermark)
              : undefined,
          ),
        )
        .orderBy(
          asc(gpsPosition.fixAt),
          asc(gpsPosition.receivedAt),
          asc(gpsPosition.id),
        )
        .limit(2000)

      if (fixes.length === 0) return

      for (const fix of fixes) {
        summary.fixesEvaluated++
        for (const j of deviceJobs) {
          const prev = presenceByJob.get(j.jobId)
          const currentState = prev
            ? {
                state: prev.state,
                candidateSince: prev.candidateSince,
                candidateFixId: prev.candidateFixId,
                lastFixAt: prev.lastFixAt,
                lastInsideFixAt: prev.lastInsideFixAt,
              }
            : {
                state: 'outside' as const,
                candidateSince: null,
                candidateFixId: null,
                lastFixAt: null,
                lastInsideFixAt: null,
              }

          const step = evaluatePresenceFix(currentState, fix, {
            latitude: j.latitude,
            longitude: j.longitude,
            diameterMeters: setting.diameter,
          })

          let activeVisitId = prev?.activeVisitId ?? null

          if (
            step.action.kind === 'confirm_entry' ||
            step.action.kind === 'confirm_entry_then_pending_exit'
          ) {
            const otherOpenVisits = [...presenceByJob.entries()].filter(
              ([otherJobId, otherRow]) =>
                otherJobId !== j.jobId && otherRow.activeVisitId !== null,
            )
            const entryRes = await handleVisitEntry(tx, {
              deviceId,
              jobId: j.jobId,
              entryAt: step.action.entryAt,
              entryFixId: step.action.entryFixId,
              geofenceVersion: setting.version,
              geofenceDiameter: setting.diameter,
              autoAttendanceEnabled: setting.autoAttendanceEnabled,
              timezone: workday.timezone,
              overlappingOtherJob: otherOpenVisits.length > 0,
              now,
            })
            activeVisitId = entryRes.visit?.id ?? activeVisitId
            if (entryRes.created) {
              summary.visitsOpened++
              summary.sessionsClockedIn += entryRes.clockedIn
              summary.conflictsRecorded += entryRes.conflicts
              anyTransition = true
            }
          } else if (step.action.kind === 'confirm_exit' && activeVisitId) {
            const exitRes = await handleVisitExit(tx, {
              visitId: activeVisitId,
              exitAt: step.action.exitAt,
              exitFixId: step.action.exitFixId,
              now,
            })
            if (exitRes.completed) {
              summary.visitsCompleted++
              summary.sessionsClockedOut += exitRes.clockedOut
              anyTransition = true
            }
            activeVisitId = null
          }

          const updatedRow = {
            deviceId,
            jobId: j.jobId,
            state: step.next.state,
            activeVisitId,
            geofenceVersion: setting.version,
            geofenceDiameter: setting.diameter,
            candidateSince: step.next.candidateSince,
            candidateFixId: step.next.candidateFixId,
            lastFixAt: step.next.lastFixAt,
            lastFixId: fix.id,
            lastInsideFixAt: step.next.lastInsideFixAt,
          }

          await tx
            .insert(gpsJobPresence)
            .values(updatedRow)
            .onConflictDoUpdate({
              target: [gpsJobPresence.deviceId, gpsJobPresence.jobId],
              set: {
                state: updatedRow.state,
                activeVisitId: updatedRow.activeVisitId,
                geofenceVersion: updatedRow.geofenceVersion,
                geofenceDiameter: updatedRow.geofenceDiameter,
                candidateSince: updatedRow.candidateSince,
                candidateFixId: updatedRow.candidateFixId,
                lastFixAt: updatedRow.lastFixAt,
                lastFixId: updatedRow.lastFixId,
                lastInsideFixAt: updatedRow.lastInsideFixAt,
                updatedAt: now,
              },
            })

          presenceByJob.set(j.jobId, {
            ...updatedRow,
            createdAt: prev?.createdAt ?? now,
            updatedAt: now,
          })
        }
      }

      if (anyTransition) {
        await signalRealtime(tx, { topic: 'jobs' })
      }
    })
  }

  return summary
}

/** Reads automatic-mode GPS job visits for one employee in a date range for hourly payroll evaluation. */
export async function readGpsVisitsForPayroll(
  tx: PayrollTransaction,
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<GpsJobVisitPayrollInput[]> {
  const rows = await tx
    .select({
      visitId: gpsJobVisit.id,
      jobId: gpsJobVisit.jobId,
      jobTitle: job.title,
      workDate: gpsJobVisit.workDate,
      confirmedEntryAt: gpsJobVisit.confirmedEntryAt,
      confirmedExitAt: gpsJobVisit.confirmedExitAt,
      visitStatus: gpsJobVisit.status,
      visitNote: gpsJobVisit.note,
      crewOutcome: gpsJobVisitCrew.outcome,
      onSiteSeconds: gpsJobVisitCrew.onSiteSeconds,
      conflictReason: gpsJobVisitCrew.conflictReason,
      attendanceSessionId: gpsJobVisitCrew.attendanceSessionId,
    })
    .from(gpsJobVisitCrew)
    .innerJoin(gpsJobVisit, eq(gpsJobVisit.id, gpsJobVisitCrew.visitId))
    .innerJoin(job, eq(job.id, gpsJobVisit.jobId))
    .where(
      and(
        eq(gpsJobVisitCrew.employeeId, employeeId),
        eq(gpsJobVisit.mode, 'automatic'),
        gte(gpsJobVisit.workDate, startDate),
        lte(gpsJobVisit.workDate, endDate),
      ),
    )
    .orderBy(asc(gpsJobVisit.confirmedEntryAt), asc(gpsJobVisit.id))

  return rows
    .filter((row) => row.crewOutcome !== 'ineligible')
    .map((row) => {
      const isConflict =
        row.crewOutcome === 'conflict_open_session' ||
        row.crewOutcome === 'conflict_overlap'
      const status: GpsJobVisitPayrollInput['status'] = isConflict
        ? 'conflict'
        : row.visitStatus === 'uncertain'
          ? 'uncertain'
          : row.visitStatus === 'open'
            ? 'open'
            : 'completed'
      return {
        visitId: row.visitId,
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        workDate: row.workDate,
        confirmedEntryAt: row.confirmedEntryAt,
        confirmedExitAt: row.confirmedExitAt,
        onSiteSeconds: row.onSiteSeconds,
        status,
        conflictReason: row.conflictReason || row.visitNote || null,
        attendanceSessionId: row.attendanceSessionId,
      }
    })
}
