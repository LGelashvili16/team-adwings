import { defineTask } from 'nitro/task'
import { processGpsGeofencePresence } from '#/features/gps/server/gps-geofence-presence.service.server'

export default defineTask({
  async run() {
    try {
      return { result: await processGpsGeofencePresence() }
    } catch {
      // Nitro logs task errors; never leak database internals or employee/location data.
      throw new Error('GPS geofence presence task failed')
    }
  },
})
