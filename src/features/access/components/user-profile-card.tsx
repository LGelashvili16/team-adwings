import {
  IconBriefcase,
  IconMail,
  IconPhone,
  IconUser,
} from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import type { EmployeeAccountRecord } from '../access.types'

const notProvided = 'არ არის მითითებული'

export function UserProfileCard({ record }: { record: EmployeeAccountRecord }) {
  const details = [
    {
      label: 'ელფოსტა',
      value: record.contactEmail,
      href: record.contactEmail ? `mailto:${record.contactEmail}` : undefined,
      icon: IconMail,
    },
    {
      label: 'ტელეფონი',
      value: record.phone,
      href: record.phone ? `tel:${record.phone}` : undefined,
      icon: IconPhone,
    },
    {
      label: 'თანამდებობა',
      value: record.jobTitle,
      href: undefined,
      icon: IconBriefcase,
    },
  ]
  return (
    <Card className="rounded-2xl py-4 sm:py-5">
      <CardHeader className="px-4 sm:px-5">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/70 text-muted-foreground">
            <IconUser className="size-4" aria-hidden="true" />
          </span>
          <h2>პირადი მონაცემები</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-5">
        <dl className="grid gap-2.5 text-sm sm:grid-cols-3">
          {details.map(({ label, value, href, icon: Icon }) => (
            <div
              key={label}
              className="min-w-0 rounded-xl border border-border/60 bg-muted/25 px-3.5 py-2.5"
            >
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {label}
              </dt>
              <dd className="mt-2 wrap-anywhere leading-6">
                {value ? (
                  href ? (
                    <a
                      href={href}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {value}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">{value}</span>
                  )
                ) : (
                  <span className="text-muted-foreground">{notProvided}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
