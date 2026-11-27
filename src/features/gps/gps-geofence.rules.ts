import type { GpsPresenceState } from '#/db/schema/gps/gps-geofence.schema'

/** Confirmed entry requires at least 3 minutes inside the zone (filters brief drive-bys). */
export const GPS_ENTRY_DWELL_SECONDS = 3 * 60
/** Confirmed exit requires at least 5 minutes outside the zone (filters GPS boundary drift and brief errands). */
export const GPS_EXIT_DWELL_SECONDS = 5 * 60
/** Small outer margin (meters) applied only to exit checks to avoid jitter right on the circle boundary. */
export const GPS_EXIT_HYSTERESIS_METERS = 10

const EARTH_RADIUS_METERS = 6371000

/** Great-circle Haversine distance in meters between two WGS84 coordinates. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_METERS * c
}

export type PresenceSnapshot = {
  state: GpsPresenceState
  candidateSince: Date | null
  candidateFixId: string | null
  lastFixAt: Date | null
  lastInsideFixAt: Date | null
}

export type FixObservation = {
  id: string
  fixAt: Date
  valid: boolean
  latitude: number
  longitude: number
}

export type GeofenceZone = {
  latitude: number
  longitude: number
  diameterMeters: number
}

export type PresenceTransitionAction =
  | { kind: 'none' }
  | {
      kind: 'confirm_entry'
      entryAt: Date
      entryFixId: string
    }
  | {
      kind: 'confirm_exit'
      exitAt: Date
      exitFixId: string
    }
  | {
      /** Sleep-mode path: tracker entered, slept while parked inside, and next fix arrived >= 3 min later outside (starting exit dwell). */
      kind: 'confirm_entry_then_pending_exit'
      entryAt: Date
      entryFixId: string
      exitCandidateAt: Date
      exitCandidateFixId: string
    }

export type PresenceStepResult = {
  next: PresenceSnapshot
  action: PresenceTransitionAction
  distanceMeters: number | null
  inside: boolean | null
}

/**
 * Sleep-mode-aware, drift-resistant state machine for one (device, job) circular geofence.
 *
 * Key invariants:
 * - Invalid fixes or older/out-of-order fixes never alter confirmed presence.
 * - Silence (sleep mode while parked inside) NEVER generates an exit; duration runs until confirmed exit.
 * - If a tracker sends an inside fix (`pending_entry`), enters sleep mode for >= 3 minutes, and wakes up outside,
 *   the visit entry is confirmed at the original inside fix and exit confirmation starts at the wake-up outside fix.
 * - Brief drive-bys (< 3 min inside) reset cleanly to `outside`.
 * - Brief boundary drift (< 5 min outside) returns cleanly to `inside` without closing the visit.
 */
