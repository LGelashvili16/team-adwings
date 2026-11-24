import { EmployeeDayOffBalanceCard } from '#/features/leave/components/day-off-allowance-card'
import { EmployeeNetworkCard } from '#/features/attendance-security/components/employee-network-card'
import { EmployeeEmploymentCard } from '#/features/employees/components/employee-employment-card'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { IconArrowLeft } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import {
  hasEveryPermission,
  hasPermission,
} from '#/lib/authorization/permissions'
import { getEmployeeAccount } from '../access.functions'
import { availableAccountActions, canManageAccount } from '../access.actions'
import { AccountActionDialog } from './account-action-dialog'
import { AccountCodeDialog } from './account-code-dialog'
import { EmployeeDetailsSheet } from './employee-details-sheet'
import { UserProfileCard } from './user-profile-card'
import { UserProfileHeader } from './user-profile-header'
import { UserScheduleCard } from './user-schedule-card'
import { UserWorkRecordsCard } from './user-work-records-card'
import type { Actor } from '#/lib/authorization/actor'
import type { IssuedAccountCode } from '../access.types'
import type { AccountAction } from './account-action-content'

function BackLink() {
  return (
    <Button
      nativeButton={false}
      role="link"
      variant="ghost"
      size="sm"
      className="w-fit"
      render={<Link to="/manage/employees" search={{ page: 1 }} />}
    >
      <IconArrowLeft data-icon="inline-start" aria-hidden="true" />
      თანამშრომლების ანგარიშები
    </Button>
  )
}

export function UserDetail({
  userId,
  actor,
  employmentPage = 1,
  employmentHistoryPage = 1,
}: {
  userId: string
  actor: Actor
  employmentPage?: number
  employmentHistoryPage?: number
}) {
  const query = useQuery({
    queryKey: ['employee-accounts', 'detail', userId],
    queryFn: () => getEmployeeAccount({ data: { userId } }),
    retry: false,
    staleTime: 0,
  })
  const [action, setAction] = useState<AccountAction | null>(null)
  const [editing, setEditing] = useState(false)
  const [issuedCode, setIssuedCode] = useState<IssuedAccountCode | null>(null)
  const detail = query.data?.ok ? query.data.value : null

  if (query.isPending)
    return (
      <div
        className="w-full"
        role="status"
        aria-busy="true"
        aria-label="ანგარიში იტვირთება"
      >
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-44 w-full rounded-2xl" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  if (!detail)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Alert>
          <AlertDescription>
            {query.data && !query.data.ok
              ? query.data.message
              : query.data
                ? 'თანამშრომლის ანგარიში ვერ მოიძებნა.'
                : 'ანგარიშის ჩატვირთვა ვერ მოხერხდა. გადაამოწმეთ თქვენი წვდომა.'}
          </AlertDescription>
        </Alert>
      </div>
    )

  const { record, companyWeek } = detail
  const manageable = canManageAccount(record, actor)
  const actions = manageable ? availableAccountActions(record) : []
  const canAssignAdmin = hasEveryPermission(actor, [
    'admin.access',
    'users.manage',
    'roles.manage',
  ])
  return (
    <div className="flex w-full flex-col gap-4">
      <BackLink />
      <UserProfileHeader
        record={record}
        canEdit={manageable}
        onEdit={() => setEditing(true)}
        actions={actions}
        onAction={setAction}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <UserProfileCard record={record} />
          <EmployeeEmploymentCard
            actor={actor}
            userId={userId}
            name={record.name}
            employmentPage={employmentPage}
            employmentHistoryPage={employmentHistoryPage}
          />
          <UserScheduleCard
            week={record.workingWeek}
            companyWeek={companyWeek}
          />
          <UserWorkRecordsCard
            roles={actor.roles}
            permissionOverrides={actor.permissionOverrides}
            userId={record.userId}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {hasPermission(actor, 'employees.manage') ? (
            <EmployeeDayOffBalanceCard
              actorId={actor.id}
              userId={record.userId}
              canEdit={actor.id !== record.userId}
            />
          ) : null}
          {actor.id !== userId && hasPermission(actor, 'security.configure') ? (
            <EmployeeNetworkCard actorId={actor.id} userId={userId} />
          ) : null}
        </div>
      </div>
      {action ? (
        <AccountActionDialog
          target={record}
          action={action}
          onClose={() => setAction(null)}
          onCode={setIssuedCode}
        />
      ) : null}
      {/* Keep the sheet root mounted so Base UI can run its opening and closing transitions. */}
      <EmployeeDetailsSheet
        open={editing}
        target={record}
        canAssignAdmin={canAssignAdmin}
        canConfigureSchedule={hasPermission(actor, 'attendance.configure')}
        onClose={() => setEditing(false)}
      />
      {issuedCode ? (
        <AccountCodeDialog
          value={issuedCode}
          onClose={() => setIssuedCode(null)}
        />
      ) : null}
    </div>
  )
}
