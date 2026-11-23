import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorHTMLAttributes } from 'react'
import { LoginPage } from './login-page'

const signIn = vi.hoisted(() => vi.fn())
vi.mock('#/lib/auth/auth-client', () => ({
  authClient: { signIn: { email: signIn, username: signIn } },
}))
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    clearCache: vi.fn(),
    invalidate: vi.fn(),
    navigate: vi.fn(),
  }),
  Link: ({
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props} />
  ),
}))

describe('login interactions', () => {
  beforeEach(() => {
    signIn.mockReset()
  })
  it('links to registration and allows deliberate password visibility', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)
    expect(
      screen.getByRole('link', { name: 'ანგარიშის გააქტიურება' }),
    ).toHaveAttribute('href', '/auth/register')
    const password = screen.getByLabelText('პაროლი', { exact: true })
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'პაროლის ჩვენება' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(signIn).not.toHaveBeenCalled()
  })
  it('prevents repeated submissions and shows a spinner while signing in', async () => {
    signIn.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.type(
      screen.getByLabelText('მომხმარებლის სახელი ან ელფოსტა'),
      'test@example.com',
    )
    await user.type(
      screen.getByLabelText('პაროლი', { exact: true }),
      'test-password',
    )
    await user.click(screen.getByRole('button', { name: 'შესვლა' }))
    const pending = await screen.findByRole('button', {
      name: 'მიმდინარეობს შესვლა…',
    })
    await waitFor(() => expect(pending).toBeDisabled())
    expect(pending).toHaveAttribute('aria-busy', 'true')
    expect(pending.querySelector('[data-slot="spinner"]')).not.toBeNull()
    expect(signIn).toHaveBeenCalledTimes(1)
  })
  it('uses normalized employee-code login without requiring an email', async () => {
    signIn.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.type(
      screen.getByLabelText('მომხმარებლის სახელი ან ელფოსტა'),
      'WORKER_01',
    )
    await user.type(
      screen.getByLabelText('პაროლი', { exact: true }),
      'example-password-123',
    )
    await user.click(screen.getByRole('button', { name: 'შესვლა' }))
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        username: 'worker_01',
        password: 'example-password-123',
      }),
    )
  })
  it('uses POST and disables submission during SSR so credentials never leak in the URL', () => {
    const html = renderToString(<LoginPage />)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const form = doc.querySelector('form')
    const submitButton = doc.querySelector('button[type="submit"]')
    expect(form?.getAttribute('method')).toBe('post')
    expect(submitButton?.hasAttribute('disabled')).toBe(true)
  })
  it('submits autofilled DOM credentials even if change events fired before hydration', async () => {
    signIn.mockResolvedValue({ error: null })
    const { container } = render(<LoginPage />)
    const identifier = screen.getByLabelText<HTMLInputElement>(
      'მომხმარებლის სახელი ან ელფოსტა',
    )
    const password = screen.getByLabelText<HTMLInputElement>('პაროლი', {
      exact: true,
    })
    identifier.value = 'admin'
    password.value = 'example-password-123'
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        username: 'admin',
        password: 'example-password-123',
      }),
    )
  })
})