export function evaluatePresenceFix(
  current: PresenceSnapshot,
  fix: FixObservation,
  zone: GeofenceZone,
): PresenceStepResult {
  if (!fix.valid) {
    return { next: current, action: { kind: 'none' }, distanceMeters: null, inside: null }
  }
  if (current.lastFixAt && fix.fixAt.getTime() <= current.lastFixAt.getTime()) {
    return { next: current, action: { kind: 'none' }, distanceMeters: null, inside: null }
  }

  const radius = zone.diameterMeters / 2
  const distanceMeters = haversineMeters(
    fix.latitude,
    fix.longitude,
    zone.latitude,
    zone.longitude,
  )
  const isConfirmedInside =
    current.state === 'inside' || current.state === 'pending_exit'
  const inside = isConfirmedInside
    ? distanceMeters <= radius + GPS_EXIT_HYSTERESIS_METERS
    : distanceMeters <= radius

  const fixMs = fix.fixAt.getTime()

  switch (current.state) {
    case 'outside': {
      if (!inside) {
        return {
          next: {
            ...current,
            state: 'outside',
            candidateSince: null,
            candidateFixId: null,
            lastFixAt: fix.fixAt,
          },
          action: { kind: 'none' },
          distanceMeters,
          inside,
        }
      }
      return {
        next: {
          ...current,
          state: 'pending_entry',
          candidateSince: fix.fixAt,
          candidateFixId: fix.id,
          lastFixAt: fix.fixAt,
          lastInsideFixAt: fix.fixAt,
        },
        action: { kind: 'none' },
        distanceMeters,
        inside,
      }
    }

    case 'pending_entry': {
      const candidateSince = current.candidateSince ?? fix.fixAt
      const candidateFixId = current.candidateFixId ?? fix.id
      const elapsedSeconds = (fixMs - candidateSince.getTime()) / 1000

      if (inside) {
        if (elapsedSeconds >= GPS_ENTRY_DWELL_SECONDS) {
          return {
            next: {
              state: 'inside',
              candidateSince: null,
              candidateFixId: null,
              lastFixAt: fix.fixAt,
              lastInsideFixAt: fix.fixAt,
            },
            action: {
              kind: 'confirm_entry',
              entryAt: candidateSince,
              entryFixId: candidateFixId,
            },
            distanceMeters,
            inside,
          }
        }
        return {
          next: {
            ...current,
            state: 'pending_entry',
            candidateSince,
            candidateFixId,
            lastFixAt: fix.fixAt,
            lastInsideFixAt: fix.fixAt,
          },
          action: { kind: 'none' },
          distanceMeters,
          inside,
        }
      }

      // Outside fix while in pending_entry:
      // If >= 3 minutes elapsed since the inside fix, the tracker parked and entered sleep mode inside before waking up outside.
      if (elapsedSeconds >= GPS_ENTRY_DWELL_SECONDS) {
        return {
          next: {
            state: 'pending_exit',
            candidateSince: fix.fixAt,
            candidateFixId: fix.id,
            lastFixAt: fix.fixAt,
            lastInsideFixAt: current.lastInsideFixAt ?? candidateSince,
          },
          action: {
            kind: 'confirm_entry_then_pending_exit',
            entryAt: candidateSince,
            entryFixId: candidateFixId,
            exitCandidateAt: fix.fixAt,
            exitCandidateFixId: fix.id,
          },
          distanceMeters,
          inside,
        }
      }

      // Otherwise it was a brief drive-by (< 3 min): ignore cleanly.
      return {
        next: {
          ...current,
          state: 'outside',
          candidateSince: null,
          candidateFixId: null,
          lastFixAt: fix.fixAt,
        },
        action: { kind: 'none' },
        distanceMeters,
        inside,
      }
    }

    case 'inside': {
      if (inside) {
        return {
          next: {
            ...current,
            state: 'inside',
            candidateSince: null,
            candidateFixId: null,
            lastFixAt: fix.fixAt,
            lastInsideFixAt: fix.fixAt,
          },
          action: { kind: 'none' },
          distanceMeters,
          inside,
        }
      }
      return {
        next: {
          ...current,
          state: 'pending_exit',
          candidateSince: fix.fixAt,
          candidateFixId: fix.id,
          lastFixAt: fix.fixAt,
        },
        action: { kind: 'none' },
        distanceMeters,
        inside,
      }
    }

    case 'pending_exit': {
      if (inside) {
        // Returned inside within exit dwell window -> drift ignored, stay inside.
        return {
          next: {
            ...current,
            state: 'inside',
            candidateSince: null,
            candidateFixId: null,
            lastFixAt: fix.fixAt,
            lastInsideFixAt: fix.fixAt,
          },
          action: { kind: 'none' },
          distanceMeters,
          inside,
        }
      }
      const candidateSince = current.candidateSince ?? fix.fixAt
      const candidateFixId = current.candidateFixId ?? fix.id
      const elapsedSeconds = (fixMs - candidateSince.getTime()) / 1000
      if (elapsedSeconds >= GPS_EXIT_DWELL_SECONDS) {
        return {
          next: {
            ...current,
            state: 'outside',
            candidateSince: null,
            candidateFixId: null,
            lastFixAt: fix.fixAt,
          },
          action: {
            kind: 'confirm_exit',
            exitAt: candidateSince,
            exitFixId: candidateFixId,
          },
          distanceMeters,
          inside,
        }
      }
      return {
        next: {
          ...current,
          state: 'pending_exit',
          candidateSince,
          candidateFixId,
          lastFixAt: fix.fixAt,
        },
        action: { kind: 'none' },
        distanceMeters,
        inside,
      }
    }
  }
}
