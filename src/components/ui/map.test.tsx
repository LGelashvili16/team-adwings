import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Map, MapMarker } from './map'

const fake = vi.hoisted(() => ({
  container: null as HTMLElement | null,
  load: () => {},
  setLngLat: vi.fn().mockReturnThis(),
  removeMarker: vi.fn(),
  marker: vi.fn(),
}))
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    constructor(options: { container: HTMLElement }) {
      fake.container = options.container
    }
    on(event: string, handler: () => void) {
      if (event === 'load') fake.load = handler
      return this
    }
    getCanvas() {
      return document.createElement('canvas')
    }
    setStyle() {}
    resize() {}
    remove() {}
  },
  Marker: class {
    element: HTMLElement
    constructor({ element }: { element: HTMLElement }) {
      this.element = element
      fake.marker()
    }
    setLngLat = fake.setLngLat
    addTo() {
      fake.container?.append(this.element)
      return this
    }
    remove() {
      fake.removeMarker()
      this.element.remove()
    }
  },
}))

afterEach(() => vi.unstubAllGlobals())

it('keeps markers off the loading map, mounts them once when ready and updates their positions in place', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const content = (longitude: number) => (
    <Map>
      <MapMarker longitude={longitude} latitude={41.7}>
        <button>სამუშაო</button>
      </MapMarker>
    </Map>
  )
  const view = render(content(44.8))
  await waitFor(() => expect(fake.container).not.toBeNull())
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  expect(
    screen.queryByRole('button', { name: 'სამუშაო' }),
  ).not.toBeInTheDocument()
  expect(fake.marker).not.toHaveBeenCalled()
  await act(async () => fake.load())
  expect(screen.getByRole('button', { name: 'სამუშაო' })).toBeVisible()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(fake.marker).toHaveBeenCalledOnce()
  view.rerender(content(44.9))
  expect(fake.setLngLat).toHaveBeenLastCalledWith([44.9, 41.7])
  expect(fake.marker).toHaveBeenCalledOnce()
  view.unmount()
  expect(fake.removeMarker).toHaveBeenCalledOnce()
})
