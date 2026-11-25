import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
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
  FieldLabel,
  FieldGroup,
  FieldError,
} from '#/components/ui/field'
import { Textarea } from '#/components/ui/textarea'
import { Spinner } from '#/components/ui/spinner'
import { awardReviewFormSchema } from '../award-review.schemas'
import { decideAwardProposal } from '../award-proposals.functions'
import { reviewAwardPool, cancelAwardPool } from '../award-pools.functions'
import { awardKey } from '../award-proposals.queries'

export type AwardDecision = 'approved' | 'rejected' | 'revoked' | 'withdrawn'
const labels = {
  approved: 'დამტკიცება',
  rejected: 'უარყოფა',
  revoked: 'დამტკიცების გაუქმება',
  withdrawn: 'ფონდის გაუქმება',
}
export function AwardReviewDialog({
  actorId,
  target,
  decision,
  open,
  onClose,
}: {
  actorId: string
  target: {
    kind: 'individual' | 'pool'
    id: string
    version: number
    label: string
  }
  decision: AwardDecision
  open: boolean
  onClose: () => void
}) {
  const [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    client = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (value: {
      reason: string
      evidenceVerified: boolean
    }) => {
      const data = {
        expectedVersion: target.version,
        requestId,
        reason: value.reason,
      }
      if (decision === 'withdrawn')
        return cancelAwardPool({ data: { ...data, poolId: target.id } })
      const reviewed = {
        ...data,
        decision,
        evidenceVerified: value.evidenceVerified,
      }
      return target.kind === 'pool'
        ? reviewAwardPool({ data: { ...reviewed, poolId: target.id } })
        : decideAwardProposal({ data: { ...reviewed, proposalId: target.id } })
    },
    retry: false,
  })
  const form = useForm({
    defaultValues: {
      reason: '',
      decision: decision === 'withdrawn' ? ('rejected' as const) : decision,
      evidenceVerified: false,
    },
    validators: { onSubmit: awardReviewFormSchema },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            '#award-review-form [aria-invalid="true"]',
          )
          ?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await mutation.mutateAsync(value)
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        toast.success('გადაწყვეტილება შენახულია.')
        void client.invalidateQueries({ queryKey: awardKey(actorId) })
        onClose()
      } catch {
        const message =
          'გადაწყვეტილება ვერ შეინახა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
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
              <DialogTitle>{labels[decision]}</DialogTitle>
              <DialogDescription>
                {target.label}
                {target.kind === 'pool'
                  ? '. გადაწყვეტილება ერთდროულად ყველა წილზე გავრცელდება.'
                  : '. გადაწყვეტილება ისტორიის ახალ ვერსიად შეინახება.'}
              </DialogDescription>
            </DialogHeader>
            <form
              id="award-review-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
              }}
            >
              <fieldset disabled={pending}>
                <FieldGroup>
                  {decision === 'approved' ? (
                    <>
                      <Alert variant="info">
                        <AlertDescription>
                          გადაამოწმეთ წყარო, შესრულებული რაოდენობა, მინიჭების
                          პირობა და თანხა. გარე წყაროს ნომერი შესრულების
                          ავტომატური დასტური არ არის. დამტკიცება თანხის გადახდას
                          არ ნიშნავს.
                        </AlertDescription>
                      </Alert>
                      <form.Field name="evidenceVerified">
                        {(field) => {
                          const invalid =
                            field.state.meta.isTouched &&
                            !field.state.meta.isValid
                          return (
                            <Field data-invalid={invalid}>
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  id="award-reviewed"
                                  checked={field.state.value}
                                  onCheckedChange={(v) =>
                                    field.handleChange(v === true)
                                  }
                                  onBlur={field.handleBlur}
                                  aria-required="true"
                                  aria-invalid={invalid}
                                  aria-describedby={
                                    invalid ? 'award-reviewed-error' : undefined
                                  }
                                />
                                <FieldLabel
                                  htmlFor="award-reviewed"
                                  className="leading-relaxed"
                                >
                                  დამოუკიდებლად გადავამოწმე მტკიცებულება, ყველა
                                  ბენეფიციარი და თანხა{' '}
                                  <span aria-hidden="true">*</span>
                                </FieldLabel>
                              </div>
                              <FieldError
                                id="award-reviewed-error"
                                errors={field.state.meta.errors}
                              />
                            </Field>
                          )
                        }}
                      </form.Field>
                    </>
                  ) : null}
                  <form.Field name="reason">
                    {(field) => {
                      const invalid =
                        field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={invalid}>
                          <FieldLabel htmlFor="award-review-reason">
                            გადაწყვეტილების საფუძველი{' '}
                            <span aria-hidden="true">*</span>
                          </FieldLabel>
                          <Textarea
                            id="award-review-reason"
                            required
                            rows={3}
                            maxLength={500}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            aria-invalid={invalid}
                            aria-describedby={
                              invalid
                                ? 'award-review-reason-error'
                                : 'award-review-reason-help'
                            }
                          />
                          <p
                            id="award-review-reason-help"
                            className="text-sm text-muted-foreground"
                          >
                            მიუთითეთ შემოწმებული საბუთი ან ჩანაწერი და
                            გადაწყვეტილების მიზეზი.
                          </p>
                          <FieldError
                            id="award-review-reason-error"
                            errors={field.state.meta.errors}
                          />
                        </Field>
                      )
                    }}
                  </form.Field>
                  {error ? (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}
                </FieldGroup>
                <DialogFooter className="mt-5">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={onClose}
                  >
                    დაბრუნება
                  </Button>
                  <Button type="submit" disabled={pending} aria-busy={pending}>
                    <span
                      className="flex size-4 items-center justify-center"
                      aria-hidden="true"
                    >
                      {pending ? <Spinner /> : null}
                    </span>
                    {labels[decision]}
                  </Button>
                </DialogFooter>
              </fieldset>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </form.Subscribe>
  )
}
