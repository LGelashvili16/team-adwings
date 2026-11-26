import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { endEmployeeEmployment } from '#/features/access/access.functions'
import { EndEmploymentSheet } from './end-employment-sheet'

vi.mock('#/features/access/access.functions', () => ({
  endEmployeeEmployment: vi.fn(),
}))

it('requires a reason and submits the last day for the confirmed employment period', async () => {
  const user = userEvent.setup()
  const onSaved = vi.fn()
  const onClose = vi.fn()
  vi.mocked(endEmployeeEmployment).mockResolvedValue({
    ok: true,
    value: { endDate: '2026-11-20', scheduled: false },
  })
  render(
    <EndEmploymentSheet
      open
      userId="worker"
      name="ტესტის თანამშრომელი"
      today="2026-11-27"
      revision={3}
      period={{ id: 'period', startDate: '2026-01-01', endDate: '2026-11-20' }}
      onClose={onClose}
      onSaved={onSaved}
    />,
  )
  const sheet = await screen.findByRole('dialog', {
    name: 'დასაქმების დასრულება',
  })
  const confirm = within(sheet).getByRole('button', {
    name: 'დასაქმების დასრულება',
  })
  await user.click(confirm)
  expect(await within(sheet).findByText(/მინიმუმ 5 სიმბოლოს/)).toBeVisible()
  expect(endEmployeeEmployment).not.toHaveBeenCalled()
  const reason = within(sheet).getByRole('textbox', {
    name: 'დასრულების მიზეზი',
  })
  await user.type(reason, 'თანამშრომლის მოთხოვნით.')
  await user.click(confirm)
  expect(endEmployeeEmployment).toHaveBeenCalledWith({
    data: {
      userId: 'worker',
      expectedRevision: 3,
      startDate: '2026-01-01',
      endDate: '2026-11-20',
      reason: 'თანამშრომლის მოთხოვნით.',
    },
  })
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSaved).toHaveBeenCalledOnce()
})

it('allows selecting a future last day and shows the scheduled cutoff before confirmation', async () => {
  const user = userEvent.setup()
  const onSaved = vi.fn()
  vi.mocked(endEmployeeEmployment)
    .mockClear()
    .mockResolvedValue({
      ok: true,
      value: { endDate: '2026-11-28', scheduled: true },
    })
  render(
    <EndEmploymentSheet
      open
      userId="worker"
      name="ტესტის თანამშრომელი"
      today="2026-11-27"
      revision={3}
      period={{ id: 'period', startDate: '2026-01-01', endDate: null }}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  const sheet = await screen.findByRole('dialog', {
    name: 'დასაქმების დასრულება',
  })
  await user.click(
    within(sheet).getByRole('button', { name: 'ბოლო სამუშაო დღე' }),
  )
  await user.click(
    await screen.findByRole('button', { name: /28 ნოემბერი 2026/ }),
  )
  expect(
    within(sheet).getByText(/მომდევნო დღეს, კომპანიის დროით 00:00-ზე/),
  ).toBeVisible()
  await user.type(
    within(sheet).getByRole('textbox', { name: 'დასრულების მიზეზი' }),
    'თანამშრომლის მოთხოვნით.',
  )
  await user.click(
    within(sheet).getByRole('button', { name: 'დასრულების დაგეგმვა' }),
  )
  expect(endEmployeeEmployment).toHaveBeenCalledWith({
    data: expect.objectContaining({
      endDate: '2026-11-28',
      expectedRevision: 3,
    }),
  })
  expect(onSaved).toHaveBeenCalledOnce()
})
