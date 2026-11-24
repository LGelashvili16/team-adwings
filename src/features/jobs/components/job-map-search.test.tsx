import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { JobMapSearch } from './job-map-search'
import { useJobMapSearch } from '../hooks/use-job-map-search'
import { jobSearchSchema } from '../jobs.schemas'

const calls = vi.hoisted(() => ({
  locations: vi.fn(),
  jobs: vi.fn(),
  selectLocation: vi.fn(),
  selectJob: vi.fn(),
}))
vi.mock('../jobs.functions', () => ({
  findJobLocations: calls.locations,
  readJobs: calls.jobs,
  readJob: vi.fn(),
}))
const location = {
  sourceId: 'W:123',
  longitude: 44.8,
  latitude: 41.7,
  labelKa: 'უნივერსიტეტის ქუჩა, თბილისი',
  labelEn: 'University Street, Tbilisi',
  streetNameKa: 'უნივერსიტეტის ქუჩა',
  streetNameEn: 'University Street',
}
const job = {
  id: '01958d45-a01f-7000-8000-000000000001',
  title: 'უნივერსიტეტის აზომვა',
  address: 'თბილისი',
  kind: 'measurement',
  deadline: null,
  status: 'pending',
  longitude: 44.8,
  latitude: 41.7,
  assigneeId: null,
  assigneeName: null,
  version: 1,
  createdAt: '2026-11-06T10:00:00Z',
  updatedAt: '2026-11-06T10:00:00Z',
}
function Harness() {
  const [search, setSearch] = useState(jobSearchSchema.parse({}))
  const model = useJobMapSearch('test-actor', search, (q) =>
    setSearch((current) => ({ ...current, q })),
  )
  return (
    <JobMapSearch
      model={model}
      onLocation={calls.selectLocation}
      onJob={calls.selectJob}
      onShowJobs={vi.fn()}
    />
  )
}
async function setup(open = true) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Harness />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  if (open)
    await user.click(
      screen.getByRole('button', { name: 'რუკაზე ძიების გახსნა' }),
    )
  return user
}
beforeEach(() => {
  vi.resetAllMocks()
  calls.locations.mockResolvedValue({
    ok: true,
    value: [location, { ...location, sourceId: 'W:456' }],
  })
  calls.jobs.mockResolvedValue({
    ok: true,
    value: {
      items: [job],
      markers: [],
      total: 1,
      mapTruncated: false,
      unmappedTotal: 0,
    },
  })
})
afterEach(() => {
  cleanup()
})

it('waits 500ms, groups addresses before jobs, deduplicates street segments and selects with the keyboard', async () => {
  const user = await setup()
  const input = screen.getByRole('combobox', {
    name: 'მდებარეობის ან სამუშაოს ძიება',
  })
  await user.type(input, 'უნივერსიტეტის')
  expect(calls.locations).not.toHaveBeenCalled()
  await screen.findByRole(
    'button',
    { name: /University Street/ },
    { timeout: 2000 },
  )
  expect(calls.locations).toHaveBeenCalledOnce()
  const options = within(
    screen.getByRole('dialog', { name: 'რუკის ძიების შედეგები' }),
  ).getAllByRole('button')
  expect(options).toHaveLength(2)
  expect(options[0]).toHaveTextContent('University Street')
  expect(options[1]).toHaveTextContent(job.title)
  await user.keyboard('{ArrowDown}{Enter}')
  expect(calls.selectLocation).toHaveBeenCalledWith(location)
})

it('can collapse and reopen search and select a measurement job', async () => {
  const user = await setup()
  await user.type(screen.getByRole('combobox'), 'უნივერსიტეტის')
  await screen.findByRole(
    'button',
    { name: /University Street/ },
    { timeout: 2000 },
  )
  await user.click(screen.getByRole('button', { name: 'რუკის ძიების ჩაკეცვა' }))
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'რუკაზე ძიების გახსნა' }),
    ).toHaveFocus(),
  )
  await user.click(screen.getByRole('button', { name: 'რუკაზე ძიების გახსნა' }))
  expect(screen.getByRole('combobox')).toHaveValue('უნივერსიტეტის')
  await user.click(screen.getByRole('combobox'))
  await user.click(
    await screen.findByRole('button', { name: new RegExp(job.title) }),
  )
  expect(calls.selectJob).toHaveBeenCalledWith(job.id)
})

it('rejects overlong input without calling either search endpoint', async () => {
  const user = await setup()
  await user.click(screen.getByRole('combobox'))
  await user.paste('ა'.repeat(101))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 550))
  })
  expect(calls.locations).not.toHaveBeenCalled()
  expect(calls.jobs).not.toHaveBeenCalled()
  expect(screen.getByText('საძიებო ტექსტი ძალიან გრძელია.')).toBeInTheDocument()
})

it('starts collapsed without search requests and focuses the field when opened', async () => {
  const user = await setup(false)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(calls.locations).not.toHaveBeenCalled()
  expect(calls.jobs).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'რუკაზე ძიების გახსნა' }))
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus())
})
