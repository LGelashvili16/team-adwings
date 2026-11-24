import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AccountActionDialog } from './account-action-dialog'
import { updateEmployeeAccount } from '../access.functions'
import type { IssuedAccountCode } from '../access.types'

vi.mock('../access.functions', () => ({ updateEmployeeAccount: vi.fn() }))

it.each(['issue_activation', 'issue_reset'] as const)(
  'issues %s with the reason left empty',
  async (action) => {
    const issued: IssuedAccountCode = {
      code: 'ABCDEFGH2345',
      expiresAt: '2026-11-25T10:00:00Z',
      purpose: action === 'issue_activation' ? 'activation' : 'reset',
    }
    vi.mocked(updateEmployeeAccount).mockResolvedValue({
      ok: true,
      value: issued,
    })
    const onCode = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountActionDialog
          target={{
            userId: 'worker',
            name: 'ანა',
            code: 'ana',
            contactEmail: null,
            jobTitle: null,
            phone: null,
            roles: 'employee',
            state: action === 'issue_activation' ? 'invited' : 'active',
            employmentStatus: 'active',
            workingWeek: null,
          }}
          action={action}
          onClose={vi.fn()}
          onCode={onCode}
        />
      </QueryClientProvider>,
    )
    expect(
      screen.getByRole('textbox', { name: 'მოქმედების მიზეზი' }),
    ).not.toBeRequired()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'კოდის გაცემა' }))
    await waitFor(() => expect(onCode).toHaveBeenCalledWith(issued))
    expect(updateEmployeeAccount).toHaveBeenLastCalledWith({
      data: { userId: 'worker', action, reason: '' },
    })
  },
)
