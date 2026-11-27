import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { RealtimeProvider } from '#/providers/realtime-provider'
import { useDeviceRealtime } from './use-device-realtime'

class TestSource extends EventTarget {
  static source: TestSource
  close = vi.fn()
  constructor() {
    super()
    TestSource.source = this
  }
  send(data: unknown, topic = 'devices') {
    this.dispatchEvent(new MessageEvent(topic, { data: JSON.stringify(data) }))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('EventSource', TestSource)
})

afterEach(() => vi.unstubAllGlobals())

it('updates pending device request state and invalidates review queries only for valid device events', () => {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <RealtimeProvider actorId="hr">{children}</RealtimeProvider>
      </QueryClientProvider>
    )
  }
  const { result } = renderHook(() => useDeviceRealtime('hr'), { wrapper })
  expect(result.current).toEqual({ hasPendingDeviceRequests: false })

  act(() => TestSource.source.send({ changed: 'yes' }))
  expect(result.current.hasPendingDeviceRequests).toBe(false)
  expect(invalidate).not.toHaveBeenCalled()

  act(() =>
    TestSource.source.send(
      { changed: true, hasPendingDeviceRequests: true },
      'complaints',
    ),
  )
  expect(result.current.hasPendingDeviceRequests).toBe(false)
  expect(invalidate).not.toHaveBeenCalled()

  act(() =>
    TestSource.source.send({ changed: false, hasPendingDeviceRequests: true }),
  )
  expect(result.current).toEqual({ hasPendingDeviceRequests: true })
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['attendance-security', 'review', 'hr'],
  })

  invalidate.mockClear()
  act(() =>
    TestSource.source.send({ changed: true, hasPendingDeviceRequests: false }),
  )
  expect(result.current).toEqual({ hasPendingDeviceRequests: false })
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['attendance-security', 'review', 'hr'],
  })
})
