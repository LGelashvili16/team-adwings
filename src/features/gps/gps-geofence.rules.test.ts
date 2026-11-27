import { describe, expect, it } from 'vitest'
import { evaluatePresenceFix, haversineMeters } from './gps-geofence.rules'
import type { GeofenceZone, PresenceSnapshot } from './gps-geofence.rules'

const zone: GeofenceZone = {
  latitude: 41.7151,
  longitude: 44.8271,
  diameterMeters: 200, // radius = 100m
}

// ~20m from center (inside)
const INSIDE = { latitude: 41.71525, longitude: 44.8272 }
// ~300m from center (outside)
const OUTSIDE = { latitude: 41.7178, longitude: 44.8271 }

const initial: PresenceSnapshot = {
  state: 'outside',
  candidateSince: null,
  candidateFixId: null,
  lastFixAt: null,
  lastInsideFixAt: null,
}

const at = (iso: string) => new Date(iso)

describe('GPS geofence presence state machine', () => {
  it('computes accurate meter distances using Haversine', () => {
    expect(
      haversineMeters(
        zone.latitude,
        zone.longitude,
        INSIDE.latitude,
        INSIDE.longitude,
      ),
    ).toBeLessThan(30)
    expect(
      haversineMeters(
        zone.latitude,
        zone.longitude,
        OUTSIDE.latitude,
        OUTSIDE.longitude,
      ),
    ).toBeGreaterThan(250)
  })

  it('ignores brief drive-bys shorter than 3 minutes', () => {
    const s1 = evaluatePresenceFix(
      initial,
      { id: 'f1', fixAt: at('2026-11-21T07:00:00Z'), valid: true, ...INSIDE },
      zone,
    )
    expect(s1.next.state).toBe('pending_entry')
    expect(s1.action.kind).toBe('none')

    const s2 = evaluatePresenceFix(
      s1.next,
      { id: 'f2', fixAt: at('2026-11-21T07:01:30Z'), valid: true, ...OUTSIDE },
      zone,
    )
    expect(s2.next.state).toBe('outside')
    expect(s2.action.kind).toBe('none')
  })

  it('confirms entry after 3 min dwell, ignores brief drift (<5 min) and sleep gaps, and confirms exit after 5 min outside', () => {
    // 11:00 Tbilisi (07:00Z) inside
    const s1 = evaluatePresenceFix(
      initial,
      { id: 'f1', fixAt: at('2026-11-21T07:00:00Z'), valid: true, ...INSIDE },
      zone,
    )
    expect(s1.next.state).toBe('pending_entry')

    // 11:03 inside -> confirms entry with original 11:00 timestamp!
    const s2 = evaluatePresenceFix(
      s1.next,
      { id: 'f2', fixAt: at('2026-11-21T07:03:00Z'), valid: true, ...INSIDE },
      zone,
    )
    expect(s2.next.state).toBe('inside')
    expect(s2.action).toEqual({
      kind: 'confirm_entry',
      entryAt: at('2026-11-21T07:00:00Z'),
      entryFixId: 'f1',
    })

    // 11:40 brief GPS drift outside for 2 minutes, then back inside at 11:42 -> ignored!
    const s3 = evaluatePresenceFix(
      s2.next,
      { id: 'f3', fixAt: at('2026-11-21T07:40:00Z'), valid: true, ...OUTSIDE },
      zone,
    )
    expect(s3.next.state).toBe('pending_exit')
    const s4 = evaluatePresenceFix(
      s3.next,
      { id: 'f4', fixAt: at('2026-11-21T07:42:00Z'), valid: true, ...INSIDE },
      zone,
    )
    expect(s4.next.state).toBe('inside')
    expect(s4.action.kind).toBe('none')

    // Tracker sleeps for 1 hour 18 minutes, wakes up at 13:00 leaving the job area:
    const s5 = evaluatePresenceFix(
      s4.next,
      { id: 'f5', fixAt: at('2026-11-21T09:00:00Z'), valid: true, ...OUTSIDE },
      zone,
    )
    expect(s5.next.state).toBe('pending_exit')
    expect(s5.action.kind).toBe('none')

    // 13:05 still outside -> confirms exit with first outside fix (13:00)!
    const s6 = evaluatePresenceFix(
      s5.next,
      { id: 'f6', fixAt: at('2026-11-21T09:05:00Z'), valid: true, ...OUTSIDE },
      zone,
    )
    expect(s6.next.state).toBe('outside')
    expect(s6.action).toEqual({
      kind: 'confirm_exit',
      exitAt: at('2026-11-21T09:00:00Z'),
      exitFixId: 'f5',
    })
  })

  it('handles tracker entering sleep mode immediately after first inside fix and waking up hours later outside', () => {
    const s1 = evaluatePresenceFix(
      initial,
      { id: 'f1', fixAt: at('2026-11-21T07:00:00Z'), valid: true, ...INSIDE },
      zone,
    )
    expect(s1.next.state).toBe('pending_entry')

    // No fixes for 2 hours (sleep mode), wakes up outside at 09:00Z
    const s2 = evaluatePresenceFix(
      s1.next,
      { id: 'f2', fixAt: at('2026-11-21T09:00:00Z'), valid: true, ...OUTSIDE },
      zone,
    )
    expect(s2.next.state).toBe('pending_exit')
    expect(s2.action).toEqual({
      kind: 'confirm_entry_then_pending_exit',
      entryAt: at('2026-11-21T07:00:00Z'),
      entryFixId: 'f1',
      exitCandidateAt: at('2026-11-21T09:00:00Z'),
      exitCandidateFixId: 'f2',
    })

    // 09:05Z still outside -> exit confirmed at 09:00Z (exact 2h visit!)
    const s3 = evaluatePresenceFix(
      s2.next,
      { id: 'f3', fixAt: at('2026-11-21T09:05:00Z'), valid: true, ...OUTSIDE },
      zone,
    )
    expect(s3.next.state).toBe('outside')
    expect(s3.action).toEqual({
      kind: 'confirm_exit',
      exitAt: at('2026-11-21T09:00:00Z'),
      exitFixId: 'f2',
    })
  })

  it('ignores invalid fixes and out-of-order/replayed older fixes', () => {
    const insideState: PresenceSnapshot = {
      state: 'inside',
      candidateSince: null,
      candidateFixId: null,
      lastFixAt: at('2026-11-21T07:10:00Z'),
      lastInsideFixAt: at('2026-11-21T07:10:00Z'),
    }
    const invalid = evaluatePresenceFix(
      insideState,
      { id: 'bad', fixAt: at('2026-11-21T07:20:00Z'), valid: false, ...OUTSIDE },
      zone,
    )
    expect(invalid.next).toEqual(insideState)
    expect(invalid.action.kind).toBe('none')

    const oldReplay = evaluatePresenceFix(
      insideState,
      { id: 'old', fixAt: at('2026-11-21T07:05:00Z'), valid: true, ...OUTSIDE },
      zone,
    )
    expect(oldReplay.next).toEqual(insideState)
    expect(oldReplay.action.kind).toBe('none')
  })
})
