import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Switch } from '#/components/ui/switch'
import { Separator } from '#/components/ui/separator'
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
    <Card>
      <CardHeader>
        <CardTitle>გადასახადები და საპენსიო</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
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
        <form.Subscribe selector={(state) => state.values.incomeTaxEnabled}>
          {(enabled) => (
            <p className="text-sm text-muted-foreground">
              {enabled
                ? 'საშემოსავლო გამოითვლება კანონით განსაზღვრული დასაბეგრი თანხიდან.'
                : 'გამოთვლა გამორთულია. სავალდებულო დაკავებები ბუღალტერმა ცალკე უნდა ასახოს.'}
            </p>
          )}
        </form.Subscribe>
        <RateField form={form} rate={rates[0]} />
        <Separator />
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
        <FieldDescription>
          გამოიყენება სქემაში მონაწილე თანამშრომლებისთვის. დამსაქმებლის წილი
          კომპანიის დამატებითი ხარჯია და ხელზე ასაღებ თანხას არ აკლდება.
        </FieldDescription>
        <p className="text-sm text-muted-foreground">
          სტანდარტული განაკვეთებია 20% საშემოსავლო და 2% + 2% საპენსიო. ცვლილება
          უნდა შეესაბამებოდეს მოქმედ კანონმდებლობას.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <RateField form={form} rate={rates[1]} />
          <RateField form={form} rate={rates[2]} />
        </div>
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
