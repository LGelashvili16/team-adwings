import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useMarkJobRead } from './use-mark-job-read'

const api = vi.hoisted(() => ({ markJobRead: vi.fn() }))
vi.mock('../jobs.functions', () => api)
it('acknowledges mounted details once and refreshes the signed-in account only', async () => {
  api.markJobRead.mockResolvedValue({ ok: true, value: { id: 'job' } })
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(() => useMarkJobRead('viewer', 'job'), { wrapper })
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['jobs', 'viewer'] }),
  )
  view.rerender()
  expect(api.markJobRead).toHaveBeenCalledExactlyOnceWith({
    data: { id: 'job' },
  })
})
