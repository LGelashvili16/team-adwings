import { useEffect, useState } from 'react'

/** Keeps relative fix-age labels and stale states ticking even when polled data is unchanged. */
export function useGpsNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
