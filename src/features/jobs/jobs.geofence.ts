import type { JobGeofenceDiameter } from './jobs.types'

const earthRadiusMetres = 6_371_008.8
const radiansPerDegree = Math.PI / 180
const ringSegments = 64

export const jobGeofenceColor = '#8250df'

/** The geographic ring uses half the diameter as the distance from the center. */
export function jobGeofenceRing(
  center: { longitude: number; latitude: number },
  diameter: JobGeofenceDiameter,
): Array<[number, number]> {
  const longitude = center.longitude * radiansPerDegree
  const latitude = center.latitude * radiansPerDegree
  const angularRadius = diameter / 2 / earthRadiusMetres
  const sinLatitude = Math.sin(latitude)
  const cosLatitude = Math.cos(latitude)
  const sinRadius = Math.sin(angularRadius)
  const cosRadius = Math.cos(angularRadius)

  const ring = Array.from(
    { length: ringSegments },
    (_, index): [number, number] => {
      const bearing = (-index * 2 * Math.PI) / ringSegments
      const pointLatitude = Math.asin(
        sinLatitude * cosRadius + cosLatitude * sinRadius * Math.cos(bearing),
      )
      const pointLongitude =
        longitude +
        Math.atan2(
          Math.sin(bearing) * sinRadius * cosLatitude,
          cosRadius - sinLatitude * Math.sin(pointLatitude),
        )
      return [
        pointLongitude / radiansPerDegree,
        pointLatitude / radiansPerDegree,
      ]
    },
  )
  ring.push(ring[0])
  return ring
}
