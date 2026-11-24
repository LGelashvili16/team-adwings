import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
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
    <Card>
      <CardHeader>
        <CardTitle>გამოთვლის წესები</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
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
                  თანხის საწყისი ტიპი <span aria-hidden="true">*</span>
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
                    {Object.entries(amountBasisLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  თანამშრომლის ხელფასის განსაზღვრისას ნაგულისხმევი არჩევანი.
                </FieldDescription>
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
                  ფიქსირებული ხელფასის დღიური თანხა{' '}
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
                      invalid
                        ? 'payroll-dayBasis-description payroll-dayBasis-error'
                        : 'payroll-dayBasis-description'
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
                <FieldDescription id="payroll-dayBasis-description">
                  გაცდენა თავდაპირველად გაფრთხილებაა. თანხის დაქვითვას ცალკე
                  დამტკიცება დასჭირდება.
                </FieldDescription>
                <FieldError
                  id="payroll-dayBasis-error"
                  errors={invalid ? field.state.meta.errors : []}
                />
              </Field>
            )
          }}
        </form.Field>
      </CardContent>
    </Card>
  )
}
