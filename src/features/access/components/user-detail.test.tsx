import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { UserDetail } from './user-detail'
import type { Actor } from '#/lib/authorization/actor'
import type { EmployeeAccountRecord } from '../access.types'

vi.mock('#/features/employees/components/employee-employment-card', () => ({
  EmployeeEmploymentCard: () => null,
}))

vi.mock('#/db', async () => ({
  db: (await import('drizzle-orm/node-postgres')).drizzle.mock({
    schema: await import('#/db/schema'),
  }),
}))

const { getEmployeeAccount, updateEmployeeDetails } = vi.hoisted(() => ({
  getEmployeeAccount: vi.fn(),
  updateEmployeeDetails: vi.fn(),
}))
vi.mock('../access.functions', () => ({
  getEmployeeAccount,
  updateEmployeeAccount: vi.fn(),
  updateEmployeeDetails,
}))
vi.mock('#/features/scheduling/scheduling.functions', () => ({
  getScheduleSettings: vi.fn(async () => ({
    ok: true,
    value: { current: { days: companyWeek } },
  })),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    search,
    params,
    ...props
  }: {
    to: string
    children: React.ReactNode
    search?: Record<string, string | number>
    params?: Record<string, string>
  }) => (
    <a
      href={
        to.replace(
          /\$([A-Za-z]+)/g,
          (_, name: string) => params?.[name] ?? `$${name}`,
        ) +
        (search
          ? `?${new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]))}`
          : '')
      }
      {...props}
    >
      {children}
    </a>
  ),
}))

const actor: Actor = {
  id: 'administrator',
  name: 'ადმინისტრატორი',
  email: null,
  emailVerified: false,
  roles: ['admin'],
}
const record: EmployeeAccountRecord = {
  userId: 'employee',
  name: 'ანა მაისურაძე',
  code: 'worker-01',
  contactEmail: 'ana@example.com',
  jobTitle: 'დიზაინერი',
  phone: '+995 555 12 34 56',
  roles: 'employee',
  state: 'active',
  employmentStatus: 'active',
  workingWeek: null,
}
const companyWeek = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  hours: weekday < 6 ? { start: '10:00', end: '19:00' } : null,
}))

function renderDetail(
  overrides: Partial<EmployeeAccountRecord> = {},
  currentActor = actor,
) {
  const target = { ...record, ...overrides }
  getEmployeeAccount.mockResolvedValue({
    ok: true,
    value: { record: target, companyWeek },
  })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <UserDetail userId={target.userId} actor={currentActor} />
    </QueryClientProvider>,
  )
}

