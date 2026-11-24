import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { formatGeorgianDate } from '#/lib/date-format'
import { PayrollSettingsForm } from '../components/payroll-settings-form'
import { payrollSettingsQuery } from '../payroll-settings.queries'
import { PayrollNavigation } from '../components/payroll-navigation'

const route = getRouteApi('/_authenticated/manage/payroll/settings')

export function PayrollSettingsPage() {
  const { actor } = route.useRouteContext()
  const query = useQuery(payrollSettingsQuery(actor.id))
  const { latest, current } = query.data ?? {}
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          ხელფასების პარამეტრები
        </h1>
        {query.data ? (
          <Badge variant={current ? 'green' : 'secondary'}>
            {current
              ? `მოქმედი ვერსია: ${current.version}`
              : 'ჯერ არ არის ამოქმედებული'}
          </Badge>
        ) : null}
      </header>
      <PayrollNavigation actor={actor} active="settings" />
      <Alert variant="info" role="status">
        <AlertDescription>
          აქ ინახება გამოთვლის წესები. თანამშრომლების ხელფასების დარიცხვა და
          თანხების დაქვითვა ჯერ არ არის ჩართული.
        </AlertDescription>
      </Alert>
      {query.isError && !query.data ? (
        <Alert variant="destructive">
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
              <AlertDescription>
                პარამეტრების განახლება ვერ მოხერხდა. თქვენი ცვლილებები
                შენარჩუნებულია.
              </AlertDescription>
            </Alert>
          ) : null}
          {latest ? (
            <p className="text-sm text-muted-foreground">
              ბოლო შენახული ვერსია: {latest.version}. მოქმედებს{' '}
              {formatGeorgianDate(latest.effectiveFrom)} თარიღიდან.
              {latest.effectiveFrom > query.data.today
                ? ' ცვლილება დაგეგმილია.'
                : ''}
            </p>
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
      className="flex flex-col gap-6"
    >
      <div aria-hidden="true" className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-128 rounded-xl" />
      </div>
      <Skeleton aria-hidden="true" className="h-56 rounded-xl" />
    </div>
  )
}
