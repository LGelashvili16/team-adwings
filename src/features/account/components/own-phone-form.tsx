import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconDeviceFloppy, IconPhone } from '@tabler/icons-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '#/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { Field, FieldError, FieldLabel } from '#/components/ui/field'
import type { ownPhoneSchema } from '#/features/access/access.schemas'
import { updateOwnProfilePhone } from '../account.functions'
import { ownProfileQueryOptions } from '../account.queries'

const PHONE_PREFIX = '+995'

function stripPhonePrefix(value: string) {
  return value.trimStart().replace(/^\+995[\s-]*/, '')
}

const ownPhoneFormSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(32, 'ტელეფონის ნომერი ძალიან გრძელია.')
    .transform((value) => {
      const local = stripPhonePrefix(value).trim()
      return local ? `${PHONE_PREFIX} ${local}` : ''
    })
    .refine((value) => {
      if (value === '') return true
      if (value.length > 32) return false
      if (!/^\+995 [0-9][0-9 ()-]{4,25}[0-9]$/.test(value)) return false
      const localDigits = value.slice(PHONE_PREFIX.length).replace(/\D/g, '')
      return localDigits.length === 9
    }, 'მიუთითეთ სწორი ტელეფონის ნომერი.')
    .default(''),
})

export function OwnPhoneForm({
  actorId,
  phone,
}: {
  actorId: string
  phone: string | null
}) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (data: z.input<typeof ownPhoneSchema>) =>
      updateOwnProfilePhone({ data }),
    retry: false,
    gcTime: 0,
  })
  const defaultValues: z.input<typeof ownPhoneFormSchema> = {
    phone: stripPhonePrefix(phone ?? ''),
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: ownPhoneFormSchema },
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const parsed = ownPhoneFormSchema.parse(value)
        const result = await mutation.mutateAsync(parsed)
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        await client.invalidateQueries({
          queryKey: ownProfileQueryOptions(actorId).queryKey,
        })
        toast.success('ტელეფონის ნომერი შენახულია.')
      } catch {
        const message = 'ტელეფონის ნომერი ვერ შეინახა. სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      } finally {
        mutation.reset()
      }
    },
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="phone">
        {(field) => (
          <Field data-invalid={!field.state.meta.isValid}>
            <FieldLabel htmlFor="own-phone">ტელეფონის ნომერი</FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <InputGroup className="sm:max-w-xs">
                <InputGroupAddon>
                  <IconPhone aria-hidden="true" />
                  <InputGroupText className="tabular-nums">
                    {PHONE_PREFIX}
                  </InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="own-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="5XX XX XX XX"
                  maxLength={27}
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(stripPhonePrefix(event.target.value))
                  }
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby="own-phone-error"
                />
              </InputGroup>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(pending) => (
                  <Button type="submit" disabled={pending} aria-busy={pending}>
                    <span className="flex size-4 items-center justify-center">
                      {pending ? (
                        <Spinner aria-hidden="true" />
                      ) : (
                        <IconDeviceFloppy aria-hidden="true" />
                      )}
                    </span>
                    შენახვა
                  </Button>
                )}
              </form.Subscribe>
            </div>
            {/* <FieldDescription>
              ნომერი გამოიყენება საკონტაქტო ინფორმაციად. გასაწმენდად დატოვეთ
              ველი ცარიელი.
            </FieldDescription> */}
            <FieldError id="own-phone-error" errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