describe('single account page', () => {
  it('starts the sheet opening transition when editing is requested', async () => {
    // Hold the first animation frame so the opening state can be observed reliably.
    const callbacks: Array<FrameRequestCallback> = []
    const frame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => {
        callbacks.push(cb)
        return callbacks.length
      })
    try {
      const user = userEvent.setup()
      renderDetail()
      await user.click(
        await screen.findByRole('button', { name: 'რედაქტირება' }),
      )
      expect(
        await screen.findByRole('dialog', { name: 'მონაცემების რედაქტირება' }),
      ).toHaveAttribute('data-starting-style')
    } finally {
      frame.mockRestore()
      for (const cb of callbacks) cb(performance.now())
    }
  })
  it('edits an existing role set together with employee details', async () => {
    updateEmployeeDetails.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderDetail({ roles: 'employee,hr_manager' })
    await user.click(await screen.findByRole('button', { name: 'რედაქტირება' }))
    expect(
      await screen.findByRole('dialog', { name: 'მონაცემების რედაქტირება' }),
    ).toHaveAttribute('data-slot', 'sheet-content')
    expect(screen.queryByLabelText('ცვლილების მიზეზი')).not.toBeInTheDocument()
    const name = screen.getByRole('textbox', { name: 'სახელი და გვარი' })
    await user.clear(name)
    await user.type(name, 'განახლებული სახელი')
    const username = screen.getByRole('textbox', {
      name: 'მომხმარებლის სახელი',
    })
    await user.clear(username)
    await user.type(username, 'worker-updated')
    await user.click(screen.getByRole('button', { name: /სისტემაში წვდომა/ }))
    expect(screen.getByRole('checkbox', { name: 'HR' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'თანამშრომელი' }))
    await user.click(screen.getByRole('checkbox', { name: 'ბუღალტერი' }))
    await user.click(screen.getByRole('button', { name: 'შენახვა' }))
    expect(updateEmployeeDetails).toHaveBeenCalledOnce()
    expect(updateEmployeeDetails.mock.calls[0][0].data).toMatchObject({
      name: 'განახლებული სახელი',
      code: 'worker-updated',
      roles: ['hr_manager', 'accountant'],
      expectedRoles: 'employee,hr_manager',
      userId: 'employee',
    })
    expect(updateEmployeeDetails.mock.calls[0][0].data).not.toHaveProperty(
      'reason',
    )
  })
  it('lets HR edit employees, non-admin roles, and schedules from management', async () => {
    const user = userEvent.setup()
    renderDetail({}, { ...actor, roles: ['hr_manager'] })
    await screen.findByRole('heading', { name: 'ანა მაისურაძე' })
    expect(
      screen.getByRole('link', { name: 'თანამშრომლების ანგარიშები' }),
    ).toHaveAttribute('href', '/manage/employees?page=1')
    await user.click(await screen.findByRole('button', { name: 'რედაქტირება' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /სისტემაში წვდომა/ }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
    expect(screen.getByRole('checkbox', { name: 'HR' })).toBeEnabled()
    expect(
      screen.queryByRole('checkbox', { name: 'ბუღალტერი' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'კომპანიის განრიგის გამოყენება' }),
    ).toBeInTheDocument()
  })
  it.each(['admin', 'accountant', 'owner'])(
    'hides privileged %s account actions from HR',
    async (role) => {
      renderDetail({ roles: role }, { ...actor, roles: ['hr_manager'] })
      await screen.findByRole('heading', { name: 'ანა მაისურაძე' })
      expect(
        screen.queryByRole('button', { name: 'რედაქტირება' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'შეჩერება' }),
      ).not.toBeInTheDocument()
    },
  )
  it('links authorized account managers to attendance and timesheets', async () => {
    renderDetail({}, { ...actor, roles: ['owner'] })
    expect(
      await screen.findByRole('link', { name: 'დასწრების ჩანაწერები' }),
    ).toHaveAttribute('href', '/manage/attendance/employee')
    expect(
      screen.getByRole('link', { name: 'სამუშაო საათები' }),
    ).toHaveAttribute('href', '/manage/attendance/employee?view=timesheet')
  })

  it('provides company read navigation to administrators', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'ანა მაისურაძე' })
    expect(
      screen.queryByRole('link', { name: 'დასწრების ჩანაწერები' }),
    ).toHaveAttribute('href', '/manage/attendance/employee')
    expect(
      screen.queryByRole('link', { name: 'სამუშაო საათები' }),
    ).toHaveAttribute('href', '/manage/attendance/employee?view=timesheet')
  })

  it('checks attendance and timesheet access separately', async () => {
    renderDetail(
      {},
      {
        ...actor,
        roles: ['hr_manager'],
        permissionOverrides: {
          allow: [],
          deny: ['attendance.read.all', 'timesheets.review.team'],
        },
      },
    )
    expect(
      await screen.findByRole('link', { name: 'დასწრების ჩანაწერები' }),
    ).toHaveAttribute('href', '/manage/attendance/employee')
    expect(
      screen.queryByRole('link', { name: 'სამუშაო საათები' }),
    ).not.toBeInTheDocument()
  })
  it('shows personal data, the inherited working week and management actions', async () => {
    renderDetail()
    expect(
      await screen.findByRole('heading', { name: 'ანა მაისურაძე' }),
    ).toBeVisible()
    expect(screen.getByText('ana@example.com')).toBeVisible()
    expect(screen.getByText('დიზაინერი')).toBeVisible()
    expect(screen.getByText('კომპანიის განრიგი')).toBeVisible()
    expect(
      screen.getByText('ორშაბათი: 10:00-დან 19:00-მდე'),
    ).toBeInTheDocument()
    expect(screen.getByText('აღდგენის კოდის გაცემა')).toBeVisible()
    expect(screen.getByRole('button', { name: 'რედაქტირება' })).toBeVisible()
  })

  it('opens the confirmation dialog for an action', async () => {
    const user = userEvent.setup()
    renderDetail()
    await user.click(await screen.findByRole('button', { name: 'შეჩერება' }))
    expect(
      await screen.findByRole('dialog', { name: 'წვდომის შეჩერება' }),
    ).toBeVisible()
  })

  it.each(['owner', 'admin', 'hr_manager'] as const)(
    'lets %s edit their profile and working days',
    async (role) => {
      updateEmployeeDetails.mockClear().mockResolvedValue({ ok: true })
      const user = userEvent.setup()
      renderDetail(
        { userId: actor.id, roles: role },
        { ...actor, roles: [role] },
      )
      const edit = await screen.findByRole('button', { name: 'რედაქტირება' })
      expect(screen.queryByRole('button', { name: 'შეჩერება' })).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'აღდგენის კოდის გაცემა' }),
      ).toBeNull()
      await user.click(edit)
      expect(screen.getAllByRole('textbox')).toHaveLength(5)
      expect(
        screen.queryByRole('button', { name: /სისტემაში წვდომა/ }),
      ).toBeNull()
      const inherit = screen.getByRole('switch', {
        name: 'კომპანიის განრიგის გამოყენება',
      })
      expect(inherit).toBeChecked()
      await user.click(inherit)
      await user.click(
        screen.getByRole('switch', { name: 'ორშაბათი: სამუშაო დღე' }),
      )
      const jobTitle = screen.getByRole('textbox', { name: 'თანამდებობა' })
      await user.clear(jobTitle)
      await user.type(jobTitle, 'გუნდის ხელმძღვანელი')
      await user.click(screen.getByRole('button', { name: 'შენახვა' }))
      expect(updateEmployeeDetails).toHaveBeenCalledExactlyOnceWith({
        data: {
          userId: actor.id,
          name: record.name,
          code: record.code,
          contactEmail: record.contactEmail,
          jobTitle: 'გუნდის ხელმძღვანელი',
          phone: record.phone,
          workingWeek: [{ weekday: 1, hours: null }, ...companyWeek.slice(1)],
        },
      })
    },
  )

  it('omits an untouched working week when saving personal details', async () => {
    updateEmployeeDetails.mockClear().mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderDetail({ userId: actor.id, roles: 'admin', workingWeek: companyWeek })
    await user.click(await screen.findByRole('button', { name: 'რედაქტირება' }))
    await user.click(screen.getByRole('button', { name: 'შენახვა' }))
    expect(updateEmployeeDetails).toHaveBeenCalledOnce()
    expect(updateEmployeeDetails.mock.calls[0][0].data).not.toHaveProperty(
      'workingWeek',
    )
  })

  it.each(['employee', 'accountant', 'supervisor'] as const)(
    'hides the self-edit button for %s',
    async (role) => {
      renderDetail(
        { userId: actor.id, roles: role },
        { ...actor, roles: [role] },
      )
      await screen.findByRole('heading', { name: record.name })
      expect(screen.queryByRole('button', { name: 'რედაქტირება' })).toBeNull()
    },
  )

  it('reports a missing account', async () => {
    getEmployeeAccount.mockResolvedValue({ ok: true, value: null })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <UserDetail userId="missing" actor={actor} />
      </QueryClientProvider>,
    )
    expect(
      await screen.findByText('თანამშრომლის ანგარიში ვერ მოიძებნა.'),
    ).toBeVisible()
  })
})
