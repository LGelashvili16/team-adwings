import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { markJobRead } from '../jobs.functions'
import { jobsKeys } from '../jobs.queries'

/** Mounted details acknowledge this actor only; queries and prefetches remain read-only. */
export function useMarkJobRead(actorId: string, id: string) {
  const client = useQueryClient()
  useEffect(() => {
    async function acknowledge() {
      try {
        const result = await markJobRead({ data: { id } })
        if (result.ok)
          void client.invalidateQueries({ queryKey: jobsKeys.all(actorId) })
      } catch {
        // Keep the new marker on failure; reopening details retries the idempotent acknowledgement.
      }
    }
    void acknowledge()
  }, [actorId, id, client])
}
