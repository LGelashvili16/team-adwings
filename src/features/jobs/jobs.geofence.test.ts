import { expect, it } from 'vitest'
import { jobGeofenceRing } from './jobs.geofence'

it.each([100, 200, 350])(
  'draws a closed %i meter diameter around the job',
  (diameter) => {
    const center = { longitude: 44.8, latitude: 41.7 }
    const ring = jobGeofenceRing(center, diameter)
    const [north, west, south, east] = [ring[0], ring[16], ring[32], ring[48]]
    const metresPerDegree = 111_195.08
    expect(ring.at(-1)).toEqual(north)
    expect((north[1] - south[1]) * metresPerDegree).toBeCloseTo(diameter, 2)
    expect(
      (east[0] - west[0]) *
        metresPerDegree *
        Math.cos((center.latitude * Math.PI) / 180),
    ).toBeCloseTo(diameter, 2)
    expect((north[1] + south[1]) / 2).toBeCloseTo(center.latitude, 8)
    expect((east[0] + west[0]) / 2).toBeCloseTo(center.longitude, 8)
  },
)
