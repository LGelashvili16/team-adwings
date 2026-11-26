import { useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCalendar,
  IconWallet,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Field, FieldLabel } from '#/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import { formatGeorgianDate, formatGeorgianMonth } from '#/lib/date-format'
import {
  getMonthlyPaymentPreview,
  setMonthlyPayments,
} from '../monthly.functions'
import { paymentPreviewSchema } from '../monthly.schemas'
import { monthlyKey } from '../monthly.queries'
import { payStageLabel, payStageSchema } from '../payroll-settings.schemas'
import { formatSalary } from '../salary.presentation'
import { salaryKey } from '../salary.queries'
import type { PayStageWindow } from '../monthly.types'

export function MonthlyPaymentDialog({
  actorId,
  month,
  windows,
  open,
  onClose,
}: {
  actorId: string
  month: string
  windows: [PayStageWindow, ...PayStageWindow[]]
  open: boolean
  onClose: () => void
}) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState('')
  const client = useQueryClient()
  const form = useForm({
    defaultValues: { stage: windows[0].stage },
    validators: { onSubmit: paymentPreviewSchema.pick({ stage: true }) },
    onSubmit: ({ value }) => {
      if (
        !preview.isFetching &&
        plan?.available &&
        plan.ready.length &&
        value.stage === stage &&
        !mutation.isPending
      )
        mutation.mutate(plan.token)
    },
  })
  const stage = useStore(form.store, (state) => state.values.stage)
  const preview = useQuery({
    queryKey: [...monthlyKey(actorId), 'payment-preview', month, stage],
    queryFn: () => getMonthlyPaymentPreview({ data: { month, stage } }),
    enabled: open,
    retry: false,
    staleTime: 0,
  })
  const plan = preview.data?.ok ? preview.data.value : null
  const mutation = useMutation({
    mutationFn: (expectedToken: string) =>
      setMonthlyPayments({ data: { month, stage, requestId, expectedToken } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.message)
        toast.error(result.message)
        return
      }
      toast.success(
        `გაცემა დადასტურებულია ${result.value.saved} თანამშრომლისთვის.`,
      )
      void client.invalidateQueries({ queryKey: monthlyKey(actorId) })
      void client.invalidateQueries({ queryKey: salaryKey(actorId) })
      onClose()
    },
    onError: () => {
      const message = 'გაცემის დადასტურება ვერ მოხერხდა. სცადეთ ხელახლა.'
      setError(message)
      toast.error(message)
    },
  })
  const total = plan?.ready.reduce((sum, line) => sum + line.totalMinor, 0) ?? 0
  const twice = windows.some((window) => window.stage === 'first')
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onClose()
      }}
    >
      <DialogContent
        showCloseButton={!mutation.isPending}
        className="max-h-[calc(100dvh-2rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="pr-8 text-lg">ხელფასის გაცემა</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {formatGeorgianMonth(month)}. დაადასტურეთ უკვე გადახდილი თანხები.
            ჩანაწერები თანამშრომლებს გამოუჩნდებათ.
          </DialogDescription>
        </DialogHeader>
        <form
          id="payroll-payment-form"
          className="flex min-h-0 flex-col gap-4 overflow-y-auto p-1"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="stage">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="payment-stage">გაცემის ეტაპი</FieldLabel>
                <Select
                  disabled={mutation.isPending}
                  value={field.state.value}
                  onValueChange={(value) => {
                    const parsed = payStageSchema.safeParse(value)
                    if (!parsed.success || parsed.data === field.state.value)
                      return
                    field.handleChange(parsed.data)
                    setRequestId(crypto.randomUUID())
                    setError('')
                  }}
                >
                  <SelectTrigger id="payment-stage" className="w-full">
                    <SelectValue>{payStageLabel(stage, twice)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {windows.map((window) => (
                      <SelectItem key={window.stage} value={window.stage}>
                        {payStageLabel(window.stage, twice)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          {preview.isPending ? (
            <Skeleton
              className="h-24"
              aria-label="გასაცემი თანხები იტვირთება"
            />
          ) : plan ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <IconCalendar className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  {formatGeorgianDate(plan.start)} -{' '}
                  {formatGeorgianDate(plan.end)}
                </span>
              </div>
              {!plan.available ? (
                <Alert variant="info">
                  <IconCalendar aria-hidden="true" />
                  <AlertDescription>
                    გაცემის პერიოდი ჯერ არ დაწყებულა.
                  </AlertDescription>
                </Alert>
              ) : null}
              <section
                aria-label="გასაცემი თანხები"
                className="shrink-0 overflow-hidden rounded-xl border bg-card"
              >
                <div className="flex items-center justify-between gap-3 bg-muted/60 px-3 py-2.5">
                  <h3 className="min-w-0 font-medium">
                    გასაცემია {plan.ready.length} თანამშრომლისთვის
                  </h3>
                  <strong className="shrink-0 text-lg font-semibold tabular-nums">
                    {formatSalary({ amountMinor: total })}
                  </strong>
                </div>
                {plan.ready.length ? (
                  <ul className="max-h-44 divide-y overflow-y-auto border-t">
                    {plan.ready.map((line, index) => (
                      <li
                        key={index}
                        className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 wrap-anywhere">
                          {line.name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatSalary({ amountMinor: line.totalMinor })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              {plan.pending.length ? (
                <Accordion className="rounded-xl border border-badge-orange-foreground/25 bg-badge-orange/35">
                  <AccordionItem value="pending-employees">
                    <AccordionTrigger
                      type="button"
                      className="items-center px-3 py-3 hover:bg-badge-orange/60 hover:no-underline"
                    >
                      <span className="flex min-w-0 items-center gap-2 pr-3">
                        <IconAlertTriangle
                          className="size-4 shrink-0 text-badge-orange-foreground"
                          aria-hidden="true"
                        />
                        გადასამოწმებელია {plan.pending.length} თანამშრომელი
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3">
                      <ul
                        aria-label="გადასამოწმებელი თანამშრომლები"
                        tabIndex={0}
                        className="grid gap-2 rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:max-h-56 sm:overflow-y-auto"
                      >
                        {plan.pending.map((line, index) => (
                          <li
                            key={index}
                            className="grid gap-0.5 rounded-lg border bg-muted px-3 py-2 wrap-anywhere dark:bg-background"
                          >
                            <span className="font-medium">{line.name}</span>
                            <span className="text-muted-foreground">
                              {line.message}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
            </>
          ) : (
            <Alert variant="destructive">
              <IconAlertCircle aria-hidden="true" />
              <AlertDescription>
                {preview.data && !preview.data.ok
                  ? preview.data.message
                  : 'გასაცემი თანხები ვერ ჩაიტვირთა.'}
              </AlertDescription>
            </Alert>
          )}
          {error ? (
            <Alert variant="destructive">
              <IconAlertCircle aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
              <Button
                type="button"
                variant="outline"
                className="col-start-2 w-fit"
                onClick={() => {
                  setError('')
                  setRequestId(crypto.randomUUID())
                  void preview.refetch()
                }}
              >
                სიის განახლება
              </Button>
            </Alert>
          ) : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            გაუქმება
          </Button>
          <Button
            type="submit"
            form="payroll-payment-form"
            aria-busy={mutation.isPending || undefined}
            disabled={
              preview.isFetching ||
              mutation.isPending ||
              !plan?.available ||
              !plan.ready.length
            }
          >
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <IconWallet data-icon="inline-start" aria-hidden="true" />
            )}
            გაცემის დადასტურება
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
