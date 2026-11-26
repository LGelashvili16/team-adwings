import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import JobsMap from './jobs-map'
import { jobGeofenceRing } from '../jobs.geofence'
import type { ReactNode } from 'react'

vi.mock('#/db', async () => ({
  db: (await import('drizzle-orm/node-postgres')).drizzle.mock({
    schema: await import('#/db/schema'),
  }),
}))

afterEach(() => vi.unstubAllGlobals())
const map = vi.hoisted(() => ({
  loaded: true,
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  getZoom: () => 11,
  isStyleLoaded: () => true,
  getSource: vi.fn(),
  getLayer: vi.fn(),
  getStyle: () => ({
    layers: [
      { id: 'early-label', type: 'symbol' },
      { id: 'buildings', type: 'fill-extrusion' },
      { id: 'place-label', type: 'symbol' },
    ],
  }),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}))
const bounds = vi.hoisted(() => ({ extend: vi.fn() }))
vi.mock('#/components/ui/map', () => ({
  Map: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MapMarker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MapControls: () => null,
  useMap: () => ({
    map,
    loaded: map.loaded,
    library: {
      LngLatBounds: class {
        extend = bounds.extend
      },
    },
  }),
}))

beforeEach(() => {
  map.loaded = true
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
})

it.each([false, true])(
  'fits initial results with map loaded: %s, preserves live views and animates deliberate fit requests',
  async (initiallyLoaded) => {
    map.loaded = initiallyLoaded
    map.fitBounds.mockClear()
    bounds.extend.mockClear()
    const pin = {
      id: 'first',
      title: 'პირველი',
      kind: 'installation' as const,
      status: 'pending' as const,
      longitude: 44.8,
      latitude: 41.7,
    }
    const distant = { ...pin, id: 'second', longitude: 42.7, latitude: 42.2 }
    const props = {
      pins: [pin],
      pinsReady: false,
      showEmpty: false,
      onPick: vi.fn(),
      onSelect: vi.fn(),
      camera: { current: null },
      focused: { current: null },
      canCreate: false,
      expanded: false,
      onExpand: vi.fn(),
      focusRequest: 0,
      actor: {
        id: 'employee',
        name: 'თანამშრომელი',
        email: null,
        emailVerified: false,
        roles: [],
      },
      showPlaces: false,
      onPlacesChange: vi.fn(),
      showBuildings: false,
      onBuildingsChange: vi.fn(),
    }
    const view = render(<JobsMap {...props} />)
    expect(map.fitBounds).not.toHaveBeenCalled()
    view.rerender(<JobsMap {...props} pins={[pin, distant]} pinsReady />)
    expect(bounds.extend).toHaveBeenCalledWith([44.8, 41.7])
    expect(bounds.extend).toHaveBeenCalledWith([42.7, 42.2])
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: initiallyLoaded ? 500 : 0 }),
    )
    map.loaded = true
    view.rerender(<JobsMap {...props} pins={[pin]} pinsReady />)
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
    await userEvent.click(
      screen.getByRole('button', { name: 'რუკის ხელსაწყოების ჩვენება' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'ყველა სამუშაოს ჩვენება' }),
    )
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 500, linear: true }),
    )
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'ყველა სამუშაოს ჩვენება' }),
    )
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 0 }),
    )
  },
)

it('refocuses deliberate repeat selections and preserves focus across dialog remounts', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
  map.flyTo.mockClear()
  const focused: { current: string | null } = { current: null }
  const camera = { current: null }
  const props = {
    pins: [],
    pinsReady: true,
    showEmpty: false,
    onPick: vi.fn(),
    onSelect: vi.fn(),
    camera,
    focused,
    canCreate: false,
    expanded: false,
    onExpand: vi.fn(),
    focusRequest: 0,
    actor: {
      id: 'employee',
      name: 'თანამშრომელი',
      email: null,
      emailVerified: false,
      roles: [],
    },
    showPlaces: false,
    onPlacesChange: vi.fn(),
    showBuildings: false,
    onBuildingsChange: vi.fn(),
    location: {
      sourceId: 'W:123',
      longitude: 44.8,
      latitude: 41.7,
      labelKa: 'თბილისი',
      labelEn: 'Tbilisi',
      streetNameKa: null,
      streetNameEn: null,
    },
  }
  const view = render(<JobsMap {...props} />)
  expect(map.flyTo).toHaveBeenCalledTimes(1)
  view.rerender(<JobsMap {...props} focusRequest={1} />)
  expect(map.flyTo).toHaveBeenCalledTimes(2)
  view.unmount()
  render(<JobsMap {...props} expanded focusRequest={1} />)
  expect(map.flyTo).toHaveBeenCalledTimes(2)
})

