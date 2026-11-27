import '@tanstack/react-start/server-only'
import { deviceRealtimeState } from './attendance-security.service.server'
import type { RealtimeHandler } from '#/lib/realtime/events-response.server'

export const deviceRealtimeHandler: RealtimeHandler = {
  topic: 'devices',
  snapshot: async (actor) => {
    const data = await deviceRealtimeState(actor, false)
    return data ? { event: 'devices', data } : null
  },
  changed: async (actor) => {
    const data = await deviceRealtimeState(actor, true)
    return data ? { event: 'devices', data } : null
  },
}
