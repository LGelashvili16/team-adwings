import { useEffect, useRef, useState } from 'react'

export function useServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [registrationFailed, setRegistrationFailed] = useState(false)
  const updateRef = useRef<(() => Promise<void>) | null>(null)

  // Keep development free of installed production workers; production updates need user consent.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let disposed = false
    if (import.meta.env.DEV) {
      void import('#/lib/pwa/development-worker.client')
        .then(({ clearDevelopmentWorker }) => clearDevelopmentWorker())
        .then((wasControlled) => {
          if (!disposed && wasControlled) window.location.reload()
        })
        .catch(() => {})
      return () => {
        disposed = true
      }
    }
    if (!import.meta.env.PROD) return
    let registration: ServiceWorkerRegistration | undefined
    let lastCheck = -Infinity
    let checking = false

    const checkForUpdate = () => {
      if (
        !registration ||
        checking ||
        document.hidden ||
        !navigator.onLine ||
        Date.now() - lastCheck < 60_000
      )
        return
      lastCheck = Date.now()
      checking = true
      // A failed background check leaves the current app usable and retries on resume.
      void registration
        .update()
        .catch(() => {})
        .finally(() => {
          checking = false
        })
    }

    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (disposed) return
        updateRef.current = registerSW({
          immediate: true,
          onNeedRefresh() {
            if (!disposed) setUpdateAvailable(true)
          },
          onRegisterError() {
            if (!disposed) setRegistrationFailed(true)
          },
          onRegisteredSW(_url, nextRegistration) {
            if (disposed) return
            registration = nextRegistration
            checkForUpdate()
          },
        })
      })
      .catch(() => {
        if (!disposed) setRegistrationFailed(true)
      })

    window.addEventListener('focus', checkForUpdate)
    window.addEventListener('online', checkForUpdate)
    document.addEventListener('visibilitychange', checkForUpdate)
    const interval = window.setInterval(checkForUpdate, 5 * 60_000)
    return () => {
      disposed = true
      updateRef.current = null
      window.clearInterval(interval)
      window.removeEventListener('focus', checkForUpdate)
      window.removeEventListener('online', checkForUpdate)
      document.removeEventListener('visibilitychange', checkForUpdate)
    }
  }, [])

  async function applyUpdate() {
    if (!updateRef.current) throw new Error('Service worker is unavailable')
    await updateRef.current()
  }

  return {
    updateAvailable,
    registrationFailed,
    applyUpdate,
    dismissUpdate: () => setUpdateAvailable(false),
    dismissRegistrationError: () => setRegistrationFailed(false),
  }
}
