import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconArrowLeft, IconEdit } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { formatGeorgianDate } from '#/lib/date-format'
import { PayrollNavigation } from '../components/payroll-navigation'
import { PayrollHistorySearch } from '../components/payroll-history-search'
import { AwardPoolEditor } from '../components/award-pool-editor'
import {
  PoolAllocationTable,
  PoolHistoryTable,
} from '../components/award-pool-tables'
import { AwardReviewDialog } from '../components/award-review-dialog'
import { awardPoolQuery } from '../award-pools.queries'
import {
  awardStatusLabels,
  awardStatusVariants,
  formatAwardQuantity,
} from '../award-proposals.presentation'
import { formatSalary, salaryBasisLabels } from '../salary.presentation'
import { bonusUnitLabel } from '../bonus-rules.presentation'
import type { AwardDecision } from '../components/award-review-dialog'
import type { AwardPoolDetail } from '../award-pools.types'

const route = getRouteApi('/_authenticated/manage/payroll/award-pools/$poolId')
export function AwardPoolDetailPage() {
  const { actor } = route.useRouteContext(),
    { poolId } = route.useParams(),
    search = route.useSearch(),
    navigate = route.useNavigate()
  const query = useQuery(
      awardPoolQuery(actor.id, poolId, search.page, search.q),
    ),
    view = query.data?.ok ? query.data.value : null
  const [draft, setDraft] = useState<{
      key: number
      record: AwardPoolDetail
      mode: 'edit' | AwardDecision
    } | null>(null),
    [open, setOpen] = useState(false)
  const start = (mode: 'edit' | AwardDecision) => {
    if (view) {
      setDraft((previous) => ({
        key: (previous?.key ?? 0) + 1,
        record: view,
        mode,
      }))
      setOpen(true)
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">საერთო ფონდი</h1>
        <div className="flex flex-wrap gap-2">
          {view?.preparationEligible && view.current.status !== 'approved' ? (
            <>
              {view.current.status === 'proposed' ? (
                <Button variant="outline" onClick={() => start('withdrawn')}>
                  ფონდის გაუქმება
                </Button>
              ) : null}
              <Button onClick={() => start('edit')}>
                <IconEdit data-icon="inline-start" aria-hidden="true" />
                {view.current.status === 'proposed'
                  ? 'განაწილების ცვლილება'
                  : 'ხელახლა წარდგენა'}
              </Button>
            </>
          ) : null}
          {view?.reviewEligible && view.current.status === 'proposed' ? (
            <>
              <Button variant="outline" onClick={() => start('rejected')}>
                უარყოფა
              </Button>
              <Button onClick={() => start('approved')}>დამტკიცება</Button>
            </>
          ) : null}
          {view?.reviewEligible && view.current.status === 'approved' ? (
            <Button variant="outline" onClick={() => start('revoked')}>
              დამტკიცების გაუქმება
            </Button>
          ) : null}
        </div>
      </div>
      <PayrollNavigation actor={actor} active="awards" />
      <div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/manage/payroll/awards" />}
        >
          <IconArrowLeft data-icon="inline-start" aria-hidden="true" />
          განაცხადების სია
        </Button>
      </div>
      {query.isPending ? (
        <div role="status" aria-busy="true" aria-label="საერთო ფონდი იტვირთება">
          <Skeleton className="h-64 rounded-xl" aria-hidden="true" />
        </div>
      ) : !view ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : 'ფონდი ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{view.current.rule.name}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Badge variant={awardStatusVariants[view.current.status]}>
                  {awardStatusLabels[view.current.status]}
                </Badge>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatSalary({ amountMinor: view.current.totalMinor })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {salaryBasisLabels[view.current.rule.amountBasis]} ·{' '}
                  {view.current.allocations.length} ბენეფიციარი
                </p>
                <p className="text-sm">
                  {formatAwardQuantity(view.current.quantityMilli)} ×{' '}
                  {formatSalary(view.current.rule)} ·{' '}
                  {bonusUnitLabel(view.current.rule)}
                </p>
                <p className="text-sm text-muted-foreground">
                  შესრულება: {formatGeorgianDate(view.current.workDate)} · წესის
                  ვერსია {view.current.rule.version}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>წყარო და მინიჭების პირობა</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="font-medium wrap-anywhere">
                  {view.members[0]?.current.sourceSnapshot.jobTitle ??
                    view.current.reference}
                </p>
                <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                  {view.current.evidence}
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap wrap-anywhere">
                  {view.current.rule.qualification}
                </p>
                <Badge variant="outline">
                  {view.sourceType === 'job'
                    ? 'სამუშაოს დასრულების ჩანაწერი'
                    : 'გარე წყარო'}
                </Badge>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>ბენეფიციარები და წილები</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="min-w-0 overflow-hidden rounded-xl border">
                <PoolAllocationTable
                  rows={view.current.allocations}
                  renderAction={(row) => {
                    const member = view.members.find(
                      (m) => m.userId === row.userId,
                    )
                    return member ? (
                      <Button
                        variant="ghost"
                        nativeButton={false}
                        render={
                          <Link
                            to="/manage/payroll/awards/$proposalId"
                            params={{ proposalId: member.proposalId }}
                            search={{ page: 1 }}
                          />
                        }
                      >
                        წილის ისტორია
                      </Button>
                    ) : null
                  }}
                />
              </div>
            </CardContent>
          </Card>
          <Alert variant="info">
            <AlertDescription>
              ყველა წილის გადაწყვეტილება ერთდროულად ინახება. მომმზადებელი და
              ბენეფიციარები ფონდს ვერ ამტკიცებენ. დამტკიცება არ წარმოადგენს
              სახელფასო დარიცხვას ან გადახდას.
            </AlertDescription>
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>ცვლილებების ისტორია</h2>
              </CardTitle>
            </CardHeader>
            <CardContent
              className="flex flex-col gap-4"
              aria-busy={query.isPlaceholderData}
            >
              <PayrollHistorySearch
                scope={poolId}
                q={search.q}
                label="ფონდის ისტორიის ძიება"
                onChange={(q) => {
                  void navigate({
                    search: { q, page: 1 },
                    replace: true,
                    resetScroll: false,
                  })
                }}
              />
              {query.isPlaceholderData ? (
                <div role="status" aria-label="ფონდის ისტორია იტვირთება">
                  <Skeleton className="h-64" aria-hidden="true" />
                </div>
              ) : view.history.length ? (
                <div className="min-w-0 overflow-hidden rounded-xl border">
                  <PoolHistoryTable
                    records={view.history}
                    timezone={view.timezone}
                  />
                </div>
              ) : (
                <Empty className="rounded-xl border border-dashed py-8">
                  <EmptyHeader>
                    <EmptyTitle>შესაბამისი ცვლილებები არ მოიძებნა</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
              {!query.isPlaceholderData ? (
                <DataPagination
                  page={search.page}
                  total={view.total}
                  pageSize={view.pageSize}
                  renderLink={(page) => (
                    <Link
                      to="/manage/payroll/award-pools/$poolId"
                      params={{ poolId }}
                      search={{ ...search, page }}
                      resetScroll={false}
                    />
                  )}
                />
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
      {draft?.mode === 'edit' ? (
        <AwardPoolEditor
          key={draft.key}
          actorId={actor.id}
          existing={draft.record}
          today={draft.record.today}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {draft && draft.mode !== 'edit' ? (
        <AwardReviewDialog
          key={draft.key}
          actorId={actor.id}
          target={{
            kind: 'pool',
            id: draft.record.poolId,
            version: draft.record.current.version,
            label: draft.record.current.rule.name,
          }}
          decision={draft.mode}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}
