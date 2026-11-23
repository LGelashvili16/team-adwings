import { employeeNetworkOptions } from '../attendance-security.queries'
import { z } from 'zod'
import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { IconInfoCircle, IconNetwork } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Textarea } from '#/components/ui/textarea'
import { Switch } from '#/components/ui/switch'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Skeleton } from '#/components/ui/skeleton'
import { updateAttendanceEmployeeNetwork } from '../attendance-security.functions'
import {
  employeeNetworkSchema,
  parseIpLines,
  securityReasonSchema,
} from '../attendance-security.schemas'
import { SecuritySubmit } from './security-controls'

const schema = z
  .object({
    inherit: z.boolean(),
    ipsText: z.string().max(10000, 'სია ზედმეტად დიდია.'),
    reason: securityReasonSchema,
  })
  .superRefine((value, ctx) => {
    if (
      !value.inherit &&
      !employeeNetworkSchema.shape.allowedIps.safeParse(
        parseIpLines(value.ipsText),
      ).success
    )
      ctx.addIssue({
        code: 'custom',
        path: ['ipsText'],
        message: 'მიუთითეთ მაქსიმუმ 100 ზუსტი IP მისამართი.',
      })
  })
export function EmployeeNetworkCard({
  userId,
  actorId,
}: {
  userId: string
  actorId: string
}) {
  const query = useQuery(employeeNetworkOptions(actorId, userId))
  const allowedIps = query.data?.ok ? query.data.value.allowedIps : undefined
  return (
    <Card className="rounded-2xl py-4 sm:py-5">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-4 sm:px-5">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/70 text-muted-foreground">
            <IconNetwork className="size-4" aria-hidden="true" />
          </span>
          <h2>დაშვებული ქსელები</h2>
        </CardTitle>
        {allowedIps !== undefined ? (
          <Badge variant="secondary">
            {allowedIps === null ? 'კომპანიის სია' : 'ინდივიდუალური'}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="px-4 sm:px-5">
        {query.isPending ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="ქსელის წესები იტვირთება"
          >
            <Skeleton
              className="h-40 rounded-xl motion-reduce:animate-none"
              aria-hidden="true"
            />
          </div>
        ) : query.data?.ok ? (
          <NetworkForm
            key={JSON.stringify(query.data.value)}
            userId={userId}
            allowedIps={query.data.value.allowedIps}
          />
        ) : (
          <Alert variant="destructive">
            <AlertDescription>ქსელის წესები ვერ ჩაიტვირთა.</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
function NetworkForm({
  userId,
  allowedIps,
}: {
  userId: string
  allowedIps: string[] | null
}) {
  const client = useQueryClient()
  const form = useForm({
    defaultValues: {
      inherit: allowedIps === null,
      ipsText: allowedIps?.join(', ') ?? '',
      reason: '',
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const result = await updateAttendanceEmployeeNetwork({
        data: {
          userId,
          allowedIps: value.inherit ? null : parseIpLines(value.ipsText),
          reason: value.reason,
        },
      }).catch(() => null)
      if (!result?.ok) {
        toast.error(result?.message ?? 'ქსელები ვერ შეინახა.')
        return
      }
      toast.success('თანამშრომლის ქსელები შენახულია.')
      await client.invalidateQueries({
        queryKey: ['attendance-security', 'network'],
      })
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
      <FieldGroup className="gap-4">
        <form.Field name="inherit">
          {(field) => (
            <Field
              orientation="horizontal"
              className="rounded-xl border border-border/60 bg-muted/25 px-4 py-3.5"
            >
              <FieldLabel htmlFor="inherit-network">
                კომპანიის საერთო სიის გამოყენება
              </FieldLabel>
              <Switch
                id="inherit-network"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
            </Field>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.inherit}>
          {(inherit) =>
            !inherit ? (
              <form.Field name="ipsText">
                {(field) => (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <FieldLabel htmlFor="employee-network-ips">
                      დაშვებული IP მისამართები
                    </FieldLabel>
                    <Textarea
                      id="employee-network-ips"
                      rows={3}
                      placeholder="მაგ: 185.10.20.30, 185.10.20.31"
                      className="font-mono text-sm"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      aria-invalid={!field.state.meta.isValid}
                      aria-describedby="employee-network-error"
                    />
                    <FieldError
                      id="employee-network-error"
                      errors={field.state.meta.errors}
                    />
                  </Field>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
        <Alert variant="info" role="note">
          <IconInfoCircle aria-hidden="true" />
          <AlertDescription>
            ინდივიდუალური სია კომპანიის დაშვებულ სიას ანაცვლებს. სრულად
            დაბლოკილი IP მისამართები ყოველთვის აკრძალულია.
          </AlertDescription>
        </Alert>
        <form.Field name="reason">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor="employee-network-reason">
                ცვლილების მიზეზი
              </FieldLabel>
              <Textarea
                id="employee-network-reason"
                rows={2}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={!field.state.meta.isValid}
                aria-describedby="employee-network-reason-error"
              />
              <FieldError
                id="employee-network-reason-error"
                errors={field.state.meta.errors}
              />
            </Field>
          )}
        </form.Field>
        <div className="flex justify-end">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(pending) => (
              <SecuritySubmit pending={pending}>
                ქსელების შენახვა
              </SecuritySubmit>
            )}
          </form.Subscribe>
        </div>
      </FieldGroup>
    </form>
  )
}
