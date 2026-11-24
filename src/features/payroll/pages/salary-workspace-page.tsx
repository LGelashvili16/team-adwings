import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconArrowLeft, IconEdit } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { hasPermission } from '#/lib/authorization/permissions'
import { employeeSalaryQuery, mySalaryQuery } from '../salary.queries'
import { SalarySummary } from '../components/salary-summary'
import { SalaryHistory } from '../components/salary-history'
import { SalaryEditor } from '../components/salary-editor'
import type { Actor } from '#/lib/authorization/actor'
import type { SalaryEmployee } from '../salary.types'

const personalRoute = getRouteApi('/_authenticated/payroll')
const employeeRoute = getRouteApi('/_authenticated/manage/payroll/$userId')
export function MySalaryPage() {
  const { actor } = personalRoute.useRouteContext()
  const { page } = personalRoute.useSearch()
  return <SalaryWorkspace key={actor.id} actor={actor} page={page} />
}
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
  userId?: string
  page: number
}) {
  const query = useQuery(
    userId
      ? employeeSalaryQuery(actor.id, userId, page)
      : mySalaryQuery(actor.id, page),
  )
  const [draft, setDraft] = useState<{
    key: number
    targets: SalaryEmployee[]
  } | null>(null)
  const [open, setOpen] = useState(false)
  const view = query.data?.ok ? query.data.value : null
  const canEdit =
    !!userId &&
    actor.id !== userId &&
    hasPermission(actor, 'payroll.terms.manage')
  return (
    <div className="flex min-w-0 max-w-6xl flex-col gap-6">
      {userId ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          nativeButton={false}
          role="link"
          render={<Link to="/manage/payroll" />}
        >
          <IconArrowLeft data-icon="inline-start" aria-hidden="true" />
          ხელფასები
        </Button>
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">
            {userId
              ? (view?.employee.name ?? 'თანამშრომლის ხელფასი')
              : 'ხელფასი'}
          </h1>
          {userId && view?.employee.jobTitle ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {view.employee.jobTitle}
            </p>
          ) : null}
        </div>
        {canEdit && view ? (
          <Button
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
      {query.isPending ? (
        <div role="status" aria-busy="true" aria-label="ხელფასი იტვირთება">
          <div aria-hidden="true" className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-52 rounded-xl" />
              <Skeleton className="h-52 rounded-xl" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      ) : !view ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : 'ხელფასი ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <SalarySummary employee={view.employee} />
          <Alert variant="info">
            <AlertDescription>
              თვის დარიცხვებისა და სახელფასო უწყისის გამოთვლა ჯერ არ არის
              ჩართული. აქ ნაჩვენებია შეთანხმებული ხელფასი და ცვლილებების
              ისტორია.
            </AlertDescription>
          </Alert>
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
                  renderLink={(next) =>
                    userId ? (
                      <Link
                        to="/manage/payroll/$userId"
                        params={{ userId }}
                        search={{ page: next }}
                        resetScroll={false}
                      />
                    ) : (
                      <Link
                        to="/payroll"
                        search={{ page: next }}
                        resetScroll={false}
                      />
                    )
                  }
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
