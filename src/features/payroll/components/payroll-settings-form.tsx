import { IconAlertCircle, IconDeviceFloppy } from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
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
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <PayrollGeneralSettings form={form} today={initial.today} />
              <PayrollWithholdingSettings form={form} />
            </div>
            {error ? (
              <Alert variant="destructive">
                <IconAlertCircle aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="w-full sm:w-auto sm:self-end"
            >
              {pending ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" aria-hidden="true" />
              )}
              შენახვა
            </Button>
          </fieldset>
        )}
      </form.Subscribe>
    </form>
  )
}