it('frames default geofences and can hide or show them without changing the camera', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
  map.fitBounds.mockClear()
  map.flyTo.mockClear()
  map.addSource.mockClear()
  map.addLayer.mockClear()
  const first = {
    id: 'first',
    title: 'პირველი',
    kind: 'installation' as const,
    status: 'pending' as const,
    longitude: 44.8,
    latitude: 41.7,
  }
  const second = { ...first, id: 'second', longitude: 42.7, latitude: 42.2 }
  const props = {
    pins: [first, second],
    pinsReady: true,
    initialPin: first.id,
    selected: first,
    showEmpty: false,
    onPick: vi.fn(),
    onSelect: vi.fn(),
    camera: { current: null },
    focused: { current: null },
    canCreate: false,
    expanded: false,
    onExpand: vi.fn(),
    focusRequest: 0,
    actor: {
      id: 'employee',
      name: 'თანამშრომელი',
      email: null,
      emailVerified: false,
      roles: [],
    },
    showPlaces: false,
    onPlacesChange: vi.fn(),
    showBuildings: false,
    onBuildingsChange: vi.fn(),
    onGeofencesChange: vi.fn(),
  }
  const view = render(<JobsMap {...props} />)
  expect(map.fitBounds).toHaveBeenCalledTimes(1)
  expect(map.fitBounds).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ maxZoom: 17 }),
  )
  expect(map.addSource).toHaveBeenLastCalledWith(
    'jobs-geofences',
    expect.objectContaining({
      type: 'geojson',
      data: expect.objectContaining({
        features: [
          expect.objectContaining({ properties: { selected: true } }),
          expect.objectContaining({ properties: { selected: false } }),
        ],
      }),
    }),
  )
  expect(map.addLayer).toHaveBeenCalledTimes(3)
  expect(map.addLayer.mock.calls.map(([, before]) => before)).toEqual([
    'place-label',
    'place-label',
    'place-label',
  ])
  const resizedSource = { setData: vi.fn() }
  map.getSource.mockReturnValueOnce(resizedSource)
  view.rerender(<JobsMap {...props} geofenceDiameter={100} />)
  expect(resizedSource.setData).toHaveBeenLastCalledWith(
    expect.objectContaining({
      features: expect.arrayContaining([
        expect.objectContaining({
          geometry: {
            type: 'Polygon',
            coordinates: [jobGeofenceRing(first, 100)],
          },
        }),
      ]),
    }),
  )
  expect(map.fitBounds).toHaveBeenCalledTimes(1)
  await userEvent.click(
    screen.getByRole('button', { name: 'რუკის ხელსაწყოების ჩვენება' }),
  )
  const toggle = screen.getByRole('button', { name: 'გეოზონების ჩვენება' })
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(toggle)
  expect(props.onGeofencesChange).toHaveBeenCalledWith(false)
  const source = { setData: vi.fn() }
  map.getSource.mockReturnValueOnce(source)
  view.rerender(<JobsMap {...props} showGeofences={false} />)
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(source.setData).toHaveBeenCalledWith({
    type: 'FeatureCollection',
    features: [],
  })
  expect(map.fitBounds).toHaveBeenCalledTimes(1)
  expect(map.flyTo).not.toHaveBeenCalled()
  await userEvent.click(toggle)
  expect(props.onGeofencesChange).toHaveBeenLastCalledWith(true)
  view.rerender(
    <JobsMap
      {...props}
      selected={second}
      focusRequest={1}
      showGeofences={false}
    />,
  )
  expect(map.flyTo).toHaveBeenCalledWith(
    expect.objectContaining({ center: [42.7, 42.2] }),
  )
})

