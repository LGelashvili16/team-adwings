let cleanup: Promise<boolean> | undefined

export function clearDevelopmentWorker() {
  // Share the cleanup across Strict Mode effects so the mounted effect can release a controller once.
  return (cleanup ??= removeAppWorker())
}

async function removeAppWorker() {
  const scriptUrl = new URL('/service-worker.js', window.location.origin).href
  const wasControlled =
    navigator.serviceWorker.controller?.scriptURL === scriptUrl
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(
    registrations
      .filter((registration) =>
        [
          registration.active,
          registration.waiting,
          registration.installing,
        ].some((worker) => worker?.scriptURL === scriptUrl),
      )
      .map((registration) => registration.unregister()),
  )
  if ('caches' in window) {
    const names = await window.caches.keys()
    await Promise.all(
      names
        .filter((name) => name.startsWith('team-adwings-'))
        .map((name) => window.caches.delete(name)),
    )
  }
  return wasControlled
}
