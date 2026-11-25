import { IconAdjustmentsHorizontal } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { amountBasisLabels, dayBasisLabels } from '../payroll-settings.schemas'
import type { PayrollSettingsForm } from '../hooks/use-payroll-settings-form'
import { PayrollPolicyDateInput } from './payroll-policy-date-input'

export function PayrollGeneralSettings({
  form,
  today,
}: {
  form: PayrollSettingsForm
  today: string
}) {
  return (
    <Card className="min-w-0 rounded-2xl sm:[--card-spacing:--spacing(5)]">
      <CardHeader className="border-b border-border/70">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <IconAdjustmentsHorizontal className="size-5" aria-hidden="true" />
          </span>
          <h2>გამოთვლის წესები</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <form.Field name="effectiveFrom">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="payroll-effectiveFrom">
                    მოქმედების თარიღი <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <PayrollPolicyDateInput
                    value={field.state.value}
                    minimum={today}
                    invalid={invalid}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                  <FieldError
                    id="payroll-effectiveFrom-error"
                    errors={invalid ? field.state.meta.errors : []}
                  />
                </Field>
              )
            }}
          </form.Field>
          <form.Field name="amountBasis">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="payroll-amountBasis">
                    ახალი ხელფასის თანხის ტიპი <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <Select
                    items={Object.entries(amountBasisLabels).map(
                      ([value, label]) => ({ value, label }),
                    )}
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (value === 'gross' || value === 'net')
                        field.handleChange(value)
                    }}
                  >
                    <SelectTrigger
                      id="payroll-amountBasis"
                      className="w-full"
                      onBlur={field.handleBlur}
                      aria-required="true"
                      aria-invalid={invalid}
                      aria-describedby={
                        invalid ? 'payroll-amountBasis-error' : undefined
                      }
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(amountBasisLabels).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <FieldError
                    id="payroll-amountBasis-error"
                    errors={invalid ? field.state.meta.errors : []}
                  />
                </Field>
              )
            }}
          </form.Field>
          <form.Field name="dayBasis">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="payroll-dayBasis">
                    დღიური თანხის გამოთვლის წესი{' '}
                    <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <Select
                    items={Object.entries(dayBasisLabels).map(
                      ([value, label]) => ({ value, label }),
                    )}
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (
                        value === 'scheduled_workdays' ||
                        value === 'calendar_days' ||
                        value === 'fixed_30'
                      )
                        field.handleChange(value)
                    }}
                  >
                    <SelectTrigger
                      id="payroll-dayBasis"
                      className="w-full"
                      onBlur={field.handleBlur}
                      aria-required="true"
                      aria-invalid={invalid}
                      aria-describedby={
                        invalid ? 'payroll-dayBasis-error' : undefined
                      }
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(dayBasisLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    id="payroll-dayBasis-error"
                    errors={invalid ? field.state.meta.errors : []}
                  />
                </Field>
              )
            }}
          </form.Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
