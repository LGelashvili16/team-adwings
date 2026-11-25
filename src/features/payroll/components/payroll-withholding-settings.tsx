import { IconReceiptTax } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Switch } from '#/components/ui/switch'
import type { PayrollSettingsForm } from '../hooks/use-payroll-settings-form'

const rates = [
  {
    name: 'incomeTaxBasisPoints',
    label: 'საშემოსავლო გადასახადი (%)',
    enabled: 'incomeTaxEnabled',
  },
  {
    name: 'employeePensionBasisPoints',
    label: 'დასაქმებულის საპენსიო (%)',
    enabled: 'pensionEnabled',
  },
  {
    name: 'employerPensionBasisPoints',
    label: 'დამსაქმებლის საპენსიო (%)',
    enabled: 'pensionEnabled',
  },
] as const

export function PayrollWithholdingSettings({
  form,
}: {
  form: PayrollSettingsForm
}) {
  return (
    <Card className="min-w-0 rounded-2xl sm:[--card-spacing:--spacing(5)]">
      <CardHeader className="border-b border-border/70">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <IconReceiptTax className="size-5" aria-hidden="true" />
          </span>
          <h2>გადასახადები და საპენსიო</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FieldGroup className="gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
          <form.Field name="incomeTaxEnabled">
            {(field) => (
              <Field orientation="horizontal" className="justify-between gap-4">
                <FieldLabel htmlFor="payroll-incomeTaxEnabled">
                  საშემოსავლოს გამოთვლა
                </FieldLabel>
                <Switch
                  id="payroll-incomeTaxEnabled"
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                  onBlur={field.handleBlur}
                />
              </Field>
            )}
          </form.Field>
          <RateField form={form} rate={rates[0]} />
        </FieldGroup>
        <FieldGroup className="gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
          <form.Field name="pensionEnabled">
            {(field) => (
              <Field orientation="horizontal" className="justify-between gap-4">
                <FieldLabel htmlFor="payroll-pensionEnabled">
                  საპენსიოს გამოთვლა
                </FieldLabel>
                <Switch
                  id="payroll-pensionEnabled"
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                  onBlur={field.handleBlur}
                />
              </Field>
            )}
          </form.Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <RateField form={form} rate={rates[1]} />
            <RateField form={form} rate={rates[2]} />
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function RateField({
  form,
  rate,
}: {
  form: PayrollSettingsForm
  rate: (typeof rates)[number]
}) {
  return (
    <form.Subscribe selector={(state) => state.values[rate.enabled]}>
      {(enabled) => (
        <form.Field name={rate.name}>
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            const id = `payroll-${rate.name}`
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={id}>
                  {rate.label} <span aria-hidden="true">*</span>
                </FieldLabel>
                <Input
                  id={id}
                  name={field.name}
                  type="text"
                  inputMode="decimal"
                  required
                  value={field.state.value}
                  disabled={!enabled}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? `${id}-error` : undefined}
                />
                <FieldError
                  id={`${id}-error`}
                  errors={invalid ? field.state.meta.errors : []}
                />
              </Field>
            )
          }}
        </form.Field>
      )}
    </form.Subscribe>
  )
}
