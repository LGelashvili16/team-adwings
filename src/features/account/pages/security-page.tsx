import { IconDevicesOff, IconKey, IconLockPassword } from '@tabler/icons-react'
import { getRouteApi } from '@tanstack/react-router'
import { FeaturePage } from '#/components/common/feature-page'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { OwnDevices } from '#/features/attendance-security/components/own-devices'
import { AttendanceSecurityProvider } from '#/features/attendance-security/providers/attendance-security-provider'
import { accountContent } from '../account.content'
import { ChangePasswordForm } from '../components/change-password-form'

export function SecurityPage() {
  const route = getRouteApi('/_authenticated/settings/security')
  const { actor } = route.useRouteContext()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  return (
    <FeaturePage {...accountContent.security}>
      <AttendanceSecurityProvider key={actor.id}>
        <OwnDevices
          actorId={actor.id}
          search={{
            page: search.devicePage,
            q: search.deviceQ,
            state: search.deviceState,
            sort: search.deviceSort,
          }}
          onSearch={(next) => {
            void navigate({
              search: {
                devicePage: next.page,
                deviceQ: next.q,
                deviceState: next.state,
                deviceSort: next.sort,
              },
            })
          }}
        />
      </AttendanceSecurityProvider>
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <IconLockPassword className="size-4" aria-hidden="true" />
            </span>
            პაროლის შეცვლა
          </CardTitle>
        </CardHeader>
        <CardContent className="grid items-start gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <ChangePasswordForm />
          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/25 p-4 text-sm leading-6 text-muted-foreground">
            <div className="flex items-start gap-3">
              <IconDevicesOff
                className="mt-0.5 size-4 shrink-0 text-foreground/70"
                aria-hidden="true"
              />
              <p>
                პაროლის შეცვლის შემდეგ სხვა მოწყობილობებზე სესიები დასრულდება.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <IconKey
                className="mt-0.5 size-4 shrink-0 text-foreground/70"
                aria-hidden="true"
              />
              <p>
                თუ პაროლი დაგავიწყდათ, სთხოვეთ ადმინისტრატორს აღდგენის კოდი.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </FeaturePage>
  )
}
