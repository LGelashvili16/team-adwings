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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '#/components/ui/field'
import { Textarea } from '#/components/ui/textarea'
import { Spinner } from '#/components/ui/spinner'
import { withdrawAwardSchema } from '../award-proposals.schemas'
import { cancelAwardProposal } from '../award-proposals.functions'
import { awardKey } from '../award-proposals.queries'
import type { AwardSummary } from '../award-proposals.types'

export function AwardWithdrawal({
  actorId,
  record,
  open,
  onClose,
}: {
  actorId: string
  record: AwardSummary
  open: boolean
  onClose: () => void
}) {
  const [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof cancelAwardProposal>[0]) =>
      cancelAwardProposal(input),
    retry: false,
  })
  const form = useForm({
    defaultValues: { reason: '' },
    validators: { onSubmit: withdrawAwardSchema.pick({ reason: true }) },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document.getElementById('award-withdraw-reason')?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await mutation.mutateAsync({
          data: {
            proposalId: record.proposalId,
            expectedVersion: record.current.version,
            requestId,
            reason: value.reason,
          },
        })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success('განაცხადი გაუქმებულია.')
        void client.invalidateQueries({ queryKey: awardKey(actorId) })
        onClose()
      } catch {
        const message = 'განაცხადი ვერ გაუქმდა. სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
  })
  return (
    <form.Subscribe selector={(s) => s.isSubmitting}>
      {(pending) => (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!next && !pending) onClose()
          }}
        >
          <DialogContent showCloseButton={!pending}>
            <DialogHeader>
              <DialogTitle>განაცხადის გაუქმება</DialogTitle>
              <DialogDescription>
                ჩანაწერი და მისი ისტორია შენარჩუნდება. იმავე წყაროს შესწორება
                ამავე განაცხადით უნდა მოხდეს.
              </DialogDescription>
            </DialogHeader>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
              }}
            >
              <FieldGroup>
                <form.Field name="reason">
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.isTouched && !field.state.meta.isValid
                      }
                    >
                      <FieldLabel htmlFor="award-withdraw-reason">
                        გაუქმების საფუძველი <span aria-hidden="true">*</span>
                      </FieldLabel>
                      <Textarea
                        id="award-withdraw-reason"
                        required
                        disabled={pending}
                        maxLength={500}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid
                        }
                        aria-describedby={
                          !field.state.meta.isValid
                            ? 'award-withdraw-reason-error'
                            : undefined
                        }
                      />
                      <FieldError
                        id="award-withdraw-reason-error"
                        errors={field.state.meta.errors}
                      />
                    </Field>
                  )}
                </form.Field>
                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
              </FieldGroup>
              <DialogFooter className="mt-5">
                <Button variant="outline" disabled={pending} onClick={onClose}>
                  დაბრუნება
                </Button>
                <Button type="submit" disabled={pending} aria-busy={pending}>
                  <span
                    className="flex size-4 items-center justify-center"
                    aria-hidden="true"
                  >
                    {pending ? <Spinner /> : null}
                  </span>
                  განაცხადის გაუქმება
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </form.Subscribe>
  )
}
