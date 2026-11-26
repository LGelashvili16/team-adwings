import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ka } from 'date-fns/locale'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProvisionAccountForm } from './provision-account-form'

const { create, success, error, scheduleRead } = vi.hoisted(() => ({
  create: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  scheduleRead: vi.fn(),
}))
vi.mock('../access.functions', () => ({ createEmployeeAccount: create }))
vi.mock('#/features/scheduling/scheduling.functions', () => ({
  getScheduleSettings: scheduleRead,
}))
vi.mock('#/features/leave/day-off-allowance.functions', () => ({
  getDayOffSettings: vi.fn().mockResolvedValue({
    ok: true,
    value: { defaultDays: 4, resetYearly: true, revision: 0 },
  }),
}))
vi.mock('sonner', () => ({ toast: { success, error } }))
beforeEach(() => {
  create.mockReset()
  success.mockReset()
  error.mockReset()
  scheduleRead
    .mockReset()
    .mockResolvedValue({ ok: true, value: { current: null } })
})

describe('administrative account provisioning', () => {
  it('keeps ordinary access when an HR job title is entered without opening access settings', async () => {
    const user = userEvent.setup()
    create.mockResolvedValue({ ok: false, message: 'საცდელი პასუხი.' })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvisionAccountForm onCode={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(
      screen.getByRole('button', { name: /სისტემაში წვდომა/ }),
    ).toHaveAttribute('aria-expanded', 'false')
    await user.type(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
      'ანა მაისურაძე',
    )
    await user.type(screen.getByRole('textbox', { name: 'თანამდებობა' }), 'HR')
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ jobTitle: 'HR', roles: ['employee'] }),
      }),
    )
  })
  it('submits the selected employment start date', async () => {
    const user = userEvent.setup()
    create.mockResolvedValue({ ok: false, message: 'საცდელი პასუხი.' })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvisionAccountForm onCode={vi.fn()} canSetEmploymentDate />
      </QueryClientProvider>,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
      'ანა მაისურაძე',
    )
    await user.click(screen.getByLabelText('მუშაობის დაწყების თარიღი'))
    const date = new Date()
    date.setDate(15)
    await user.click(
      await screen.findByRole('button', {
        name: format(date, 'EEEE, d MMMM yyyy', { locale: ka }),
      }),
    )
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employmentStartDate: format(date, 'yyyy-MM-dd'),
        }),
      }),
    )
  })

  it('offers the five non-admin employee roles for HR without a username field', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvisionAccountForm onCode={vi.fn()} canAssignAdmin={false} />
      </QueryClientProvider>,
    )
    expect(
      screen.queryByRole('textbox', { name: 'მომხმარებლის სახელი' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /სისტემაში წვდომა/ }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
    for (const name of [
      'თანამშრომელი',
      'წარმოების სპეციალისტი',
      'წარმოების უფროსი',
      'გაყიდვების მენეჯერი',
      'HR',
    ])
      expect(screen.getByRole('checkbox', { name })).toBeEnabled()
    await user.click(
      screen.getByRole('checkbox', { name: 'გაყიდვების მენეჯერი' }),
    )
    expect(
      screen.getByRole('checkbox', { name: 'გაყიდვების მენეჯერი' }),
    ).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'თანამშრომელი' })).toBeChecked()
  })
  it('submits HR and accountant together and requires at least one selection', async () => {
    const user = userEvent.setup()
    create.mockResolvedValue({ ok: false, message: 'საცდელი პასუხი.' })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvisionAccountForm onCode={vi.fn()} canAssignAdmin />
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: /სისტემაში წვდომა/ }))
    expect(
      screen.getByRole('checkbox', { name: 'ადმინისტრატორი' }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('checkbox', { name: 'კომპანიის მფლობელი' }),
    ).not.toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
      'ანა მაისურაძე',
    )
    await user.click(screen.getByRole('checkbox', { name: 'თანამშრომელი' }))
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    expect(await screen.findByText('აირჩიეთ მინიმუმ ერთი როლი.')).toBeVisible()
    expect(create).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: 'HR' }))
    await user.click(screen.getByRole('checkbox', { name: 'ბუღალტერი' }))
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          roles: ['hr_manager', 'accountant'],
          workingWeek: null,
        }),
      }),
    )
  })
  it('omits schedule settings when the actor cannot configure schedules', async () => {
    const user = userEvent.setup()
    create.mockResolvedValue({ ok: false, message: 'საცდელი პასუხი.' })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvisionAccountForm onCode={vi.fn()} canAssignAdmin={false} />
      </QueryClientProvider>,
    )
    expect(
      screen.queryByRole('switch', { name: 'კომპანიის განრიგის გამოყენება' }),
    ).not.toBeInTheDocument()
    expect(scheduleRead).not.toHaveBeenCalled()
    await user.type(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
      'ანა მაისურაძე',
    )
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          roles: ['employee'],
          workingWeek: null,
        }),
      }),
    )
  })
  it('submits optional profile details and an office week with Saturday off', async () => {
    const days = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      hours: index < 6 ? { start: '10:00', end: '19:00' } : null,
    }))
    scheduleRead.mockResolvedValue({ ok: true, value: { current: { days } } })
    create.mockResolvedValue({ ok: false, message: 'საცდელი პასუხი.' })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvisionAccountForm
          onCode={vi.fn()}
          canAssignAdmin={false}
          canConfigureSchedule
        />
      </QueryClientProvider>,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
      'ანა მაისურაძე',
    )
    await user.type(
      screen.getByRole('textbox', { name: 'თანამდებობა' }),
      'დიზაინერი',
    )
    await user.type(
      screen.getByRole('textbox', { name: 'ტელეფონის ნომერი' }),
      '+995 555 12 34 56',
    )
    const inherit = screen.getByRole('switch', {
      name: 'კომპანიის განრიგის გამოყენება',
    })
    await waitFor(() => expect(inherit).toBeEnabled())
    const remoteMonday = screen.getByRole('switch', {
      name: 'ორშაბათი, დისტანციურად',
    })
    expect(remoteMonday).not.toBeChecked()
    await user.click(remoteMonday)
    await user.click(inherit)
    await user.click(
      screen.getByRole('switch', { name: 'შაბათი: სამუშაო დღე' }),
    )
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobTitle: 'დიზაინერი',
        phone: '+995 555 12 34 56',
        remoteWeekdays: [1],
        workingWeek: days.map((day) =>
          day.weekday === 6 ? { ...day, hours: null } : day,
        ),
      }),
    })
  })
  it('permits an empty contact email and shows a code only after successful provisioning', async () => {
    const user = userEvent.setup()
    const onCode = vi.fn()
    const secret = {
      code: 'A'.repeat(12),
      expiresAt: '2026-11-05T00:00:00Z',
      purpose: 'activation',
    }
    create.mockResolvedValue({ ok: true, value: secret })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvisionAccountForm onCode={onCode} canAssignAdmin={false} />
      </QueryClientProvider>,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
      'ანა მაისურაძე',
    )
    expect(screen.queryByLabelText('შექმნის მიზეზი')).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
    ).toBeRequired()
    expect(screen.getByRole('textbox', { name: 'ელფოსტა' })).not.toBeRequired()
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'ანა მაისურაძე',
        contactEmail: '',
        roles: ['employee'],
        jobTitle: '',
        phone: '',
        workingWeek: null,
        dayOffAllowance: null,
      },
    })
    expect(onCode).toHaveBeenCalledWith(secret)
    expect(success).toHaveBeenCalledExactlyOnceWith(
      'თანამშრომლის ანგარიში შექმნილია.',
    )
    expect(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
    ).toHaveValue('')
  })

  it('rejects malformed optional email before requesting account creation', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvisionAccountForm onCode={vi.fn()} canAssignAdmin={false} />
      </QueryClientProvider>,
    )
    await user.type(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
      'ანა მაისურაძე',
    )
    await user.type(screen.getByRole('textbox', { name: 'ელფოსტა' }), 'invalid')
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    expect(await screen.findByText('ელფოსტა არასწორია.')).toBeVisible()
    expect(create).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('requires a name without exposing creation codes on failure', async () => {
    const user = userEvent.setup()
    const onCode = vi.fn()
    create.mockResolvedValue({
      ok: false,
      message: 'ელფოსტა უკვე გამოიყენება.',
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvisionAccountForm onCode={onCode} canAssignAdmin={false} />
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    expect(await screen.findByText('მიუთითეთ სახელი და გვარი.')).toBeVisible()
    expect(create).not.toHaveBeenCalled()
    await user.type(
      screen.getByRole('textbox', { name: 'სახელი და გვარი' }),
      'ანა მაისურაძე',
    )
    await user.click(screen.getByRole('button', { name: 'ანგარიშის შექმნა' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ელფოსტა უკვე გამოიყენება.',
    )
    expect(onCode).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledExactlyOnceWith('ელფოსტა უკვე გამოიყენება.')
    expect(success).not.toHaveBeenCalled()
  })
})
