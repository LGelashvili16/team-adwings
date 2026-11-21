type Coordinate = [longitude: number, latitude: number]
type TrackFix = {
  fixAt: Date
  valid: boolean
  longitude: number
  latitude: number
}

const maxGapMs = 5 * 60_000
const earthRadiusKm = 6371.0088

export function buildGpsTrack(fixes: TrackFix[]) {
  const segments: Coordinate[][] = []
  let segment: Coordinate[] = []
  let previousTime: number | undefined

  // Break the route after an invalid fix or a long gap in reports.
  for (const fix of fixes) {
    const time = fix.fixAt.getTime()
    if (
      !fix.valid ||
      (previousTime !== undefined && time - previousTime > maxGapMs)
    ) {
      if (segment.length) segments.push(segment)
      segment = []
    }
    if (fix.valid) segment.push([fix.longitude, fix.latitude])
    previousTime = fix.valid ? time : undefined
  }
  if (segment.length) segments.push(segment)
  return segments
}

function haversineKm(from: Coordinate, to: Coordinate) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(to[1] - from[1])
  const dLon = toRad(to[0] - from[0])
  const lat1 = toRad(from[1])
  const lat2 = toRad(to[1])
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function computeGpsTrackDistanceKm(segments: Coordinate[][]) {
  let total = 0
  for (const segment of segments) {
    for (let i = 1; i < segment.length; i++) {
      total += haversineKm(segment[i - 1], segment[i])
    }
  }
  return total
}
