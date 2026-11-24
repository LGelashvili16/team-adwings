import { useState } from 'react'
import { IconGps, IconUser } from '@tabler/icons-react'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { canAssignJobs } from '../jobs.rules'
import { JobAssignmentEditor } from './job-assignment-editor'
import type { Actor } from '#/lib/authorization/actor'
import type { JobDetail } from '../jobs.types'

export function JobAssignmentsCard({
  actor,
  job,
}: {
  actor: Actor
  job: JobDetail
}) {
  const [editor, setEditor] = useState<{ job: JobDetail; key: number } | null>(
    null,
  )
  const [open, setOpen] = useState(false)
  const editable =
    canAssignJobs(actor) && !['completed', 'rejected'].includes(job.status)
  const { employees, team, gpsDevice } = job.assignments
  return (
    <>
      <Card size="sm" className="shrink-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-1">
          <CardTitle className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <IconUser
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            შემსრულებლები<Badge variant="secondary">{employees.length}</Badge>
          </CardTitle>
          {editable ? (
            <Button
              type="button"
              variant="outline"
              depth="raised"
              size="sm"
              className="px-2"
              aria-label="შემსრულებლების დამატება"
              onClick={() => {
                setEditor((current) => ({ job, key: (current?.key ?? 0) + 1 }))
                setOpen(true)
              }}
            >
              {employees.length || team || gpsDevice ? 'შეცვლა' : 'დამატება'}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {employees.length ? (
            <ul
              className="flex max-h-64 flex-col gap-3 overflow-y-auto"
              aria-label="დამატებული თანამშრომლები"
            >
              {employees.map((person) => (
                <li key={person.id} className="flex items-center gap-3">
                  <Avatar aria-hidden="true">
                    <AvatarFallback>
                      {person.name.trim().slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">
                      {person.name}
                    </p>
                    {person.jobTitle ? (
                      <p className="text-xs break-words text-muted-foreground">
                        {person.jobTitle}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              თანამშრომლები ჯერ არ არიან დამატებული.
            </p>
          )}
          <dl className="flex flex-col gap-3 border-t pt-3 text-sm">
            <div className="flex items-start gap-2">
              <IconGps
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">
                  GPS მოწყობილობა
                </dt>
                <dd className="break-words">
                  {gpsDevice?.name ?? 'არ არის მითითებული'}
                </dd>
              </div>
            </div>
          </dl>
        </CardContent>
      </Card>
      {editor ? (
        <JobAssignmentEditor
          key={editor.key}
          actor={actor}
          job={editor.job}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  )
}
