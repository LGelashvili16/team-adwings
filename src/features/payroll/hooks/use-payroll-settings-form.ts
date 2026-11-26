import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { updatePayrollSettings } from '../payroll-settings.functions'
import { payrollSettingsKey } from '../payroll-settings.queries'
import { monthlyKey } from '../monthly.queries'
import {
  paymentScheduleDefaults,
  savePayrollSettingsSchema,
} from '../payroll-settings.schemas'
import type { PayrollSettingsView } from '../payroll-settings.queries'

function defaults(initial: PayrollSettingsView) {
  return {
    schedule: initial.latest?.schedule ?? paymentScheduleDefaults,
    expectedVersion: initial.latest?.version ?? 0,
  }
}
export function usePayrollSettingsForm(
  actorId: string,
  initial: PayrollSettingsView,
) {
  const client = useQueryClient()
  const [initialValues, setInitialValues] = useState(() => defaults(initial))
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (data: ReturnType<typeof defaults>) =>
      updatePayrollSettings({ data }),
    retry: false,
  })
  const form = useForm({
    defaultValues: initialValues,
    validators: { onSubmit: savePayrollSettingsSchema },
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await mutation.mutateAsync(value)
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        const next = { latest: result.value }
        const saved = defaults(next)
        setInitialValues(saved)
        form.reset(saved)
        client.setQueryData<PayrollSettingsView>(
          payrollSettingsKey(actorId),
          next,
        )
        void client.invalidateQueries({ queryKey: payrollSettingsKey(actorId) })
        void client.invalidateQueries({ queryKey: monthlyKey(actorId) })
        toast.success('გაცემის გრაფიკი შენახულია.')
      } catch {
        const message =
          'გრაფიკი ვერ შეინახა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        document
          .getElementById('payroll-settings-form')
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      ),
  })
  return { form, error }
}
export type PayrollSettingsForm = ReturnType<
  typeof usePayrollSettingsForm
>['form']
