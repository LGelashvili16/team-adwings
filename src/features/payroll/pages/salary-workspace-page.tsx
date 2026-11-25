import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconArrowLeft, IconEdit, IconAlertCircle } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { accountInitials } from '#/features/access/access.presentation'
import { hasPermission } from '#/lib/authorization/permissions'
import { employeeSalaryQuery } from '../salary.queries'
import { SalarySummary } from '../components/salary-summary'
import { SalaryHistory } from '../components/salary-history'
import { SalaryEditor } from '../components/salary-editor'
import type { Actor } from '#/lib/authorization/actor'
import type { SalaryEmployee } from '../salary.types'

const employeeRoute = getRouteApi('/_authenticated/manage/payroll/$userId')
export function EmployeeSalaryPage() {
  const { actor } = employeeRoute.useRouteContext()
  const { userId } = employeeRoute.useParams()
  const { page } = employeeRoute.useSearch()
  return (
    <SalaryWorkspace key={userId} actor={actor} userId={userId} page={page} />
  )
}
export function SalaryWorkspace({
  actor,
  userId,
  page,
}: {
  actor: Actor
  userId: string
  page: number
}) {
  const query = useQuery(employeeSalaryQuery(actor.id, userId, page))
  const [draft, setDraft] = useState<{
    key: number
    targets: SalaryEmployee[]
  } | null>(null)
  const [open, setOpen] = useState(false)
  const view = query.data?.ok ? query.data.value : null
  const canEdit =
    actor.id !== userId && hasPermission(actor, 'payroll.terms.manage')
  const header = (
    <header className="relative flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {view ? (
          <Avatar
            className="size-12 shrink-0 ring-1 ring-border sm:size-14"
            aria-hidden="true"
          >
            <AvatarFallback className="bg-accent text-lg font-semibold text-accent-foreground">
              {accountInitials(view.employee.name)}
            </AvatarFallback>
          </Avatar>
        ) : null}
        <div className="min-w-0">
          <h1 className="wrap-anywhere text-2xl font-semibold tracking-tight">
            {view?.employee.name ?? 'თანამშრომლის ხელფასი'}
          </h1>
          {view?.employee.jobTitle ? (
            <p className="mt-1 wrap-anywhere text-sm text-muted-foreground">
              {view.employee.jobTitle}
            </p>
          ) : null}
        </div>
      </div>
      {canEdit && view ? (
        <Button
          className="max-sm:w-full"
          onClick={() => {
            setDraft({ key: (draft?.key ?? 0) + 1, targets: [view.employee] })
            setOpen(true)
          }}
        >
          <IconEdit data-icon="inline-start" aria-hidden="true" />
          ხელფასის განსაზღვრა
        </Button>
      ) : null}
    </header>
  )
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        nativeButton={false}
        role="link"
        render={<Link to="/manage/payroll" />}
      >
        <IconArrowLeft data-icon="inline-start" aria-hidden="true" />
        თანამშრომლების ხელფასები
      </Button>
      <Card className="rounded-2xl bg-linear-to-br from-muted/60 via-card to-card px-4 py-5 sm:px-6">
        {header}
      </Card>
      {query.isPending ? (
        <div role="status" aria-busy="true" aria-label="ხელფასი იტვირთება">
          <div aria-hidden="true" className="flex flex-col gap-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Skeleton className="h-56 rounded-xl" />
              <Skeleton className="h-56 rounded-xl" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      ) : !view ? (
        <Alert variant="destructive">
          <IconAlertCircle aria-hidden="true" />
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : 'ხელფასი ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <SalarySummary employee={view.employee} />
          {userId === actor.id ? (
            <p className="text-sm text-muted-foreground">
              საკუთარი ხელფასის შესაცვლელად მიმართეთ სხვა უფლებამოსილ პირს.
            </p>
          ) : null}
          <SalaryHistory
            history={view.history}
            timezone={view.timezone}
            pagination={
              view.total > view.pageSize || page > 1 ? (
                <DataPagination
                  page={page}
                  total={view.total}
                  pageSize={view.pageSize}
                  renderLink={(next) => (
                    <Link
                      to="/manage/payroll/$userId"
                      params={{ userId }}
                      search={{ page: next }}
                      resetScroll={false}
                    />
                  )}
                />
              ) : undefined
            }
          />
          {draft ? (
            <SalaryEditor
              key={draft.key}
              actorId={actor.id}
              defaultAmountBasis={view.defaultAmountBasis}
              targets={draft.targets}
              today={view.today}
              open={open}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
