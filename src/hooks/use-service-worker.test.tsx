import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'
import { useServiceWorker } from './use-service-worker'

const worker = vi.hoisted(() => ({
  update: vi.fn<() => Promise<ServiceWorkerRegistration>>(),
  apply: vi.fn(),
  register: vi.fn<(options: RegisterSWOptions) => void>(),
  cleanup: vi.fn(),
}))
vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: RegisterSWOptions) => {
    worker.register(options)
    void navigator.serviceWorker.getRegistration().then((registration) => {
      options.onRegisteredSW?.('/service-worker.js', registration)
    })
    return worker.apply
  },
}))
vi.mock('#/lib/pwa/development-worker.client', () => ({
  clearDevelopmentWorker: worker.cleanup,
}))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it('checks immediately, periodically and on resume without applying updates automatically', async () => {
  vi.stubEnv('PROD', true)
  vi.stubEnv('DEV', false)
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: vi.fn().mockResolvedValue({ update: worker.update }),
    },
    onLine: true,
  })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  worker.update.mockImplementation(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) throw new Error('Test worker registration is missing')
    return registration
  })
  vi.useFakeTimers()
  const { unmount } = renderHook(() => useServiceWorker())
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(worker.update).toHaveBeenCalledOnce()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5 * 60_000)
  })
  expect(worker.update).toHaveBeenCalledTimes(2)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
    window.dispatchEvent(new Event('focus'))
  })
  expect(worker.update).toHaveBeenCalledTimes(3)
  expect(worker.apply).not.toHaveBeenCalled()
  expect(worker.cleanup).not.toHaveBeenCalled()
  unmount()
  await vi.advanceTimersByTimeAsync(5 * 60_000)
  window.dispatchEvent(new Event('focus'))
  expect(worker.update).toHaveBeenCalledTimes(3)
})

it('cleans development workers without registering a production worker', async () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('PROD', false)
  vi.stubGlobal('navigator', { serviceWorker: {} })
  worker.cleanup.mockResolvedValue(false)
  renderHook(() => useServiceWorker())
  await waitFor(() => expect(worker.cleanup).toHaveBeenCalledOnce())
  expect(worker.register).not.toHaveBeenCalled()
})
