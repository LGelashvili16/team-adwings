import {
  IconCalendarClock,
  IconInfoCircle,
  IconAlertCircle,
  IconAlertTriangle,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { formatGeorgianDate } from '#/lib/date-format'
import { PayrollSettingsForm } from '../components/payroll-settings-form'
import { payrollSettingsQuery } from '../payroll-settings.queries'
import { PayrollPageHeader } from '../components/payroll-page-header'

const route = getRouteApi('/_authenticated/manage/payroll/settings')

export function PayrollSettingsPage() {
  const { actor } = route.useRouteContext()
  const query = useQuery(payrollSettingsQuery(actor.id))
  const { latest, current } = query.data ?? {}
  const scheduled =
    latest && query.data && latest.effectiveFrom > query.data.today
      ? latest
      : null
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PayrollPageHeader
        actor={actor}
        active="settings"
        title="ხელფასების პარამეტრები"
      >
        {current ? (
          <Badge variant="green">მოქმედი ვერსია {current.version}</Badge>
        ) : query.data && !latest ? (
          <Badge variant="secondary">ჯერ არ არის შენახული</Badge>
        ) : null}
        {scheduled ? (
          <Badge variant="outline" className="h-auto whitespace-normal">
            <IconCalendarClock aria-hidden="true" />
            ვერსია {scheduled.version} ამოქმედდება{' '}
            {formatGeorgianDate(scheduled.effectiveFrom)}
          </Badge>
        ) : null}
      </PayrollPageHeader>
      {query.isError && !query.data ? (
        <Alert variant="destructive">
          <IconAlertCircle aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            პარამეტრები ვერ ჩაიტვირთა. გადაამოწმეთ წვდომა და განაახლეთ გვერდი.
            <Button variant="outline" onClick={() => window.location.reload()}>
              გვერდის განახლება
            </Button>
          </AlertDescription>
        </Alert>
      ) : query.isPending ? (
        <PayrollSettingsSkeleton />
      ) : (
        <>
          {query.isError ? (
            <Alert variant="warning" role="status">
              <IconAlertTriangle aria-hidden="true" />
              <AlertDescription>
                პარამეტრების განახლება ვერ მოხერხდა. თქვენი ცვლილებები
                შენარჩუნებულია.
              </AlertDescription>
            </Alert>
          ) : null}
          <Alert variant="info" role="status">
            <IconInfoCircle aria-hidden="true" />
            <AlertDescription>
              თვის უწყისში დღიური თანხის, საშემოსავლოსა და საპენსიოს ავტომატური
              გამოთვლა ჯერ არ არის ჩართული.
            </AlertDescription>
          </Alert>
          <PayrollSettingsForm
            key={actor.id}
            actorId={actor.id}
            initial={query.data}
          />
        </>
      )}
    </div>
  )
}

function PayrollSettingsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="ხელფასების პარამეტრები იტვირთება"
      className="flex flex-col gap-6"
    >
      <div aria-hidden="true" className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-84 rounded-2xl" />
        <Skeleton className="h-84 rounded-2xl" />
      </div>
      <Skeleton aria-hidden="true" className="h-36 rounded-2xl" />
    </div>
  )
}
