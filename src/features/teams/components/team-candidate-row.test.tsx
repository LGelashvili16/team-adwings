import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TeamCandidateRow } from './team-candidate-row'

const person = {
  userId: 'worker',
  name: 'ანა',
  jobTitle: 'მემონტაჟე',
  teamId: 'previous-team',
  teamName: 'ბეტა',
}

it('requires confirmation before adding a member from another team and supports cancelling', async () => {
  const onAdd = vi.fn()
  render(
    <ul>
      <TeamCandidateRow
        person={person}
        currentTeamId="current-team"
        picked={false}
        disabled={false}
        onAdd={onAdd}
      />
    </ul>,
  )
  const user = userEvent.setup()
  expect(screen.getByText('ბეტა')).toHaveAttribute('data-variant', 'orange')
  const add = screen.getByRole('button', { name: 'დამატება' })
  await user.click(add)
  const dialog = await screen.findByRole('dialog', {
    name: 'თანამშრომლის გადაყვანა',
  })
  expect(dialog).toHaveTextContent('ანა უკვე არის გუნდში „ბეტა“')
  expect(dialog).toHaveTextContent('გუნდის შენახვისას')
  expect(onAdd).not.toHaveBeenCalled()
  await user.click(within(dialog).getByRole('button', { name: 'გაუქმება' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  expect(onAdd).not.toHaveBeenCalled()
  await waitFor(() => expect(add).toHaveFocus())
  await user.click(add)
  await user.click(screen.getByRole('button', { name: 'დადასტურება' }))
  expect(onAdd).toHaveBeenCalledExactlyOnceWith(person)
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
})

it.each([null, 'previous-team'])(
  'adds directly when there is no transfer for membership %s',
  async (teamId) => {
    const onAdd = vi.fn()
    const candidate = { ...person, teamId, teamName: teamId ? 'ბეტა' : null }
    render(
      <ul>
        <TeamCandidateRow
          person={candidate}
          currentTeamId="previous-team"
          picked={false}
          disabled={false}
          onAdd={onAdd}
        />
      </ul>,
    )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'დამატება' }))
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(candidate)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    if (teamId)
      expect(screen.getByText('ბეტა')).toHaveAttribute(
        'data-variant',
        'outline',
      )
  },
)

it('prevents adding already selected employees', () => {
  render(
    <ul>
      <TeamCandidateRow
        person={person}
        currentTeamId={null}
        picked
        disabled={false}
        onAdd={vi.fn()}
      />
    </ul>,
  )
  expect(screen.getByRole('button', { name: 'არჩეულია' })).toBeDisabled()
})
