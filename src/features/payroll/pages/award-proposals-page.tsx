import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconPlus } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { hasPermission } from '#/lib/authorization/permissions'
import { PayrollNavigation } from '../components/payroll-navigation'
import { AwardProposalEditor } from '../components/award-proposal-editor'
import { AwardPoolEditor } from '../components/award-pool-editor'
import { AwardProposalFilters } from '../components/award-proposal-filters'
import { AwardProposalsTable } from '../components/award-proposal-tables'
import { awardsQuery } from '../award-proposals.queries'

const route = getRouteApi('/_authenticated/manage/payroll/awards/')
export function AwardProposalsPage() {
  const { actor } = route.useRouteContext(),
    search = route.useSearch(),
    navigate = route.useNavigate()
  const query = useQuery(awardsQuery(actor.id, search)),
    view = query.data?.ok ? query.data.value : null
  const [draft, setDraft] = useState<{
      key: number
      today: string
      kind: 'individual' | 'pool'
    } | null>(null),
    [open, setOpen] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          წახალისების განაცხადები
        </h1>
        {hasPermission(actor, 'payroll.awards.propose') ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!view}
              onClick={() => {
                if (view) {
                  setDraft((previous) => ({
                    key: (previous?.key ?? 0) + 1,
                    today: view.today,
                    kind: 'pool',
                  }))
                  setOpen(true)
                }
              }}
            >
              საერთო ფონდი
            </Button>
            <Button
              disabled={!view}
              onClick={() => {
                if (view) {
                  setDraft((previous) => ({
                    key: (previous?.key ?? 0) + 1,
                    today: view.today,
                    kind: 'individual',
                  }))
                  setOpen(true)
                }
              }}
            >
              <IconPlus data-icon="inline-start" aria-hidden="true" />
              ახალი განაცხადი
            </Button>
          </div>
        ) : null}
      </div>
      <PayrollNavigation actor={actor} active="awards" />
      <AwardProposalFilters
        search={search}
        onChange={(next) => {
          void navigate({ search: next, replace: true, resetScroll: false })
        }}
      />
      <Alert variant="info">
        <AlertDescription>
          აირჩიეთ ინდივიდუალური თანხა ან საერთო ფონდის წილი. დამტკიცებას
          ასრულებს დამოუკიდებელი უფლებამოსილი პირი. სახელფასო დარიცხვა და
          გადახდა ჯერ ხელმისაწვდომი არ არის.
        </AlertDescription>
      </Alert>
      {query.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="წახალისების განაცხადები იტვირთება"
        >
          <Skeleton className="h-80 rounded-xl" aria-hidden="true" />
        </div>
      ) : !view ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : 'განაცხადები ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {view.items.length ? (
            <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
              <AwardProposalsTable records={view.items} />
            </div>
          ) : (
            <Empty className="rounded-xl border border-dashed py-12">
              <EmptyHeader>
                <EmptyTitle>
                  {search.q
                    ? 'შესაბამისი განაცხადი არ მოიძებნა'
                    : 'ამ სიაში განაცხადები არ არის'}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          <DataPagination
            page={search.page}
            total={view.total}
            pageSize={view.pageSize}
            renderLink={(page) => (
              <Link
                to="/manage/payroll/awards"
                search={{ ...search, page }}
                resetScroll={false}
              />
            )}
          />
        </>
      )}
      {draft?.kind === 'individual' ? (
        <AwardProposalEditor
          key={draft.key}
          actorId={actor.id}
          existing={null}
          today={draft.today}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {draft?.kind === 'pool' ? (
        <AwardPoolEditor
          key={draft.key}
          actorId={actor.id}
          existing={null}
          today={draft.today}
          open={open}
          onClose={() => setOpen(false)}
          onSaved={(poolId) => {
            void navigate({
              to: '/manage/payroll/award-pools/$poolId',
              params: { poolId },
              search: { page: 1 },
            })
          }}
        />
      ) : null}
    </div>
  )
}
