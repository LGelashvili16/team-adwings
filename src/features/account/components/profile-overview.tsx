import { useQuery } from '@tanstack/react-query'
import { IconAt, IconBriefcase, IconMail } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import { Separator } from '#/components/ui/separator'
import { Skeleton } from '#/components/ui/skeleton'
import { roleLabels } from '#/lib/authorization/permissions'
import { ownProfileQueryOptions } from '../account.queries'
import { OwnPhoneForm } from './own-phone-form'
import type { Actor } from '#/lib/authorization/actor'

const notProvided = 'არ არის მითითებული'

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join('')
    .toUpperCase()
}

export function ProfileOverview({ actor }: { actor: Actor }) {
  const profile = useQuery(ownProfileQueryOptions(actor.id))
  const details = [
    {
      label: 'მომხმარებლის სახელი',
      value: profile.data?.code,
      icon: IconAt,
      muted: false,
    },
    {
      label: 'ელფოსტა',
      value: actor.email ?? notProvided,
      icon: IconMail,
      muted: !actor.email,
    },
    {
      label: 'თანამდებობა',
      value: profile.data ? (profile.data.jobTitle ?? notProvided) : undefined,
      icon: IconBriefcase,
      muted: Boolean(profile.data && !profile.data.jobTitle),
    },
  ]

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-6 pt-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="size-14 border border-border/70 bg-muted">
            <AvatarFallback className="text-base font-semibold tracking-tight">
              {initials(actor.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-lg font-semibold tracking-tight">
              {actor.name}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {actor.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {roleLabels[role]}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        <dl className="grid gap-3 sm:grid-cols-3">
          {details.map(({ label, value, icon: Icon, muted }) => (
            <div
              key={label}
              className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-3"
            >
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {label}
              </dt>
              <dd
                className={
                  muted
                    ? 'truncate text-sm text-muted-foreground'
                    : 'truncate text-sm font-medium text-foreground'
                }
              >
                {value ?? (
                  <Skeleton className="mt-0.5 h-4 w-28" aria-hidden="true" />
                )}
              </dd>
            </div>
          ))}
        </dl>

        <Separator />

        <div className="max-w-md">
          {profile.isPending ? (
            <div role="status" aria-busy="true" aria-label="პროფილი იტვირთება">
              <Skeleton className="h-10 w-full max-w-sm" aria-hidden="true" />
            </div>
          ) : profile.data ? (
            <OwnPhoneForm actorId={actor.id} phone={profile.data.phone} />
          ) : (
            <Alert>
              <AlertDescription>
                პროფილის ჩატვირთვა ვერ მოხერხდა. განაახლეთ გვერდი.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
