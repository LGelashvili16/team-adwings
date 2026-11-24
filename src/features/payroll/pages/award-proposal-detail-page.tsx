import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconArrowLeft, IconEdit } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { hasPermission } from '#/lib/authorization/permissions'
import { formatGeorgianDate } from '#/lib/date-format'
import { PayrollNavigation } from '../components/payroll-navigation'
import { AwardProposalEditor } from '../components/award-proposal-editor'
import { AwardWithdrawal } from '../components/award-withdrawal'
import { PayrollHistorySearch } from '../components/payroll-history-search'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import {
  AwardAmount,
  AwardHistoryTable,
} from '../components/award-proposal-tables'
import { awardQuery } from '../award-proposals.queries'
import { awardStatusLabels } from '../award-proposals.presentation'
import type { AwardDetail } from '../award-proposals.types'

const route = getRouteApi('/_authenticated/manage/payroll/awards/$proposalId')
export function AwardProposalDetailPage() {
  const { actor } = route.useRouteContext(),
    { proposalId } = route.useParams(),
    search = route.useSearch()
  const navigate = route.useNavigate()
  const query = useQuery(
      awardQuery(actor.id, proposalId, search.page, search.q),
    ),
    view = query.data?.ok ? query.data.value : null
  const [draft, setDraft] = useState<{
      key: number
      record: AwardDetail
      mode: 'edit' | 'withdraw'
    } | null>(null),
    [open, setOpen] = useState(false)
  const canEdit =
    hasPermission(actor, 'payroll.awards.propose') && view?.userId !== actor.id
  const start = (mode: 'edit' | 'withdraw') => {
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
        <h1 className="text-2xl font-semibold tracking-tight">
          წახალისების განაცხადი
        </h1>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {view?.current.status === 'proposed' ? (
              <Button variant="outline" onClick={() => start('withdraw')}>
                განაცხადის გაუქმება
              </Button>
            ) : null}
            <Button disabled={!view} onClick={() => start('edit')}>
              <IconEdit data-icon="inline-start" aria-hidden="true" />
              {view?.current.status === 'withdrawn'
                ? 'ხელახლა წარდგენა'
                : 'განაცხადის ცვლილება'}
            </Button>
          </div>
        ) : null}
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
        <div
          role="status"
          aria-busy="true"
          aria-label="წახალისების განაცხადი იტვირთება"
        >
          <Skeleton className="h-64 rounded-xl" aria-hidden="true" />
        </div>
      ) : !view ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : 'განაცხადი ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{view.employeeName}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div>
                  <Badge
                    variant={
                      view.current.status === 'proposed'
                        ? 'orange'
                        : 'secondary'
                    }
                  >
                    {awardStatusLabels[view.current.status]}
                  </Badge>
                </div>
                <p className="font-medium wrap-anywhere">
                  {view.current.rule.name}
                </p>
                <AwardAmount value={view.current} />
                <p className="text-sm text-muted-foreground">
                  შესრულება: {formatGeorgianDate(view.current.workDate)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>წყარო და მტკიცებულება</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="font-medium wrap-anywhere">
                  {view.current.sourceSnapshot.jobTitle ??
                    view.current.reference}
                </p>
                <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                  {view.current.evidence}
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap wrap-anywhere">
                  მინიჭების პირობა: {view.current.rule.qualification}
                </p>
                {view.sourceType === 'external' ? (
                  <Badge variant="outline">გარე წყარო</Badge>
                ) : (
                  <Badge variant="outline">
                    სამუშაოს დასრულების ჩანაწერი შენახულია
                  </Badge>
                )}
              </CardContent>
            </Card>
          </div>
          <Alert variant="info">
            <AlertDescription>
              თანხა შემოთავაზებულია და არ წარმოადგენს სახელფასო დარიცხვას.
              დამტკიცებამდე ხელახლა უნდა გადამოწმდეს დასაქმება, სამუშაოს
              მდგომარეობა, რაოდენობა და ტარიფი. დამტკიცება ჯერ ხელმისაწვდომი არ
              არის.
            </AlertDescription>
          </Alert>
          {view.userId === actor.id ? (
            <Alert>
              <AlertDescription>
                საკუთარი წახალისების განაცხადის ცვლილებისთვის მიმართეთ სხვა
                უფლებამოსილ პირს.
              </AlertDescription>
            </Alert>
          ) : null}
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
                scope={proposalId}
                q={search.q}
                label="განაცხადის ისტორიის ძიება"
                onChange={(q) => {
                  void navigate({
                    search: { q, page: 1 },
                    replace: true,
                    resetScroll: false,
                  })
                }}
              />
              {query.isPlaceholderData ? (
                <div role="status" aria-label="განაცხადის ისტორია იტვირთება">
                  <Skeleton className="h-64" aria-hidden="true" />
                </div>
              ) : view.history.length ? (
                <div className="min-w-0 overflow-hidden rounded-xl border">
                  <AwardHistoryTable records={view.history} />
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
                      to="/manage/payroll/awards/$proposalId"
                      params={{ proposalId }}
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
        <AwardProposalEditor
          key={draft.key}
          actorId={actor.id}
          existing={draft.record}
          today={draft.record.today}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {draft?.mode === 'withdraw' ? (
        <AwardWithdrawal
          key={draft.key}
          actorId={actor.id}
          record={draft.record}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}
