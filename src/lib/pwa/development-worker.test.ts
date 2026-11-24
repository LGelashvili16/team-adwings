import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

it('removes only this app worker and named caches, sharing cleanup across repeated mounts', async () => {
  vi.resetModules()
  const unregisterApp = vi.fn().mockResolvedValue(true)
  const unregisterOther = vi.fn()
  const scriptURL = new URL('/service-worker.js', window.location.origin).href
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: { scriptURL },
      getRegistrations: vi.fn().mockResolvedValue([
        { active: { scriptURL }, unregister: unregisterApp },
        {
          active: {
            scriptURL: `${window.location.origin}/unrelated-worker.js`,
          },
          unregister: unregisterOther,
        },
      ]),
    },
  })
  const removeCache = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('caches', {
    keys: vi
      .fn()
      .mockResolvedValue([
        'team-adwings-public-v1-precache',
        'unrelated-cache',
      ]),
    delete: removeCache,
  })
  const { clearDevelopmentWorker } = await import('./development-worker.client')
  expect(await clearDevelopmentWorker()).toBe(true)
  expect(await clearDevelopmentWorker()).toBe(true)
  expect(unregisterApp).toHaveBeenCalledOnce()
  expect(unregisterOther).not.toHaveBeenCalled()
  expect(removeCache).toHaveBeenCalledExactlyOnceWith(
    'team-adwings-public-v1-precache',
  )
})

it('does not request a reload when an unrelated worker controls the page', async () => {
  vi.resetModules()
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: {
        scriptURL: `${window.location.origin}/unrelated-worker.js`,
      },
      getRegistrations: vi.fn().mockResolvedValue([]),
    },
  })
  vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue([]) })
  const { clearDevelopmentWorker } = await import('./development-worker.client')
  expect(await clearDevelopmentWorker()).toBe(false)
})
