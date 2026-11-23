import { IconAt, IconPencil } from '@tabler/icons-react'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { parseRoles, roleLabels } from '#/lib/authorization/permissions'
import { accountInitials, accountStatus } from '../access.presentation'
import { accountActionContent } from './account-action-content'
import type { AccountAction } from './account-action-content'
import type { EmployeeAccountRecord } from '../access.types'

export function UserProfileHeader({
  record,
  canEdit,
  onEdit,
  actions,
  onAction,
}: {
  record: EmployeeAccountRecord
  canEdit: boolean
  onEdit: () => void
  actions: Array<AccountAction>
  onAction: (action: AccountAction) => void
}) {
  const status = accountStatus(record)
  return (
    <Card className="relative overflow-hidden rounded-2xl py-4 sm:py-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-primary/6 to-transparent dark:from-primary/10"
      />
      <CardContent className="relative px-4 sm:px-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3.5 sm:gap-4">
            <Avatar
              className="size-14 shrink-0 ring-2 ring-border/70 ring-offset-2 ring-offset-card sm:size-16"
              aria-hidden="true"
            >
              <AvatarFallback className="bg-badge-blue text-xl font-semibold text-badge-blue-foreground sm:text-2xl">
                {accountInitials(record.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={status.variant}>{status.label}</Badge>
                {parseRoles(record.roles).map((role) => (
                  <Badge
                    key={role}
                    variant="outline"
                    className="h-auto max-w-full whitespace-normal bg-background/60"
                  >
                    {roleLabels[role]}
                  </Badge>
                ))}
              </div>
              <h1 className="wrap-anywhere text-xl font-semibold tracking-tight sm:text-2xl">
                {record.name}
              </h1>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                {record.code ? (
                  <>
                    <IconAt className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="wrap-anywhere font-mono">
                      {record.code}
                    </span>
                  </>
                ) : (
                  <span>მომხმარებლის სახელი ჯერ არ არის არჩეული</span>
                )}
              </p>
            </div>
          </div>
          {canEdit || actions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
              {canEdit ? (
                <Button onClick={onEdit} className="max-sm:flex-1">
                  <IconPencil data-icon="inline-start" aria-hidden="true" />
                  რედაქტირება
                </Button>
              ) : null}
              {actions.map((action) => {
                const content = accountActionContent[action]
                const Icon = content.icon
                const label =
                  action === 'issue_activation' || action === 'issue_reset'
                    ? content.label
                    : content.confirmLabel
                return (
                  <Button
                    key={action}
                    variant={content.destructive ? 'destructive' : 'outline'}
                    depth="raised"
                    className="max-sm:flex-1"
                    onClick={() => onAction(action)}
                  >
                    <Icon data-icon="inline-start" aria-hidden="true" />
                    {label}
                  </Button>
                )
              })}
            </div>
          ) : null}
        </header>
      </CardContent>
    </Card>
  )
}
