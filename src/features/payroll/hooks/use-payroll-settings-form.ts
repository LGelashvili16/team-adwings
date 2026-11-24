import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { updatePayrollSettings } from '../payroll-settings.functions'
import { payrollSettingsKey } from '../payroll-settings.queries'
import type { PayrollSettingsView } from '../payroll-settings.queries'
import {
  formatPercentage,
  payrollSettingsDefaults,
  payrollSettingsFormSchema,
  percentageToBasisPoints,
} from '../payroll-settings.schemas'

function defaults(initial: PayrollSettingsView) {
  const { latest, today } = initial
  if (!latest) return payrollSettingsDefaults(today)
  return {
    effectiveFrom: latest.effectiveFrom < today ? today : latest.effectiveFrom,
    amountBasis: latest.amountBasis,
    dayBasis: latest.dayBasis,
    incomeTaxEnabled: latest.incomeTaxEnabled,
    incomeTaxBasisPoints: formatPercentage(latest.incomeTaxBasisPoints),
    pensionEnabled: latest.pensionEnabled,
    employeePensionBasisPoints: formatPercentage(
      latest.employeePensionBasisPoints,
    ),
    employerPensionBasisPoints: formatPercentage(
      latest.employerPensionBasisPoints,
    ),
    expectedVersion: latest.version,
    reason: '',
  }
}

export function usePayrollSettingsForm(
  actorId: string,
  initial: PayrollSettingsView,
) {
  const client = useQueryClient()
  // Background refetches must not replace an in-progress financial settings draft.
  const [initialValues, setInitialValues] = useState(() => defaults(initial))
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof updatePayrollSettings>[0]) =>
      updatePayrollSettings(input),
    retry: false,
  })
  const form = useForm({
    defaultValues: initialValues,
    validators: { onSubmit: payrollSettingsFormSchema },
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const parsed = payrollSettingsFormSchema.parse(value)
        const result = await mutation.mutateAsync({
          data: {
            ...parsed,
            incomeTaxBasisPoints: percentageToBasisPoints(
              parsed.incomeTaxBasisPoints,
            ),
            employeePensionBasisPoints: percentageToBasisPoints(
              parsed.employeePensionBasisPoints,
            ),
            employerPensionBasisPoints: percentageToBasisPoints(
              parsed.employerPensionBasisPoints,
            ),
          },
        })
        if (!result.ok) {
          setError(result.message)
          toast.error(result.message)
          return
        }
        if (!result.value) throw new Error('Missing saved policy')
        const savedValues = {
          ...parsed,
          expectedVersion: result.value.version,
          reason: '',
        }
        // Keep Form's options and reset baseline aligned so a rerender cannot restore the original rates.
        setInitialValues(savedValues)
        form.reset(savedValues)
        // Publish the confirmed save immediately; reconcile current/future applicability in the background.
        client.setQueryData<PayrollSettingsView>(
          payrollSettingsKey(actorId),
          (previous) =>
            previous
              ? {
                  ...previous,
                  latest: result.value,
                  current:
                    result.value &&
                    result.value.effectiveFrom <= previous.today &&
                    (!previous.current ||
                      result.value.effectiveFrom >=
                        previous.current.effectiveFrom)
                      ? result.value
                      : previous.current,
                }
              : previous,
        )
        void client.invalidateQueries({ queryKey: payrollSettingsKey(actorId) })
        toast.success('ხელფასების პარამეტრები შენახულია.')
      } catch {
        const message =
          'პარამეტრები ვერ შეინახა. გადაამოწმეთ წვდომა და სცადეთ ხელახლა.'
        setError(message)
        toast.error(message)
      }
    },
    onSubmitInvalid: () => {
      // Focus the first invalid control so keyboard and screen-reader users can find the error.
      requestAnimationFrame(() => {
        document
          .getElementById('payroll-settings-form')
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      })
    },
  })
  return { form, error }
}
export type PayrollSettingsForm = ReturnType<
  typeof usePayrollSettingsForm
>['form']
