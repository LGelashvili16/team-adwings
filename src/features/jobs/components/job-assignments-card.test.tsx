import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { JobAssignmentsCard } from './job-assignments-card'
import type { JobDetail } from '../jobs.types'
import type { Actor } from '#/lib/authorization/actor'

const api = vi.hoisted(() => ({
  readJobAssignmentCandidates: vi.fn(),
  readJobAssignmentTeam: vi.fn(),
  saveJobAssignments: vi.fn(),
  readJob: vi.fn(),
}))
vi.mock('../jobs.functions', () => api)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const actor: Actor = {
  id: 'supervisor',
  roles: ['supervisor'],
  name: 'სატესტო უფროსი',
  email: null,
  emailVerified: false,
}
const first = {
  id: 'person-one',
  name: 'სატესტო თანამშრომელი ერთი',
  jobTitle: 'მონტაჟის სპეციალისტი',
}
const second = {
  id: 'person-two',
  name: 'სატესტო თანამშრომელი ორი',
  jobTitle: null,
}
const teamId = '019a365d-37cc-7a5c-bfe1-1e0752235b60'
const deviceId = '019a365d-37cc-7a5c-bfe1-1e0752235b61'
const job: JobDetail = {
  id: '019a365d-37cc-7a5c-bfe1-1e0752235b68',
  title: 'სატესტო სამუშაო',
  kind: 'installation',
  deadline: null,
  status: 'pending',
  address: 'თბილისი',
  notes: '',
  longitude: null,
  latitude: null,
  assigneeId: null,
  assigneeName: null,
  version: 1,
  createdAt: '2026-11-24T10:00:00Z',
  updatedAt: '2026-11-24T10:00:00Z',
  createdBy: 'other',
  creatorName: 'ავტორი',
  streetNameKa: null,
  streetNameEn: null,
  locationLabelKa: null,
  locationLabelEn: null,
  locationResolvedAt: null,
  assignments: { employees: [first], team: null, gpsDevice: null },
  history: [],
  hasMoreHistory: false,
}
function setup(by = actor, record = job) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <JobAssignmentsCard actor={by} job={record} />
    </QueryClientProvider>,
  )
  return { invalidate }
}
beforeEach(() => {
  vi.clearAllMocks()
  api.readJobAssignmentCandidates.mockImplementation(({ data }) =>
    Promise.resolve({
      ok: true,
      value: {
        items:
          data.kind === 'teams'
            ? [{ id: teamId, name: 'სატესტო გუნდი', jobTitle: null }]
            : data.kind === 'devices'
              ? [
                  {
                    id: deviceId,
                    name: 'სატესტო GPS',
                    jobTitle: null,
                    reportedId: '009876543211',
                    phone: '+995555000000',
                  },
                ]
              : [first, second],
        total: 2,
      },
    }),
  )
  api.readJobAssignmentTeam.mockResolvedValue({
    ok: true,
    value: {
      id: teamId,
      name: 'სატესტო გუნდი',
      version: 4,
      employees: [first, second],
    },
  })
  api.saveJobAssignments.mockResolvedValue({ ok: true, value: { id: job.id } })
})
it.each([
  'employee',
  'production_specialist',
  'sales_manager',
  'hr_manager',
] as const)('shows the crew read-only for %s', (role) => {
  setup({ ...actor, roles: [role] })
  expect(screen.getByText(first.name)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'შემსრულებლების დამატება' }),
  ).not.toBeInTheDocument()
})
it('keeps completed-job assignments read-only', () => {
  setup(actor, { ...job, status: 'completed' })
  expect(
    screen.queryByRole('button', { name: 'შემსრულებლების დამატება' }),
  ).not.toBeInTheDocument()
})
it('keeps changes local until save, deduplicates team members, and saves employees, team and GPS together', async () => {
  const user = userEvent.setup()
  const { invalidate } = setup()
  await user.click(
    screen.getByRole('button', { name: 'შემსრულებლების დამატება' }),
  )
  const dialog = await screen.findByRole('dialog', {
    name: 'სამუშაოზე დამატება',
  })
  await user.click(
    await within(dialog).findByRole('button', {
      name: `${second.name} დამატება`,
    }),
  )
  expect(api.saveJobAssignments).not.toHaveBeenCalled()
  expect(
    within(dialog).queryByRole('button', { name: 'გუნდი' }),
  ).not.toBeInTheDocument()
  expect(
    within(dialog).getByRole('button', { name: 'GPS მოწყობილობა' }),
  ).toBeVisible()
  await user.click(
    within(dialog).getByRole('button', { name: 'დამატებითი პარამეტრები' }),
  )
  await user.click(within(dialog).getByRole('button', { name: 'გუნდი' }))
  await user.click(
    await screen.findByRole('button', { name: 'სატესტო გუნდი არჩევა' }),
  )
  await waitFor(() =>
    expect(api.readJobAssignmentTeam).toHaveBeenCalledWith({
      data: { id: teamId },
    }),
  )
  await user.click(
    within(dialog).getByRole('button', { name: 'GPS მოწყობილობა' }),
  )
  expect(await screen.findByText('+995555000000')).toBeVisible()
  expect(screen.getByText('GPS ID: 009876543211')).toBeVisible()
  await user.click(
    await screen.findByRole('button', { name: 'სატესტო GPS არჩევა' }),
  )
  await user.click(within(dialog).getByRole('button', { name: 'შენახვა' }))
  await waitFor(() =>
    expect(api.saveJobAssignments).toHaveBeenCalledWith({
      data: {
        id: job.id,
        version: 1,
        employeeIds: [first.id, second.id],
        teamId,
        teamVersion: 4,
        gpsDeviceId: deviceId,
      },
    }),
  )
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['jobs', actor.id] })
})
it('discards a cancelled draft and reopens the persisted crew', async () => {
  const user = userEvent.setup()
  setup()
  await user.click(
    screen.getByRole('button', { name: 'შემსრულებლების დამატება' }),
  )
  await user.click(
    await screen.findByRole('button', { name: `${first.name} ამოღება` }),
  )
  await user.click(screen.getByRole('button', { name: 'გაუქმება' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  await user.click(
    screen.getByRole('button', { name: 'შემსრულებლების დამატება' }),
  )
  expect(
    await screen.findByRole('button', { name: `${first.name} ამოღება` }),
  ).toBeVisible()
  expect(api.saveJobAssignments).not.toHaveBeenCalled()
})
it('applies role filters immediately and keeps employee additions explicit', async () => {
  const user = userEvent.setup()
  setup()
  await user.click(
    screen.getByRole('button', { name: 'შემსრულებლების დამატება' }),
  )
  await user.click(
    await screen.findByRole('button', { name: 'როლების ფილტრი, არჩეულია 1' }),
  )
  expect(
    screen.getByRole('checkbox', {
      name: 'წარმოების სპეციალისტი',
    }),
  ).toBeChecked()
  await user.click(screen.getByRole('checkbox', { name: 'თანამშრომელი' }))
  await user.click(
    screen.getByRole('checkbox', {
      name: 'წარმოების სპეციალისტი',
    }),
  )
  await waitFor(() =>
    expect(api.readJobAssignmentCandidates).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { kind: 'employees', q: '', page: 1, roles: ['employee'] },
      }),
    ),
  )
  await user.keyboard('{Escape}')
  await user.click(
    screen.getByRole('button', { name: `${second.name} დამატება` }),
  )
  expect(
    screen.getByRole('button', { name: `${second.name} დამატებულია` }),
  ).toBeDisabled()
  expect(api.saveJobAssignments).not.toHaveBeenCalled()
})
it('retains the draft on a stale revision and requires review before retrying', async () => {
  const user = userEvent.setup()
  api.saveJobAssignments.mockResolvedValueOnce({
    ok: false,
    code: 'conflict',
    message: 'სამუშაო უკვე შეიცვალა.',
  })
  api.readJob.mockResolvedValue({
    ok: true,
    value: {
      ...job,
      version: 2,
      assignments: { ...job.assignments, employees: [second] },
    },
  })
  setup()
  await user.click(
    screen.getByRole('button', { name: 'შემსრულებლების დამატება' }),
  )
  await user.click(
    await screen.findByRole('button', { name: `${second.name} დამატება` }),
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  expect(await screen.findByText('სამუშაო უკვე შეიცვალა.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'შენახვა' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `${first.name} ამოღება` }),
  ).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'მიმდინარე ინფორმაციის ჩატვირთვა' }),
  )
  expect(await screen.findByText(`შემსრულებლები: ${second.name}`)).toBeVisible()
  await user.click(
    screen.getByRole('button', {
      name: 'გადავხედე, ჩემი ცვლილებებით გაგრძელება',
    }),
  )
  await user.click(screen.getByRole('button', { name: 'შენახვა' }))
  await waitFor(() =>
    expect(api.saveJobAssignments).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        version: 2,
        employeeIds: [first.id, second.id],
      }),
    }),
  )
})