it('exposes an accessible buildings toggle with the controlled state', async () => {
  const onBuildingsChange = vi.fn()
  const props = {
    pins: [],
    pinsReady: true,
    showEmpty: false,
    onPick: vi.fn(),
    onSelect: vi.fn(),
    camera: { current: null },
    focused: { current: null },
    canCreate: false,
    expanded: false,
    onExpand: vi.fn(),
    focusRequest: 0,
    actor: {
      id: 'employee',
      name: 'თანამშრომელი',
      email: null,
      emailVerified: false,
      roles: [],
    },
    showPlaces: false,
    onPlacesChange: vi.fn(),
    showBuildings: false,
    onBuildingsChange,
  }
  const view = render(<JobsMap {...props} />)
  const user = userEvent.setup()
  await user.click(
    screen.getByRole('button', { name: 'რუკის ხელსაწყოების ჩვენება' }),
  )
  expect(
    screen.getByRole('button', { name: 'სამგანზომილებიანი შენობები' }),
  ).toHaveAttribute('aria-pressed', 'false')
  await user.click(
    screen.getByRole('button', { name: 'სამგანზომილებიანი შენობები' }),
  )
  expect(onBuildingsChange).toHaveBeenLastCalledWith(true)
  view.rerender(<JobsMap {...props} showBuildings />)
  expect(
    screen.getByRole('button', { name: 'სამგანზომილებიანი შენობები' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await user.click(
    screen.getByRole('button', { name: 'სამგანზომილებიანი შენობები' }),
  )
  expect(onBuildingsChange).toHaveBeenLastCalledWith(false)
})

it('shows completed pins and starts with collapsed tools, with expand first and a working completed filter', async () => {
  const completed = {
    id: 'finished',
    title: 'დასრულებული აზომვა',
    kind: 'measurement' as const,
    status: 'completed' as const,
    longitude: 44.8,
    latitude: 41.7,
  }
  const active = {
    ...completed,
    id: 'active',
    title: 'მიმდინარე აზომვა',
    status: 'pending' as const,
  }
  const onCompletedChange = vi.fn()
  const props = {
    pins: [completed, active],
    pinsReady: true,
    initialPin: completed.id,
    selected: completed,
    showEmpty: false,
    onPick: vi.fn(),
    onSelect: vi.fn(),
    camera: { current: null },
    focused: { current: null },
    canCreate: false,
    expanded: false,
    onExpand: vi.fn(),
    focusRequest: 0,
    actor: {
      id: 'employee',
      name: 'თანამშრომელი',
      email: null,
      emailVerified: false,
      roles: [],
    },
    showPlaces: false,
    onPlacesChange: vi.fn(),
    showBuildings: false,
    onBuildingsChange: vi.fn(),
    onCompletedChange,
  }
  const view = render(<JobsMap {...props} />)
  expect(
    screen.getByRole('button', { name: /^დასრულებული აზომვა,/ }),
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: /^მიმდინარე აზომვა,/ }),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'დასრულებული სამუშაოების ჩვენება' }),
  ).not.toBeInTheDocument()
  const tools = view.container.querySelector<HTMLElement>('#jobs-map-controls')!
  expect(tools).toHaveAttribute('inert')
  expect(
    screen.getByRole('button', { name: 'რუკის ხელსაწყოების ჩვენება' }),
  ).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(
    screen.getByRole('button', { name: 'რუკის ხელსაწყოების ჩვენება' }),
  )
  const expand = screen.getByRole('button', { name: 'რუკის გაშლა' })
  expect(within(tools).getAllByRole('button')[0]).toBe(expand)
  await userEvent.click(expand)
  expect(props.onExpand).toHaveBeenCalledOnce()
  const finishedToggle = screen.getByRole('button', {
    name: 'დასრულებული სამუშაოების ჩვენება',
  })
  expect(finishedToggle).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(finishedToggle)
  expect(onCompletedChange).toHaveBeenLastCalledWith(false)
  view.rerender(<JobsMap {...props} showCompleted={false} />)
  expect(
    screen.queryByRole('button', { name: /^დასრულებული აზომვა,/ }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /^მიმდინარე აზომვა,/ }),
  ).toBeVisible()
  await userEvent.click(
    screen.getByRole('button', { name: 'დასრულებული სამუშაოების ჩვენება' }),
  )
  expect(onCompletedChange).toHaveBeenLastCalledWith(true)
  view.rerender(<JobsMap {...props} showCompleted />)
  expect(
    screen.getByRole('button', { name: /^დასრულებული აზომვა,/ }),
  ).toBeVisible()
  await userEvent.click(
    screen.getByRole('button', { name: 'რუკის ხელსაწყოების დამალვა' }),
  )
  expect(tools).toHaveAttribute('inert')
  expect(
    screen.getByRole('button', { name: 'რუკის ხელსაწყოების ჩვენება' }),
  ).toHaveAttribute('aria-expanded', 'false')
})
