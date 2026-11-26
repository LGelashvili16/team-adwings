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
import { monthlyRemoveFormSchema } from '../monthly.schemas'
import { deleteMonthlyEmployee } from '../monthly.functions'
import { monthlyKey } from '../monthly.queries'
import { formatGeorgianMonth } from '#/lib/date-format'

export function MonthlyRemoveDialog({
  actorId,
  month,
  open,
  onClose,
  employee,
  onRemoved,
}: {
  actorId: string
  month: string
  open: boolean
  onClose: () => void
  employee: { userId: string; version: number }
  onRemoved?: () => void
}) {
  const [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (reason: string) =>
      deleteMonthlyEmployee({
        data: {
          month,
          userId: employee.userId,
          expectedVersion: employee.version,
          reason,
          requestId,
        },
      }),
    retry: false,
  })
  const form = useForm({
    defaultValues: { reason: '' },
    validators: { onSubmit: monthlyRemoveFormSchema },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document.getElementById('monthly-remove-reason')?.focus(),
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
        toast.success('ჩანაწერი ამოღებულია. ისტორია შენარჩუნებულია.')
        void client.invalidateQueries({ queryKey: monthlyKey(actorId) })
        onClose()
        onRemoved?.()
      } catch {
        const message =
          'მოქმედება ვერ შესრულდა. გადაამოწმეთ უწყისი და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
  const label = 'ჩანაწერის ამოღება'
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
            {formatGeorgianMonth(month)}. თანამშრომლის ჩანაწერი ამოიღება ამ თვის
            სიიდან. ისტორია დარჩება.
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
                <FieldLabel htmlFor="monthly-remove-reason">
                  მიზეზი <span aria-hidden="true">*</span>
                </FieldLabel>
                <Textarea
                  id="monthly-remove-reason"
                  required
                  disabled={mutation.isPending}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  maxLength={500}
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby={
                    !field.state.meta.isValid
                      ? 'monthly-remove-error'
                      : undefined
                  }
                />
                <FieldError
                  id="monthly-remove-error"
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
