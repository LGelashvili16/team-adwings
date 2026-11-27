import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRealtimeEvents } from '#/hooks/use-realtime-events'
import { deviceRealtimeSchema } from '../attendance-security.schemas'

export function useDeviceRealtime(actorId: string) {
  const client = useQueryClient()
  const [hasPendingDeviceRequests, setHasPendingDeviceRequests] =
    useState(false)
  useRealtimeEvents('devices', (input) => {
    const parsed = deviceRealtimeSchema.safeParse(input)
    if (!parsed.success) return
    setHasPendingDeviceRequests(parsed.data.hasPendingDeviceRequests)
    void client.invalidateQueries({
      queryKey: ['attendance-security', 'review', actorId],
    })
  })
  return { hasPendingDeviceRequests }
}
