import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorHTMLAttributes } from 'react'
import { RegisterPage } from './register-page'
import { AccountSetupForm } from '../components/account-setup-form'

const submit = vi.hoisted(() => vi.fn())
vi.mock('#/lib/auth/auth-client', () => ({ authClient: { $fetch: submit } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props} />
  ),
}))
beforeEach(() => submit.mockReset())

describe('employee account activation', () => {
  it('requires an issued code, Latin username, and matching passwords without collecting email', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)
    expect(screen.queryByLabelText(/ელფოსტა/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/ერთჯერადი კოდი/), 'invalid')
    await user.type(screen.getByLabelText(/მომხმარებლის სახელი/), 'გიორგი')
    await user.type(
      screen.getByLabelText(/ახალი პაროლი/, { selector: 'input' }),
      'example-password-123',
    )
    await user.type(
      screen.getByLabelText(/პაროლის გამეორება/, { selector: 'input' }),
      'different-password',
    )
    await user.click(
      screen.getByRole('button', { name: 'ანგარიშის გააქტიურება' }),
    )
    expect(
      await screen.findByText(
        'მიუთითეთ ადმინისტრატორისგან მიღებული ერთჯერადი კოდი.',
      ),
    ).toBeVisible()
    expect(
      await screen.findByText(
        'გამოიყენეთ ლათინური ასოები, ციფრები, წერტილი, დეფისი ან ქვედა ტირე.',
      ),
    ).toBeVisible()
    expect(
      await screen.findByText('პაროლები ერთმანეთს არ ემთხვევა.'),
    ).toBeVisible()
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits code, normalized username, and password to activation endpoint', async () => {
    submit.mockResolvedValue({ data: { status: true }, error: null })
    const user = userEvent.setup()
    render(<RegisterPage />)
    await user.type(screen.getByLabelText(/ერთჯერადი კოდი/), 'A'.repeat(12))
    const username = screen.getByLabelText(/მომხმარებლის სახელი/)
    await user.type(username, 'Giorgi Beridze')
    expect(username).toHaveValue('Giorgi-Beridze')
    expect(screen.getByRole('status')).toHaveTextContent(
      'გამოტოვებული ადგილები დეფისებით (-) შეიცვალა.',
    )
    await user.type(
      screen.getByLabelText(/ახალი პაროლი/, { selector: 'input' }),
      'example-password-123',
    )
    await user.type(
      screen.getByLabelText(/პაროლის გამეორება/, { selector: 'input' }),
      'example-password-123',
    )
    await user.click(
      screen.getByRole('button', { name: 'ანგარიშის გააქტიურება' }),
    )
    expect(submit).toHaveBeenCalledWith('/employee-activate', {
      method: 'POST',
      body: {
        code: 'A'.repeat(12),
        username: 'giorgi-beridze',
        newPassword: 'example-password-123',
      },
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'ანგარიში გააქტიურებულია',
    )
    expect(screen.getByRole('status')).toHaveTextContent('პაროლი შენახულია')
    expect(screen.getByRole('link', { name: 'შესვლა' })).toHaveAttribute(
      'href',
      '/auth/login',
    )
    expect(screen.queryByLabelText(/ერთჯერადი კოდი/)).not.toBeInTheDocument()
  })

  it('replaces pasted whitespace and keeps the cursor at an edited separator', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)
    const username =
      screen.getByLabelText<HTMLInputElement>(/მომხმარებლის სახელი/)
    await user.click(username)
    await user.paste('Giorgi  Beridze')
    expect(username).toHaveValue('Giorgi-Beridze')
    await user.type(username, ' ', {
      initialSelectionStart: 6,
      initialSelectionEnd: 7,
    })
    expect(username).toHaveValue('Giorgi-Beridze')
    expect(username.selectionStart).toBe(7)
    await user.clear(username)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('prevents repeat submission while pending and maps invalid codes and duplicate usernames to Georgian', async () => {
    let resolve: (value: { error: { status: number } }) => void = () => {}
    submit.mockReturnValue(
      new Promise((complete) => {
        resolve = complete
      }),
    )
    const user = userEvent.setup()
    render(<RegisterPage />)
    await user.type(screen.getByLabelText(/ერთჯერადი კოდი/), 'A'.repeat(12))
    await user.type(screen.getByLabelText(/მომხმარებლის სახელი/), 'worker-01')
    await user.type(
      screen.getByLabelText(/ახალი პაროლი/, { selector: 'input' }),
      'example-password-123',
    )
    await user.type(
      screen.getByLabelText(/პაროლის გამეორება/, { selector: 'input' }),
      'example-password-123',
    )
    await user.click(
      screen.getByRole('button', { name: 'ანგარიშის გააქტიურება' }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'ანგარიშის გააქტიურება' }),
      ).toBeDisabled(),
    )
    resolve({ error: { status: 400 } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'კოდი არასწორია, ვადაგასულია ან უკვე გამოყენებულია',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    submit.mockResolvedValueOnce({ error: { status: 409 } })
    await user.click(
      screen.getByRole('button', { name: 'ანგარიშის გააქტიურება' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ეს მომხმარებლის სახელი უკვე დაკავებულია. აირჩიეთ სხვა სახელი.',
    )
  })

  it('keeps password reset confirmation separate from activation without a username field', async () => {
    submit.mockResolvedValue({ data: { status: true }, error: null })
    const user = userEvent.setup()
    render(<AccountSetupForm purpose="reset" />)
    expect(
      screen.queryByLabelText(/მომხმარებლის სახელი/),
    ).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/ერთჯერადი კოდი/), 'A'.repeat(12))
    await user.type(
      screen.getByLabelText(/ახალი პაროლი/, { selector: 'input' }),
      'example-password-123',
    )
    await user.type(
      screen.getByLabelText(/პაროლის გამეორება/, { selector: 'input' }),
      'example-password-123',
    )
    await user.click(screen.getByRole('button', { name: 'პაროლის შენახვა' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'პაროლი შეცვლილია',
    )
    expect(screen.getByRole('link', { name: 'შესვლა' })).toHaveAttribute(
      'href',
      '/auth/login',
    )
    expect(
      screen.queryByText('ანგარიში გააქტიურებულია'),
    ).not.toBeInTheDocument()
    expect(submit).toHaveBeenCalledWith('/employee-reset', {
      method: 'POST',
      body: { code: 'A'.repeat(12), newPassword: 'example-password-123' },
    })
  })

  it('uses POST and disables submission during SSR to prevent code or password URL exposure', () => {
    const html = renderToString(<RegisterPage />)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelector('form')?.getAttribute('method')).toBe('post')
    expect(
      doc.querySelector('button[type="submit"]')?.hasAttribute('disabled'),
    ).toBe(true)
  })
})
