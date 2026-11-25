import { IconAlertCircle } from '@tabler/icons-react'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '#/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '#/components/ui/field'
import { Textarea } from '#/components/ui/textarea'
import { Spinner } from '#/components/ui/spinner'
import { monthlyDecisionFormSchema } from '../monthly.schemas'
import { setMonthlyDecision, deleteMonthlyEmployee } from '../monthly.functions'
import { monthlyKey } from '../monthly.queries'
import { formatGeorgianMonth } from '#/lib/date-format'

export function MonthlyDecisionDialog({
  actorId,
  month,
  token,
  closed,
  open,
  onClose,
  employee,
  onRemoved,
}: {
  actorId: string
  month: string
  token: string
  closed: boolean
  open: boolean
  onClose: () => void
  employee?: { userId: string; version: number }
  onRemoved?: () => void
}) {
  const [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (reason: string) =>
      employee
        ? deleteMonthlyEmployee({
            data: {
              month,
              userId: employee.userId,
              expectedVersion: employee.version,
              reason,
              requestId,
            },
          })
        : setMonthlyDecision({
            data: {
              month,
              expectedToken: token,
              action: closed ? 'reopen' : 'finalize',
              reason,
              requestId,
            },
          }),
    retry: false,
  })
  const form = useForm({
    defaultValues: { reason: '' },
    validators: { onSubmit: monthlyDecisionFormSchema },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document.getElementById('monthly-decision-reason')?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await mutation.mutateAsync(value.reason)
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success(
          employee
            ? 'ჩანაწერი ამოღებულია. ისტორია შენარჩუნებულია.'
            : closed
              ? 'უწყისი ცვლილებისთვის გახსნილია.'
              : 'თვის უწყისი დასრულებულია.',
        )
        void client.invalidateQueries({ queryKey: monthlyKey(actorId) })
        onClose()
        if (employee) onRemoved?.()
      } catch {
        const message =
          'მოქმედება ვერ შესრულდა. გადაამოწმეთ უწყისი და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
  const label = employee
    ? 'ჩანაწერის ამოღება'
    : closed
      ? 'უწყისის გახსნა'
      : 'თვის დასრულება'
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onClose()
      }}
    >
      <DialogContent showCloseButton={!mutation.isPending}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {formatGeorgianMonth(month)}.{' '}
            {employee
              ? 'თანამშრომლის ჩანაწერი ამოიღება ამ თვის სიიდან. ისტორია დარჩება.'
              : closed
                ? 'თანამშრომლები ამ თვის უწყისს ხელახლა დასრულებამდე ვერ ნახავენ. თანხების შეცვლა ხელმისაწვდომი გახდება.'
                : 'თვის ყველა შენახული ჩანაწერი ჩაიკეტება და თანამშრომლები საკუთარ უწყისებს ნახავენ. ეს მოქმედება საბანკო გადარიცხვას არ ასრულებს.'}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-5"
        >
          {error ? (
            <Alert variant="destructive">
              <IconAlertCircle aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <form.Field name="reason">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor="monthly-decision-reason">
                  მიზეზი <span aria-hidden="true">*</span>
                </FieldLabel>
                <Textarea
                  id="monthly-decision-reason"
                  required
                  disabled={mutation.isPending}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  maxLength={500}
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby={
                    !field.state.meta.isValid
                      ? 'monthly-decision-error'
                      : undefined
                  }
                />
                <FieldError
                  id="monthly-decision-error"
                  errors={field.state.meta.errors}
                />
              </Field>
            )}
          </form.Field>
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
              disabled={mutation.isPending}
              aria-busy={mutation.isPending}
            >
              {mutation.isPending ? <Spinner /> : null}
              {label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
