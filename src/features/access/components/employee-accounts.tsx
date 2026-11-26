import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, getRouteApi } from '@tanstack/react-router'
import { IconUsers, IconUserPlus } from '@tabler/icons-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { DataPagination } from '#/components/common/data-pagination'
import { AccountDirectorySearch } from '#/components/common/account-directory-search'
import { EmploymentDirectoryFilter } from '#/features/employees/components/employment-directory-filter'
import { Badge } from '#/components/ui/badge'
import { Skeleton } from '#/components/ui/skeleton'
import { Alert, AlertDescription } from '#/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet'
import {
  hasEveryPermission,
  hasPermission,
} from '#/lib/authorization/permissions'
import { employeeAccountsQuery } from '../access.queries'
import { ProvisionAccountForm } from './provision-account-form'
import { AccountCodeDialog } from './account-code-dialog'
import { EmployeeAccountsTable } from './employee-accounts-table'
import type { IssuedAccountCode } from '../access.types'
import type { Actor } from '#/lib/authorization/actor'
import type { EmployeeAccountSearch } from '../access.schemas'

const route = getRouteApi('/_authenticated/manage/employees/')

export function EmployeeAccounts({
  search,
  actor,
}: {
  search: EmployeeAccountSearch
  actor: Actor
}) {
  const navigate = route.useNavigate()
  const query = useQuery(employeeAccountsQuery(actor.id, search))
  const [issuedCode, setIssuedCode] = useState<IssuedAccountCode | null>(null)
  const [creating, setCreating] = useState(false)
  const [creatingBusy, setCreatingBusy] = useState(false)
  const data = query.data?.ok ? query.data.value : null
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">თანამშრომლები</h1>
        <Sheet
          open={creating}
          onOpenChange={(open) => {
            if (!creatingBusy) setCreating(open)
          }}
        >
          <SheetTrigger render={<Button />}>
            <IconUserPlus data-icon="inline-start" aria-hidden="true" />
            თანამშრომლის დამატება
          </SheetTrigger>
          <SheetContent
            side="right"
            className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
            showCloseButton={!creatingBusy}
          >
            <SheetHeader className="border-b">
              <SheetTitle>ახალი თანამშრომელი</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <ProvisionAccountForm
                framed={false}
                onCode={(value) => {
                  setCreating(false)
                  setIssuedCode(value)
                }}
                onPendingChange={setCreatingBusy}
                canAssignAdmin={hasEveryPermission(actor, [
                  'admin.access',
                  'users.manage',
                  'roles.manage',
                ])}
                canConfigureSchedule={hasPermission(
                  actor,
                  'attendance.configure',
                )}
                canSetEmploymentDate={hasPermission(
                  actor,
                  'employees.employment.manage',
                )}
              />
            </div>
          </SheetContent>
        </Sheet>
      </header>
      <div className="min-w-0">
        <Card
          aria-label="თანამშრომლების ანგარიშების სია"
          className="min-w-0 gap-0 rounded-xl border pb-0 ring-0"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b pb-4">
            <CardTitle className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <IconUsers className="size-5" aria-hidden="true" />
              </span>
              <h2>ანგარიშები</h2>
            </CardTitle>
            {data ? <Badge variant="secondary">სულ {data.total}</Badge> : null}
          </CardHeader>
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
            <AccountDirectorySearch
              search={search}
              showAccountState={false}
              onChange={(next, replace) => {
                void navigate({
                  search: (previous) => ({ ...previous, q: next.q, page: 1 }),
                  replace,
                })
              }}
            />
            <EmploymentDirectoryFilter
              value={search.employment}
              onChange={(employment) => {
                void navigate({
                  search: (previous) => ({ ...previous, employment, page: 1 }),
                })
              }}
            />
          </div>
          <CardContent className="px-0">
            {query.isPending ? (
              <div
                role="status"
                aria-busy="true"
                aria-label="ანგარიშები იტვირთება"
              >
                <div aria-hidden="true" className="flex flex-col gap-3 p-5">
                  {[1, 2, 3].map((key) => (
                    <Skeleton key={key} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
              </div>
            ) : query.isError || !data ? (
              <Alert className="mx-5 my-5 w-auto">
                <AlertDescription>
                  {query.data && !query.data.ok
                    ? query.data.message
                    : 'ანგარიშების ჩატვირთვა ვერ მოხერხდა. გადაამოწმეთ თქვენი წვდომა.'}
                </AlertDescription>
              </Alert>
            ) : !data.records.length ? (
              <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-sm text-muted-foreground">
                <IconUsers className="size-8" aria-hidden="true" />
                <p>
                  {search.q
                    ? 'ძიების შესაბამისი თანამშრომელი ვერ მოიძებნა.'
                    : search.employment === 'former' && search.page === 1
                      ? 'ყოფილი თანამშრომლები ჯერ არ არიან.'
                      : 'ამ გვერდზე თანამშრომლის ანგარიშები არ არის.'}
                </p>
              </div>
            ) : (
              <EmployeeAccountsTable
                records={data.records}
                actorId={actor.id}
              />
            )}
          </CardContent>
          {data ? (
            <div className="border-t px-4 py-3">
              <DataPagination
                page={search.page}
                total={data.total}
                pageSize={20}
                renderLink={(nextPage) => (
                  <Link
                    to="/manage/employees"
                    search={{ ...search, page: nextPage }}
                  />
                )}
              />
            </div>
          ) : null}
        </Card>
      </div>
      {issuedCode ? (
        <AccountCodeDialog
          value={issuedCode}
          onClose={() => setIssuedCode(null)}
        />
      ) : null}
    </div>
  )
}
