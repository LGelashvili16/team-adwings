import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconArrowLeft, IconEdit } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { PayrollNavigation } from '../components/payroll-navigation'
import { BonusRuleEditor } from '../components/bonus-rule-editor'
import { PayrollHistorySearch } from '../components/payroll-history-search'
import {
  BonusRuleHistoryTable,
  BonusRuleTerms,
} from '../components/bonus-rule-tables'
import { bonusRuleQuery } from '../bonus-rules.queries'
import {
  bonusCalculationLabels,
  bonusKindLabels,
} from '../bonus-rules.presentation'
import type { BonusRuleDetail } from '../bonus-rules.types'

const route = getRouteApi('/_authenticated/manage/payroll/bonuses/$ruleId')
export function BonusRuleDetailPage() {
  const { actor } = route.useRouteContext(),
    { ruleId } = route.useParams(),
    search = route.useSearch()
  const navigate = route.useNavigate()
  const query = useQuery(
    bonusRuleQuery(actor.id, ruleId, search.page, search.q),
  )
  const view = query.data?.ok ? query.data.value : null
  const [draft, setDraft] = useState<{
      key: number
      existing: BonusRuleDetail
    } | null>(null),
    [open, setOpen] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          წახალისების წესი
        </h1>
        <Button
          disabled={!view}
          onClick={() => {
            if (view) {
              setDraft((previous) => ({
                key: (previous?.key ?? 0) + 1,
                existing: view,
              }))
              setOpen(true)
            }
          }}
        >
          <IconEdit aria-hidden="true" data-icon="inline-start" />
          წესის ცვლილება
        </Button>
      </div>
      <PayrollNavigation actor={actor} active="bonuses" />
      <div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/manage/payroll/bonuses" />}
        >
          <IconArrowLeft aria-hidden="true" data-icon="inline-start" />
          წესების სია
        </Button>
      </div>
      {query.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="წახალისების წესი იტვირთება"
        >
          <div className="flex flex-col gap-4" aria-hidden="true">
            <Skeleton className="h-52 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      ) : !view ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : 'წესი ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { title: 'დღეს მოქმედი პირობა', rule: view.current },
              { title: 'შემდეგი ცვლილება', rule: view.next },
            ].map(({ title, rule }) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle>
                    <h2>{title}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {rule ? (
                    <>
                      <h3 className="font-semibold wrap-anywhere">
                        {rule.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {bonusKindLabels[rule.kind]} ·{' '}
                        {bonusCalculationLabels[rule.calculation]}
                      </p>
                      <BonusRuleTerms rule={rule} />
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium">
                          მინიჭების პირობა
                        </span>
                        <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                          {rule.qualification}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {title === 'დღეს მოქმედი პირობა'
                        ? 'წესი ჯერ არ მოქმედებს.'
                        : 'ცვლილება არ არის დაგეგმილი.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <Alert variant="info">
            <AlertDescription>
              პირობა თანამშრომლისთვის თანხას არ არიცხავს. მინიჭება და დამტკიცება
              ცალკე ეტაპებია. შეცვლა ქმნის ახალ ვერსიას და ინარჩუნებს წინა
              ჩანაწერებს.
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
                q={search.q}
                scope={ruleId}
                onChange={(q) => {
                  void navigate({
                    search: { q, page: 1 },
                    replace: true,
                    resetScroll: false,
                  })
                }}
              />
              {query.isPlaceholderData ? (
                <div role="status" aria-label="წესის ისტორია იტვირთება">
                  <Skeleton className="h-64" aria-hidden="true" />
                </div>
              ) : view.history.length ? (
                <div className="min-w-0 overflow-hidden rounded-xl border">
                  <BonusRuleHistoryTable
                    records={view.history}
                    timezone={view.timezone}
                  />
                </div>
              ) : (
                <Empty className="rounded-xl border border-dashed py-8">
                  <EmptyHeader>
                    <EmptyTitle>
                      {search.q
                        ? 'შესაბამისი ცვლილებები არ მოიძებნა'
                        : 'ამ გვერდზე ცვლილებები არ არის'}
                    </EmptyTitle>
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
                      to="/manage/payroll/bonuses/$ruleId"
                      params={{ ruleId }}
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
      {draft ? (
        <BonusRuleEditor
          key={draft.key}
          actorId={actor.id}
          existing={draft.existing}
          today={draft.existing.today}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}
