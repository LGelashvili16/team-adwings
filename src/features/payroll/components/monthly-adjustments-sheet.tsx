import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  IconAlertCircle,
  IconDeviceFloppy,
  IconInfoCircle,
  IconReceipt,
} from '@tabler/icons-react'
import { DraftSheet } from '#/components/common/draft-sheet'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Field, FieldLabel } from '#/components/ui/field'
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import { formatGeorgianMonth } from '#/lib/date-format'
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
  const editable = canEdit && view && !view.closed && employee?.id !== actorId

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
        <SheetHeader className="shrink-0 flex-row items-center gap-3 border-b p-4 pr-14 sm:p-6 sm:pr-16">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconReceipt className="size-5" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle className="text-base leading-snug wrap-anywhere">
              {initialEmployee?.label ?? 'ბონუსის, პრემიის ან ჯარიმის დამატება'}
            </SheetTitle>
            <SheetDescription>{formatGeorgianMonth(month)}</SheetDescription>
          </div>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
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
            editable ? (
              <MonthlyEntryForm
                key={employee.id}
                actorId={actorId}
                month={month}
                userId={employee.id}
                source={null}
                current={view.current}
                firstPaymentEnabled={view.firstPaymentEnabled}
                defaultFineStage={view.defaultFineStage}
                paymentWindows={view.paymentWindows}
                payments={view.payments}
                showSubmit={false}
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
                  <dl className="divide-y rounded-xl border bg-card text-sm">
                    {view.current.adjustments.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-start justify-between gap-3 p-4"
                      >
                        <dt className="flex min-w-0 flex-col items-start gap-1.5">
                          <Badge
                            variant={item.kind === 'fine' ? 'red' : 'secondary'}
                          >
                            {monthlyAdjustmentLabels[item.kind]}
                          </Badge>
                          {item.reason ? (
                            <span className="block wrap-anywhere text-muted-foreground">
                              {item.reason}
                            </span>
                          ) : null}
                        </dt>
                        <dd className="shrink-0 font-medium tabular-nums">
                          {formatSalary(item)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <Empty className="rounded-xl border border-dashed">
                    <EmptyHeader>
                      <EmptyTitle>
                        ამ თვეში დამატებითი ჩანაწერები ჯერ არ არის
                      </EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                )}
              </>
            )
          ) : null}
        </div>
        {editable ? (
          <SheetFooter className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-2 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex sm:flex-row sm:justify-end sm:px-6">
            <Button
              type="button"
              variant="outline"
              depth="raised"
              disabled={pending}
              onClick={onClose}
            >
              გაუქმება
            </Button>
            <Button
              type="submit"
              form="monthly-entry-form"
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? (
                <Spinner />
              ) : (
                <IconDeviceFloppy aria-hidden="true" data-icon="inline-start" />
              )}
              ჩანაწერის შენახვა
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </DraftSheet>
  )
}
