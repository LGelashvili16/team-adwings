import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { IconAlertCircle, IconX } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { DataPagination } from '#/components/common/data-pagination'
import { PayrollMonthControl } from '../components/payroll-month-control'
import { SalaryHistory } from '../components/salary-history'
import { SalaryStatements } from '../components/salary-statements'
import { SalarySummary } from '../components/salary-summary'
import { mySalaryQuery } from '../salary.queries'

const route = getRouteApi('/_authenticated/payroll')

export function MySalaryPage() {
  const { actor } = route.useRouteContext()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const query = useQuery(mySalaryQuery(actor.id, search))
  const view = query.data?.ok ? query.data.value : null
  const statements = view?.statements

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        ხელფასი
      </h1>
      {query.isPending ? (
        <div role="status" aria-busy="true" aria-label="ხელფასი იტვირთება">
          <div aria-hidden="true" className="flex flex-col gap-6">
            <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
              <Skeleton className="h-52 rounded-2xl" />
              <Skeleton className="h-52 rounded-2xl" />
            </div>
            <Skeleton className="h-60 rounded-2xl" />
          </div>
        </div>
      ) : !view || !statements ? (
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
          <SalarySummary employee={view.employee} highlightCurrent />
          <SalaryStatements
            records={statements.records}
            loading={query.isPlaceholderData}
            filtered={Boolean(search.month)}
            filter={
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <div className="min-w-0 flex-1">
                  <PayrollMonthControl
                    id="salary-history-month"
                    month={search.month ?? view.today.slice(0, 7)}
                    placeholder={search.month ? undefined : 'ყველა თვე'}
                    onChange={(month) => {
                      void navigate({
                        search: { ...search, month, statementPage: 1 },
                        resetScroll: false,
                      })
                    }}
                  />
                </div>
                {search.month ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11 shrink-0 rounded-full md:size-9"
                    onClick={() => {
                      void navigate({
                        search: {
                          ...search,
                          month: undefined,
                          statementPage: 1,
                        },
                        resetScroll: false,
                      })
                    }}
                    aria-label="თვის ფილტრის გასუფთავება"
                  >
                    <IconX aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            }
            pagination={
              !query.isPlaceholderData &&
              statements.total > statements.pageSize ? (
                <DataPagination
                  label="თვის უწყისების გვერდები"
                  page={statements.page}
                  total={statements.total}
                  pageSize={statements.pageSize}
                  renderLink={(statementPage) => (
                    <Link
                      to="/payroll"
                      search={{ ...search, statementPage }}
                      resetScroll={false}
                    />
                  )}
                />
              ) : undefined
            }
          />
          <SalaryHistory
            heading="ხელფასის ცვლილებები"
            history={view.history}
            timezone={view.timezone}
            pagination={
              view.total > view.pageSize || search.page > 1 ? (
                <DataPagination
                  label="ხელფასის ცვლილებების გვერდები"
                  page={search.page}
                  total={view.total}
                  pageSize={view.pageSize}
                  renderLink={(page) => (
                    <Link
                      to="/payroll"
                      search={{ ...search, page }}
                      resetScroll={false}
                    />
                  )}
                />
              ) : undefined
            }
          />
        </>
      )}
    </div>
  )
}
