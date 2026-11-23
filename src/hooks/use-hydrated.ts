import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}

// Returns false during SSR and initial hydration, then true once client handlers are active.
export function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}
