import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { Separator } from '#/components/ui/separator'
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import { updateGpsDevice } from '../gps.functions'
import {
  GPS_PHONE_PREFIX,
  gpsCreateDeviceSchema,
  gpsDeviceSchema,
  stripGpsPhonePrefix,
} from '../gps.schemas'
import { gpsKey } from '../gps.queries'
import type { z } from 'zod'
import type { GpsDeviceRow } from '../gps.queries'

export function GpsDeviceEditor({
  device,
  actorId,
  close,
  onBusyChange,
}: {
  device: GpsDeviceRow | null
  actorId: string
  close: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const save = useServerFn(updateGpsDevice)
  const [error, setError] = useState('')
  const schema = device ? gpsDeviceSchema : gpsCreateDeviceSchema
  const defaultValues: z.input<typeof gpsDeviceSchema> = {
    name: device?.name ?? '',
    reportedId: device?.reportedId ?? '',
    phone: stripGpsPhonePrefix(device?.phone ?? ''),
    enabled: device?.enabled ?? true,
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setError('')
      onBusyChange(true)
      try {
        const parsed = schema.parse(value)
        const result = await save({
          data: device
            ? { ...parsed, id: device.id, version: device.version }
            : { ...parsed, id: null, version: null },
        })
        if (!result) {
          const message = device
            ? 'მოწყობილობის მონაცემები შეიცვალა. დახურეთ ფორმა და გახსენით ხელახლა.'
            : 'ამ იდენტიფიკატორით მოწყობილობა უკვე არსებობს.'
          setError(message)
          toast.error(message)
          void client.invalidateQueries({ queryKey: gpsKey(actorId) })
          return
        }
        toast.success('მოწყობილობა შენახულია.')
        void client.invalidateQueries({ queryKey: gpsKey(actorId) })
        close()
      } catch {
        const message = 'შენახვა ვერ მოხერხდა. სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      } finally {
        onBusyChange(false)
      }
    },
  })

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(pending) => (
        <SheetContent
          className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-sm"
          showCloseButton={!pending}
        >
          <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <SheetTitle>
              {device ? 'მოწყობილობის რედაქტირება' : 'მოწყობილობის დამატება'}
            </SheetTitle>
            <SheetDescription>პროტოკოლი: JT808</SheetDescription>
          </SheetHeader>
          <form
            method="post"
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
            noValidate
          >
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <Card>
                <CardContent>
                  <FieldGroup className="gap-4">
                    <form.Field name="name">
                      {(field) => (
                        <Field data-invalid={!field.state.meta.isValid}>
                          <FieldLabel htmlFor="gps-name">
                            სახელი{' '}
                            <span
                              aria-hidden="true"
                              className="text-destructive"
                            >
                              *
                            </span>
                          </FieldLabel>
                          <Input
                            id="gps-name"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            aria-invalid={!field.state.meta.isValid}
                            aria-describedby="gps-name-error"
                            required
                            maxLength={100}
                            disabled={pending}
                          />
                          <FieldError
                            id="gps-name-error"
                            errors={field.state.meta.errors}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="reportedId">
                      {(field) => (
                        <Field data-invalid={!field.state.meta.isValid}>
                          <FieldLabel htmlFor="gps-id">
                            GPS მოწყობილობის იდენტიფიკატორი{' '}
                            <span
                              aria-hidden="true"
                              className="text-destructive"
                            >
                              *
                            </span>
                          </FieldLabel>
                          <Input
                            id="gps-id"
                            inputMode="numeric"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            aria-invalid={!field.state.meta.isValid}
                            aria-describedby="gps-id-error"
                            required
                            maxLength={20}
                            readOnly={Boolean(device)}
                            disabled={pending}
                          />
                          <FieldError
                            id="gps-id-error"
                            errors={field.state.meta.errors}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="phone">
                      {(field) => (
                        <Field data-invalid={!field.state.meta.isValid}>
                          <FieldLabel htmlFor="gps-phone">
                            ტელეფონის ნომერი
                            {!device && (
                              <span
                                aria-hidden="true"
                                className="text-destructive"
                              >
                                *
                              </span>
                            )}
                          </FieldLabel>
                          <InputGroup>
                            <InputGroupAddon>
                              <InputGroupText className="tabular-nums">
                                {GPS_PHONE_PREFIX}
                              </InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput
                              id="gps-phone"
                              name="phone"
                              type="tel"
                              inputMode="tel"
                              autoComplete="off"
                              placeholder="5XX XX XX XX"
                              value={field.state.value ?? ''}
                              onChange={(event) =>
                                field.handleChange(
                                  stripGpsPhonePrefix(event.target.value),
                                )
                              }
                              onBlur={field.handleBlur}
                              aria-invalid={!field.state.meta.isValid}
                              aria-describedby="gps-phone-error"
                              required={!device}
                              maxLength={27}
                              disabled={pending}
                            />
                          </InputGroup>
                          <FieldError
                            id="gps-phone-error"
                            errors={field.state.meta.errors}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <Separator />
                    <form.Field name="enabled">
                      {(field) => (
                        <Field orientation="horizontal">
                          <FieldLabel htmlFor="gps-enabled">
                            მოწყობილობა ჩართულია
                          </FieldLabel>
                          <Switch
                            id="gps-enabled"
                            checked={field.state.value}
                            onCheckedChange={field.handleChange}
                            disabled={pending}
                          />
                        </Field>
                      )}
                    </form.Field>
                    {error && <FieldError role="alert">{error}</FieldError>}
                  </FieldGroup>
                </CardContent>
              </Card>
            </div>
            <SheetFooter className="shrink-0 border-t px-5 py-4">
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending && <Spinner />} შენახვა
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      )}
    </form.Subscribe>
  )
}
