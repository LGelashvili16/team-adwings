import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react'
import { DraftSheet } from '#/components/common/draft-sheet'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Field, FieldLabel } from '#/components/ui/field'
import { SheetContent, SheetHeader, SheetTitle } from '#/components/ui/sheet'
import { Skeleton } from '#/components/ui/skeleton'
import { monthlyEmployeeQuery } from '../monthly.queries'
import { monthlyAdjustmentLabels } from '../monthly.rules'
import { formatSalary } from '../salary.presentation'
import { MonthlyEntryForm } from './monthly-entry-form'
import { PayrollEmployeePicker } from './payroll-employee-picker'

export function MonthlyAdjustmentsSheet({
  actorId,
  month,
  initialEmployee,
  canEdit,
  open,
  onClose,
}: {
  actorId: string
  month: string
  initialEmployee: { id: string; label: string } | null
  canEdit: boolean
  open: boolean
  onClose: () => void
}) {
  const [employee, setEmployee] = useState(initialEmployee)
  const [pending, setPending] = useState(false)
  const query = useQuery({
    ...monthlyEmployeeQuery(actorId, month, employee?.id ?? '', 1),
    enabled: open && employee !== null,
  })
  const view = query.data?.ok ? query.data.value : null

  return (
    <DraftSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <SheetContent
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        showCloseButton={!pending}
      >
        <SheetHeader className="shrink-0 border-b p-5 pr-16 sm:p-6 sm:pr-16">
          <SheetTitle>
            {initialEmployee?.label ?? 'ბონუსის, პრემიის ან ჯარიმის დამატება'}
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
          {canEdit && !initialEmployee ? (
            <Field>
              <FieldLabel htmlFor="adjustment-employee">
                თანამშრომელი <span aria-hidden="true">*</span>
              </FieldLabel>
              <PayrollEmployeePicker
                id="adjustment-employee"
                actorId={actorId}
                value={employee}
                onChange={setEmployee}
                disabled={pending}
              />
            </Field>
          ) : null}
          {employee && query.isPending ? (
            <div
              role="status"
              aria-label="დამატებითი ჩანაწერები იტვირთება"
              aria-busy="true"
            >
              <Skeleton className="h-40" aria-hidden="true" />
            </div>
          ) : employee && !view ? (
            <Alert variant="destructive">
              <IconAlertCircle aria-hidden="true" />
              <AlertDescription>
                {query.data && !query.data.ok
                  ? query.data.message
                  : 'ჩანაწერი ვერ ჩაიტვირთა. ხელახლა გახსენით ფანჯარა.'}
              </AlertDescription>
            </Alert>
          ) : employee && view ? (
            canEdit && !view.closed && employee.id !== actorId ? (
              <MonthlyEntryForm
                key={employee.id}
                actorId={actorId}
                month={month}
                userId={employee.id}
                source={null}
                current={view.current}
                onSaved={onClose}
                onPending={setPending}
              />
            ) : (
              <>
                {canEdit && employee.id === actorId && !view.closed ? (
                  <Alert variant="info" role="status">
                    <IconInfoCircle aria-hidden="true" />
                    <AlertDescription>
                      საკუთარი ჩანაწერის შეცვლა დაუშვებელია.
                    </AlertDescription>
                  </Alert>
                ) : null}
                {view.current &&
                view.current.status !== 'voided' &&
                view.current.adjustments.length > 0 ? (
                  <dl className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                    {view.current.adjustments.map((item, index) => (
                      <div
                        key={index}
                        className="col-span-2 grid grid-cols-subgrid gap-3"
                      >
                        <dt>
                          {monthlyAdjustmentLabels[item.kind]}
                          {item.reason ? (
                            <span className="block wrap-anywhere text-muted-foreground">
                              {item.reason}
                            </span>
                          ) : null}
                        </dt>
                        <dd className="tabular-nums">{formatSalary(item)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    ამ თვეში დამატებითი ჩანაწერები ჯერ არ არის.
                  </p>
                )}
              </>
            )
          ) : null}
        </div>
      </SheetContent>
    </DraftSheet>
  )
}
