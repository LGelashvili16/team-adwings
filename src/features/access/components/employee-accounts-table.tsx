import { Link } from '@tanstack/react-router'
import { IconChevronRight } from '@tabler/icons-react'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { parseRoles, roleLabels } from '#/lib/authorization/permissions'
import { accountInitials, accountStatus } from '../access.presentation'
import type { EmployeeAccountSummary } from '../access.types'

export function EmployeeAccountsTable({
  records,
  actorId,
}: {
  records: Array<EmployeeAccountSummary>
  actorId: string
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-5">თანამშრომელი</TableHead>
          <TableHead>თანამდებობა</TableHead>
          <TableHead className="hidden md:table-cell">
            სისტემაში წვდომა
          </TableHead>
          <TableHead>სტატუსი</TableHead>
          <TableHead className="w-12 pr-5">
            <span className="sr-only">დეტალები</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => {
          const status = accountStatus(record)
          return (
            <TableRow key={record.userId} className="relative cursor-pointer">
              <TableCell className="pl-5">
                <div className="flex items-center gap-3">
                  <Avatar aria-hidden="true">
                    <AvatarFallback>
                      {accountInitials(record.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      <Link
                        to="/manage/employees/$employeeId"
                        params={{ employeeId: record.userId }}
                        className="break-words text-foreground! hover:underline focus-visible:outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                      >
                        {record.name}
                      </Link>
                      {record.userId === actorId ? (
                        <Badge variant="secondary">თქვენ</Badge>
                      ) : null}
                    </span>
                    <span
                      className={
                        record.code
                          ? 'font-mono text-xs text-muted-foreground'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {record.code ?? 'მომხმარებლის სახელი ჯერ არ არის არჩეული'}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="max-w-64 whitespace-normal wrap-anywhere text-muted-foreground">
                {record.jobTitle || 'არ არის მითითებული'}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {parseRoles(record.roles)
                  .map((role) => roleLabels[role])
                  .join(', ')}
              </TableCell>
              <TableCell>
                <Badge variant={status.variant}>{status.label}</Badge>
              </TableCell>
              <TableCell className="pr-5">
                <IconChevronRight
                  className="mx-auto size-4"
                  aria-hidden="true"
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
