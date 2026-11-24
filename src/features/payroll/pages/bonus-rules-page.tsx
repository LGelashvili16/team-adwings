import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconPlus } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { PayrollNavigation } from '../components/payroll-navigation'
import { BonusRuleEditor } from '../components/bonus-rule-editor'
import { BonusRuleFilters } from '../components/bonus-rule-filters'
import { BonusRulesTable } from '../components/bonus-rule-tables'
import { bonusRulesQuery } from '../bonus-rules.queries'

const route = getRouteApi('/_authenticated/manage/payroll/bonuses/')
export function BonusRulesPage() {
  const { actor } = route.useRouteContext(),
    search = route.useSearch(),
    navigate = route.useNavigate()
  const query = useQuery(bonusRulesQuery(actor.id, search))
  const view = query.data?.ok ? query.data.value : null
  const [draft, setDraft] = useState<{ key: number; today: string } | null>(
      null,
    ),
    [open, setOpen] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          წახალისების წესები
        </h1>
        <Button
          disabled={!view}
          onClick={() => {
            if (view) {
              setDraft((previous) => ({
                key: (previous?.key ?? 0) + 1,
                today: view.today,
              }))
              setOpen(true)
            }
          }}
        >
          <IconPlus aria-hidden="true" data-icon="inline-start" />
          ახალი წესი
        </Button>
      </div>
      <PayrollNavigation actor={actor} active="bonuses" />
      <BonusRuleFilters
        search={search}
        onChange={(next) => {
          void navigate({ search: next, replace: true, resetScroll: false })
        }}
      />
      <Alert variant="info">
        <AlertDescription>
          აქ ინახება ბონუსისა და პრემიის პირობები. შესრულებული რაოდენობა და
          შემოთავაზებული თანხა ინახება განაცხადებში. დამტკიცება და სახელფასო
          დარიცხვა ჯერ ხელმისაწვდომი არ არის.
        </AlertDescription>
      </Alert>
      {query.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="წახალისების წესები იტვირთება"
        >
          <Skeleton className="h-80 rounded-xl" aria-hidden="true" />
        </div>
      ) : !view ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : 'წესები ვერ ჩაიტვირთა. განაახლეთ გვერდი.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {view.items.length ? (
            <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
              <BonusRulesTable records={view.items} />
            </div>
          ) : (
            <Empty className="rounded-xl border border-dashed py-12">
              <EmptyHeader>
                <EmptyTitle>
                  {search.q || search.kind !== 'all'
                    ? 'შესაბამისი წესი არ მოიძებნა'
                    : 'წახალისების წესი ჯერ არ არის განსაზღვრული'}
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
                to="/manage/payroll/bonuses"
                search={{ ...search, page }}
                resetScroll={false}
              />
            )}
          />
        </>
      )}
      {draft ? (
        <BonusRuleEditor
          key={draft.key}
          actorId={actor.id}
          existing={null}
          today={draft.today}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}
