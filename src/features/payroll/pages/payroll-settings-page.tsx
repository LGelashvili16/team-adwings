import { IconAlertCircle, IconAlertTriangle } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { PayrollSettingsForm } from '../components/payroll-settings-form'
import { payrollSettingsQuery } from '../payroll-settings.queries'
import { PayrollPageHeader } from '../components/payroll-page-header'

const route = getRouteApi('/_authenticated/manage/payroll/settings')

export function PayrollSettingsPage() {
  const { actor } = route.useRouteContext()
  const query = useQuery(payrollSettingsQuery(actor.id))
  const latest = query.data?.latest
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PayrollPageHeader
        actor={actor}
        active="settings"
        title="ხელფასების პარამეტრები"
      >
        {latest?.schedule ? (
          <Badge variant="green">გრაფიკი შენახულია</Badge>
        ) : query.data ? (
          <Badge variant="secondary">ჯერ არ არის შენახული</Badge>
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
      className="grid items-start gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]"
    >
      <Skeleton aria-hidden="true" className="h-60 rounded-2xl" />
      <Skeleton aria-hidden="true" className="h-96 rounded-2xl" />
    </div>
  )
}
