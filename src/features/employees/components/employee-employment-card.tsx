import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  IconCalendarUser,
  IconChevronDown,
  IconHistory,
  IconPlus,
} from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import { DataPagination } from '#/components/common/data-pagination'
import { hasPermission } from '#/lib/authorization/permissions'
import { formatGeorgianDateTime } from '#/lib/date-format'
import { employmentKey, employmentQuery } from '../employment.queries'
import { EmploymentEditor } from './employment-editor'
import {
  EmploymentDates,
  EmploymentPeriodsTable,
} from './employment-periods-table'
import type { EmploymentDraft } from './employment-editor'
import type { Actor } from '#/lib/authorization/actor'
import type { EmploymentPeriod } from '../employment.types'

const actionLabels = {
  created: 'პერიოდი დამატებულია',
  updated: 'პერიოდი შეცვლილია',
  voided: 'პერიოდი გაუქმებულია',
}

export function EmployeeEmploymentCard({
  actor,
  userId,
  name,
  employmentPage = 1,
  employmentHistoryPage = 1,
}: {
  actor: Actor
  userId: string
  name: string
  employmentPage?: number
  employmentHistoryPage?: number
}) {
  const client = useQueryClient()
  const query = useQuery(
    employmentQuery(actor.id, userId, employmentPage, employmentHistoryPage),
  )
  const [draft, setDraft] = useState<EmploymentDraft | null>(null)
  const [open, setOpen] = useState(false)
  const view = query.data?.ok ? query.data.value : null
  const canEdit =
    actor.id !== userId && hasPermission(actor, 'employees.employment.manage')
  const edit = (
    period: EmploymentPeriod | null,
    mode: EmploymentDraft['mode'],
  ) => {
    if (!view) return
    setDraft({
      key: (draft?.key ?? 0) + 1,
      revision: view.revision,
      mode,
      period,
    })
    setOpen(true)
  }
  const pagination = (kind: 'periods' | 'history') =>
    view ? (
      <DataPagination
        page={kind === 'periods' ? employmentPage : employmentHistoryPage}
        total={kind === 'periods' ? view.periodTotal : view.historyTotal}
        pageSize={view.pageSize}
        renderLink={(page) => (
          <Link
            to="/manage/employees/$employeeId"
            params={{ employeeId: userId }}
            search={{
              employmentPage: kind === 'periods' ? page : employmentPage,
              employmentHistoryPage:
                kind === 'history' ? page : employmentHistoryPage,
            }}
            resetScroll={false}
          />
        )}
      />
    ) : null
  return (
    <Card
      id="employment-periods"
      className="scroll-mt-4 rounded-2xl py-4 sm:py-5"
    >
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/70 text-muted-foreground">
            <IconCalendarUser className="size-4" aria-hidden="true" />
          </span>
          <h2>დასაქმების პერიოდები</h2>
        </CardTitle>
        {canEdit && view ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => edit(null, 'create')}
          >
            <IconPlus data-icon="inline-start" aria-hidden="true" />
            დამატება
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-5">
        {query.isPending ? (
          <div
            role="status"
            aria-label="დასაქმების პერიოდები იტვირთება"
            aria-busy="true"
          >
            <div aria-hidden="true" className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          </div>
        ) : !view ? (
          <Alert variant="destructive">
            <AlertDescription>
              {query.data && !query.data.ok
                ? query.data.message
                : 'დასაქმების პერიოდები ვერ ჩაიტვირთა. სცადეთ ხელახლა.'}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-fit"
                disabled={query.isFetching}
                aria-busy={query.isFetching}
                onClick={() => {
                  void query.refetch()
                }}
              >
                <span className="flex size-4 items-center justify-center">
                  {query.isFetching ? <Spinner aria-hidden="true" /> : null}
                </span>
                ხელახლა ცდა
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {!view.confirmed ? (
              <Empty className="rounded-xl border border-dashed bg-muted/15 px-4 py-7 md:p-7">
                <EmptyHeader>
                  <EmptyMedia>
                    <IconCalendarUser aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>თარიღები დასაზუსტებელია</EmptyTitle>
                  <p className="text-sm leading-6 text-muted-foreground">
                    ხელფასის დასათვლელად საჭიროა დასაქმების დადასტურებული
                    პერიოდი. ანგარიშის შექმნის თარიღი დასაქმების დაწყებას არ
                    ადასტურებს.
                  </p>
                </EmptyHeader>
              </Empty>
            ) : view.periods.length ? (
              <div className="overflow-hidden rounded-xl border">
                <EmploymentPeriodsTable
                  periods={view.periods}
                  today={view.today}
                  canEdit={canEdit}
                  onEdit={edit}
                />
              </div>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                ამ გვერდზე პერიოდები არ არის.
              </p>
            )}
            {view.periodTotal > view.pageSize || employmentPage > 1
              ? pagination('periods')
              : null}
            {view.historyTotal > 0 ? (
              <Collapsible
                defaultOpen={employmentHistoryPage > 1}
                className="border-t pt-4"
              >
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="group w-full justify-start"
                    />
                  }
                >
                  <IconHistory data-icon="inline-start" aria-hidden="true" />
                  ცვლილებების ისტორია
                  <span className="text-muted-foreground">
                    ({view.historyTotal})
                  </span>
                  <IconChevronDown
                    className="ml-auto transition-transform group-data-panel-open:rotate-180"
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <ol
                    className="space-y-3"
                    aria-label="დასაქმების ცვლილებების ისტორია"
                  >
                    {view.history.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-xl border bg-muted/15 p-4 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">
                            {actionLabels[entry.action]}
                          </p>
                          <time
                            className="text-xs text-muted-foreground"
                            dateTime={entry.createdAt}
                          >
                            {formatGeorgianDateTime(
                              entry.createdAt,
                              view.timezone,
                            )}
                          </time>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {entry.actorName}
                        </p>
                        <dl className="mt-3 space-y-2">
                          {entry.before ? (
                            <div>
                              <dt className="text-xs text-muted-foreground">
                                ცვლილებამდე
                              </dt>
                              <dd className="mt-1">
                                <EmploymentDates period={entry.before} />
                              </dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              {entry.action === 'voided'
                                ? 'გაუქმებული პერიოდი'
                                : 'დადასტურებული პერიოდი'}
                            </dt>
                            <dd className="mt-1">
                              <EmploymentDates period={entry.after} />
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 border-t pt-3 whitespace-pre-wrap wrap-anywhere text-muted-foreground">
                          {entry.reason}
                        </p>
                      </li>
                    ))}
                  </ol>
                  {!view.history.length ? (
                    <p className="text-sm text-muted-foreground">
                      ამ გვერდზე ცვლილებები არ არის.
                    </p>
                  ) : null}
                  {view.historyTotal > view.pageSize ||
                  employmentHistoryPage > 1 ? (
                    <div className="mt-4">{pagination('history')}</div>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </>
        )}
      </CardContent>
      {/* Retain the editor while closed so the shared Sheet can finish its exit transition. */}
      {draft && view ? (
        <EmploymentEditor
          key={draft.key}
          open={open}
          draft={draft}
          userId={userId}
          name={name}
          today={view.today}
          onClose={() => setOpen(false)}
          onSaved={() => {
            void client.invalidateQueries({
              queryKey: employmentKey(actor.id, userId),
            })
          }}
        />
      ) : null}
    </Card>
  )
}
