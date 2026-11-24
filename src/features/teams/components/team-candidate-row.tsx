import { useState } from 'react'
import { IconCheck, IconPlus } from '@tabler/icons-react'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '#/components/ui/dialog'
import type { TeamCandidate } from './team-editor'

export function TeamCandidateRow({
  person,
  currentTeamId,
  picked,
  disabled,
  onAdd,
}: {
  person: TeamCandidate & { jobTitle: string | null }
  currentTeamId: string | null
  picked: boolean
  disabled: boolean
  onAdd: (person: TeamCandidate) => void
}) {
  const [open, setOpen] = useState(false)
  const transfer = person.teamId !== null && person.teamId !== currentTeamId
  const addButton = (
    <Button
      type="button"
      variant={picked ? 'secondary' : 'outline'}
      size="sm"
      disabled={disabled || picked}
      onClick={transfer ? undefined : () => onAdd(person)}
    >
      {picked ? (
        <IconCheck aria-hidden="true" />
      ) : (
        <IconPlus aria-hidden="true" />
      )}
      {picked ? 'არჩეულია' : 'დამატება'}
    </Button>
  )
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <Avatar aria-hidden="true">
        <AvatarFallback>
          {person.name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{person.name}</p>
        <p className="text-sm text-muted-foreground break-words">
          {person.jobTitle || 'თანამდებობა მითითებული არ არის'}
        </p>
        {person.teamName && (
          <Badge variant={transfer ? 'orange' : 'outline'} className="mt-1">
            {person.teamName}
          </Badge>
        )}
      </div>
      {transfer ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={addButton} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>თანამშრომლის გადაყვანა</DialogTitle>
              <DialogDescription>
                {person.name} უკვე არის გუნდში „{person.teamName}“. გუნდის
                შენახვისას თანამშრომელი დატოვებს წინა გუნდს და შეუერთდება ამ
                გუნდს.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                გაუქმება
              </DialogClose>
              <Button
                type="button"
                disabled={disabled || picked}
                onClick={() => {
                  onAdd(person)
                  setOpen(false)
                }}
              >
                დადასტურება
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        addButton
      )}
    </li>
  )
}
