import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { JobsFilters } from './jobs-filters'
import { jobSearchSchema } from '../jobs.schemas'

vi.mock('#/hooks/use-mobile', () => ({ useIsMobile: () => false }))

describe('job URL filters', () => {
  it.each([
    ['დღეს და მომავალი ვადები', 'upcoming'],
    ['ვადაგადაცილებული', 'overdue'],
  ])(
    'shows %s in deadline order and restores the range on reset',
    async (label, deadlineState) => {
      const onChange = vi.fn()
      const search = jobSearchSchema.parse({ page: 3, kind: 'measurement' })
      render(<JobsFilters search={search} onChange={onChange} />)
      await userEvent.click(
        screen.getByRole('combobox', { name: 'დალაგება და ვადა' }),
      )
      await userEvent.click(await screen.findByRole('option', { name: label }))
      expect(onChange).toHaveBeenCalledWith(
        { ...search, page: 1, deadlineState, sort: 'deadline_asc' },
        false,
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'ფილტრების გასუფთავება' }),
      )
      expect(onChange).toHaveBeenLastCalledWith(jobSearchSchema.parse({}))
    },
  )
  it('restores the creation range when switching from overdue jobs to a sort choice', async () => {
    const onChange = vi.fn()
    const search = jobSearchSchema.parse({
      deadlineState: 'overdue',
      from: '2026-09-01',
      to: '2026-09-30',
    })
    render(<JobsFilters search={search} onChange={onChange} />)
    const select = screen.getByRole('combobox', { name: 'დალაგება და ვადა' })
    expect(select).toHaveTextContent('ვადაგადაცილებული')
    expect(
      screen.queryByRole('button', { name: /სამუშაოების შექმნის პერიოდი/ }),
    ).not.toBeInTheDocument()
    await userEvent.click(select)
    await userEvent.click(
      await screen.findByRole('option', { name: 'ჯერ ახლო ვადა' }),
    )
    expect(onChange).toHaveBeenCalledWith(
      { ...search, deadlineState: 'all', sort: 'deadline_asc' },
      false,
    )
    expect(
      screen.getByRole('button', { name: /სამუშაოების შექმნის პერიოდი/ }),
    ).toBeVisible()
  })
  it('offers related-to-me separately from assigned jobs and preserves other filters', async () => {
    const onChange = vi.fn()
    const search = jobSearchSchema.parse({ page: 3, kind: 'measurement' })
    render(<JobsFilters search={search} onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'სამუშაოები' }))
    expect(
      await screen.findByRole('option', { name: 'ჩემზე მინიჭებული' }),
    ).toBeVisible()
    await userEvent.click(
      screen.getByRole('option', { name: 'ჩემთან დაკავშირებული' }),
    )
    expect(onChange).toHaveBeenCalledWith(
      { ...search, page: 1, scope: 'related' },
      false,
    )
  })
  it('debounces text changes, preserves other filters and resets the page', async () => {
    const onChange = vi.fn()
    const search = jobSearchSchema.parse({ page: 3, kind: 'measurement' })
    render(<JobsFilters search={search} onChange={onChange} />)
    await userEvent.type(
      screen.getByRole('textbox', { name: 'სამუშაოს ძიება' }),
      'ვაკე',
    )
    expect(onChange).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        { ...search, page: 1, q: 'ვაკე' },
        true,
      ),
    )
    expect(onChange).toHaveBeenCalledTimes(1)
  })
  it('cancels a pending draft when Back/Forward restores URL state', async () => {
    const onChange = vi.fn()
    const search = jobSearchSchema.parse({ q: 'ვაკე' })
    const { rerender } = render(
      <JobsFilters search={search} onChange={onChange} />,
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: 'სამუშაოს ძიება' }),
      ' ახალი',
    )
    rerender(
      <JobsFilters
        search={{ ...search, q: 'ბათუმი', page: 2 }}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'სამუშაოს ძიება' })).toHaveValue(
      'ბათუმი',
    )
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(onChange).not.toHaveBeenCalled()
  })
  it('applies category changes immediately and rejects overlong search', async () => {
    const onChange = vi.fn()
    const search = jobSearchSchema.parse({ page: 4 })
    render(<JobsFilters search={search} onChange={onChange} />)
    await userEvent.click(
      screen.getByRole('combobox', { name: 'სამუშაოს ტიპი' }),
    )
    await userEvent.click(await screen.findByRole('option', { name: 'აზომვა' }))
    expect(onChange).toHaveBeenCalledWith(
      { ...search, page: 1, kind: 'measurement' },
      false,
    )
    onChange.mockClear()
    await userEvent.clear(
      screen.getByRole('textbox', { name: 'სამუშაოს ძიება' }),
    )
    await userEvent.paste('ა'.repeat(101))
    await waitFor(() =>
      expect(
        screen.getByText('საძიებო ტექსტი ძალიან გრძელია.'),
      ).toBeInTheDocument(),
    )
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(onChange).not.toHaveBeenCalled()
  })
})
