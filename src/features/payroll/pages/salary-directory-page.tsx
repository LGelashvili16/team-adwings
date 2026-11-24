import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconWallet, IconUsers, IconClock, IconEdit } from '@tabler/icons-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { hasPermission } from '#/lib/authorization/permissions'
import { salaryDirectoryQuery } from '../salary.queries'
import { PayrollNavigation } from '../components/payroll-navigation'
import { SalaryDirectoryFilters } from '../components/salary-directory-filters'
import { SalaryDirectoryTable } from '../components/salary-directory-table'
import { SalaryEditor } from '../components/salary-editor'
import type { SalaryEmployee } from '../salary.types'
import type { Actor } from '#/lib/authorization/actor'
import type { SalaryDirectorySearch } from '../salary.schemas'

const route = getRouteApi('/_authenticated/manage/payroll/')
export function SalaryDirectoryPage() {
  const { actor } = route.useRouteContext()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">ხელფასები</h1>
      <PayrollNavigation actor={actor} active="employees" />
      <SalaryDirectoryFilters
        key={JSON.stringify(search)}
        search={search}
        onChange={(next) => {
          void navigate({ search: next, replace: true })
        }}
      />
      <SalaryDirectoryResults
        key={JSON.stringify(search)}
        actor={actor}
        search={search}
      />
    </div>
  )
}
function SalaryDirectoryResults({
  actor,
  search,
}: {
  actor: Actor
  search: SalaryDirectorySearch
}) {
  const query = useQuery(salaryDirectoryQuery(actor.id, search))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<{
    key: number
    targets: SalaryEmployee[]
  } | null>(null)
  const [open, setOpen] = useState(false)
  const canEdit = hasPermission(actor, 'payroll.terms.manage')
  const view = query.data?.ok ? query.data.value : null
  if (query.isPending)
    return (
      <div role="status" aria-busy="true" aria-label="ხელფასები იტვირთება">
        <div aria-hidden="true" className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    )
  if (!view)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {query.data && !query.data.ok
            ? query.data.message
            : 'ხელფასები ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
        </AlertDescription>
      </Alert>
    )
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: 'თვიური ხელფასი',
            value: view.counts.monthly,
            icon: IconWallet,
          },
          {
            label: 'საათობრივი ხელფასი',
            value: view.counts.hourly,
            icon: IconClock,
          },
          {
            label: 'განსასაზღვრი ხელფასი',
            value: view.counts.unconfigured,
            icon: IconUsers,
          },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4">
              <span className="flex size-10 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Alert variant="info">
        <AlertDescription>
          აქ ჩანს შეთანხმებული ხელფასები. თვის დარიცხვები, ბონუსები, პრემიები და
          დაქვითვების გამოთვლა ჯერ არ არის ჩართული.
        </AlertDescription>
      </Alert>
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            არჩეულია: {selected.size}
          </p>
          <Button
            disabled={!selected.size}
            onClick={() => {
              setDraft({
                key: (draft?.key ?? 0) + 1,
                targets: view.records.filter((record) =>
                  selected.has(record.userId),
                ),
              })
              setOpen(true)
            }}
          >
            <IconEdit data-icon="inline-start" aria-hidden="true" />
            ხელფასის განსაზღვრა
          </Button>
        </div>
      ) : null}
      {view.records.length ? (
        <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
          <SalaryDirectoryTable
            records={view.records}
            actorId={actor.id}
            canEdit={canEdit}
            selected={selected}
            onSelect={(ids, checked) =>
              setSelected((previous) => {
                const next = new Set(previous)
                for (const id of ids) {
                  if (checked) next.add(id)
                  else next.delete(id)
                }
                return next
              })
            }
          />
        </div>
      ) : (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>თანამშრომლები ვერ მოიძებნა</EmptyTitle>
            <p className="text-sm text-muted-foreground">
              შეცვალეთ ძიება ან ფილტრები.
            </p>
          </EmptyHeader>
        </Empty>
      )}
      <DataPagination
        page={search.page}
        total={view.total}
        pageSize={view.pageSize}
        renderLink={(page) => (
          <Link
            to="/manage/payroll"
            search={{ ...search, page }}
            resetScroll={false}
          />
        )}
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
          onSaved={() => setSelected(new Set())}
        />
      ) : null}
    </>
  )
}
