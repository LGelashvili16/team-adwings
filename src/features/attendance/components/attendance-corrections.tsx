import { useQuery } from '@tanstack/react-query'
import {
  IconCalendarEvent,
  IconClock,
  IconHistory,
  IconLogin2,
  IconLogout2,
  IconUser,
} from '@tabler/icons-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '#/components/ui/pagination'
import { readMyAttendanceCorrections } from '../attendance.functions'
import type { AttendanceCorrection } from '../attendance.types'
import { formatAttendanceTimestamp } from '../attendance.rules'
import { formatGeorgianDate } from '#/lib/date-format'

function exactTime(value: string | null, timezone: string) {
  if (!value) return 'არ იყო აღრიცხული'
  return formatAttendanceTimestamp(value, timezone)
}

function Correction({ item }: { item: AttendanceCorrection }) {
  return (
    <li className="min-w-0">
      <Card size="sm" className="@container">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <IconCalendarEvent
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <time dateTime={item.workDate}>
              {formatGeorgianDate(item.workDate)}
            </time>
          </CardTitle>
          <span className="flex items-center gap-2 wrap-anywhere text-muted-foreground">
            <IconUser className="size-4 shrink-0" aria-hidden="true" />
            {item.actorName}
          </span>
        </CardHeader>
        <CardContent className="grid gap-3 @3xl:grid-cols-2">
          {(
            [
              { field: 'startedAt', label: 'შესვლა', icon: IconLogin2 },
              { field: 'endedAt', label: 'გასვლა', icon: IconLogout2 },
            ] as const
          ).map(({ field, label, icon: Icon }) => {
            const previous = item.before[field]
            const corrected = item.after[field]
            return (
              <div
                key={field}
                className="min-w-0 rounded-lg border bg-muted/35 p-3"
              >
                <h4 className="mb-2 flex items-center gap-2 font-medium">
                  <Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {label}
                </h4>
                <dl className="grid grid-cols-2 gap-2">
                  <div className="min-w-0 p-2">
                    <dt className="text-xs text-muted-foreground">
                      ცვლილებამდე
                    </dt>
                    <dd className="mt-1 wrap-anywhere tabular-nums">
                      {exactTime(previous, item.timezone)}
                    </dd>
                  </div>
                  <div className="min-w-0 rounded-md bg-background p-2 ring-1 ring-border">
                    <dt className="text-xs text-muted-foreground">
                      ცვლილების შემდეგ
                    </dt>
                    <dd className="mt-1 font-semibold wrap-anywhere tabular-nums">
                      {exactTime(corrected, item.timezone)}
                    </dd>
                  </div>
                </dl>
              </div>
            )
          })}
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-x-4 gap-y-2">
          {item.reason.trim() ? (
            <p className="wrap-anywhere">მიზეზი: {item.reason}</p>
          ) : null}
          <p className="ml-auto flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <IconClock className="size-3.5 shrink-0" aria-hidden="true" />
            <time dateTime={item.createdAt}>
              შეცვლილია: {exactTime(item.createdAt, item.timezone)}
            </time>
          </p>
        </CardFooter>
      </Card>
    </li>
  )
}

export function AttendanceCorrections({
  actorId,
  page,
  onPageChange,
}: {
  actorId: string
  page: number
  onPageChange: (page: number) => void
}) {
  const query = useQuery({
    queryKey: ['my-attendance-corrections', actorId, page],
    queryFn: () => readMyAttendanceCorrections({ data: { page } }),
    retry: false,
  })
  const result = query.data
  return (
    <Card className="py-0">
      <Accordion>
        <AccordionItem value="corrections">
          <AccordionTrigger className="items-center px-(--card-spacing) py-4 font-heading text-base hover:bg-muted/35 hover:no-underline focus-visible:ring-inset">
            <span className="flex min-w-0 items-center gap-2 pr-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <IconHistory className="size-5" aria-hidden="true" />
              </span>
              დროის შესწორებების ისტორია
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4 border-t px-(--card-spacing) py-4 [&_p:not(:last-child)]:mb-0">
            {query.isPending ? (
              <div
                role="status"
                aria-busy="true"
                aria-label="შესწორებები იტვირთება"
              >
                <Skeleton className="h-40" aria-hidden="true" />
              </div>
            ) : query.isError || !result?.ok ? (
              <Alert variant="destructive">
                <AlertDescription>
                  შესწორებების ისტორია ვერ ჩაიტვირთა.
                </AlertDescription>
              </Alert>
            ) : !result.value.items.length ? (
              <p className="text-sm text-muted-foreground">
                დროის შესწორებები არ არის.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {result.value.items.map((item) => (
                  <Correction key={item.id} item={item} />
                ))}
              </ul>
            )}
            {page > 0 || (result?.ok && result.value.hasMore) ? (
              <Pagination aria-label="შესწორებების გვერდები">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      render={
                        <Button
                          variant="outline"
                          disabled={page === 0 || query.isFetching}
                          onClick={() => onPageChange(page - 1)}
                        />
                      }
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-3 text-sm">გვერდი {page + 1}</span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      render={
                        <Button
                          variant="outline"
                          disabled={
                            page >= 10000 ||
                            query.isFetching ||
                            !result?.ok ||
                            !result.value.hasMore
                          }
                          onClick={() => onPageChange(page + 1)}
                        />
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  )
}
