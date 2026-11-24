import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldError, FieldLabel } from '#/components/ui/field'
import { Textarea } from '#/components/ui/textarea'
import { Spinner } from '#/components/ui/spinner'
import { usePayrollSettingsForm } from '../hooks/use-payroll-settings-form'
import type { PayrollSettingsView } from '../payroll-settings.queries'
import { PayrollGeneralSettings } from './payroll-general-settings'
import { PayrollWithholdingSettings } from './payroll-withholding-settings'

export function PayrollSettingsForm({
  actorId,
  initial,
}: {
  actorId: string
  initial: PayrollSettingsView
}) {
  const { form, error } = usePayrollSettingsForm(actorId, initial)
  return (
    <form
      id="payroll-settings-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col gap-6"
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <fieldset disabled={pending} className="contents">
            <div className="grid items-start gap-6 xl:grid-cols-2">
              <PayrollGeneralSettings form={form} today={initial.today} />
              <PayrollWithholdingSettings form={form} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>ცვლილების შენახვა</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <form.Field name="reason">
                  {(field) => {
                    const invalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={invalid}>
                        <FieldLabel htmlFor="payroll-reason">
                          ცვლილების მიზეზი <span aria-hidden="true">*</span>
                        </FieldLabel>
                        <Textarea
                          id="payroll-reason"
                          name={field.name}
                          required
                          maxLength={500}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          onBlur={field.handleBlur}
                          aria-invalid={invalid}
                          aria-describedby={
                            invalid ? 'payroll-reason-error' : undefined
                          }
                        />
                        <FieldError
                          id="payroll-reason-error"
                          errors={invalid ? field.state.meta.errors : []}
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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    ინახება ახალი ვერსია. წინა პარამეტრები და ცვლილების ისტორია
                    შენარჩუნდება.
                  </p>
                  <Button
                    type="submit"
                    disabled={pending}
                    aria-busy={pending}
                    className="w-full shrink-0 sm:w-auto"
                  >
                    {pending ? <Spinner aria-hidden="true" /> : null}შენახვა
                  </Button>
                </div>
              </CardContent>
            </Card>
          </fieldset>
        )}
      </form.Subscribe>
    </form>
  )
}
