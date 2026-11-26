import {
  IconAlertCircle,
  IconAdjustmentsHorizontal,
  IconCalendarDollar,
  IconDeviceFloppy,
} from '@tabler/icons-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Spinner } from '#/components/ui/spinner'
import { usePayrollSettingsForm } from '../hooks/use-payroll-settings-form'
import { firstPaymentDefault, payStageLabel } from '../payroll-settings.schemas'
import type { PayrollSettingsForm as Form } from '../hooks/use-payroll-settings-form'
import type { PayrollSettingsView } from '../payroll-settings.queries'
import type { PayStage } from '../payroll-settings.schemas'

const monthLabels = { 0: 'სახელფასო თვე', 1: 'მომდევნო თვე' } as const
const dayFields = [
  { key: 'start', label: 'საწყისი დღე' },
  { key: 'end', label: 'ბოლო დღე' },
] as const
const frequencies = [
  { value: 'once', label: 'ერთხელ' },
  { value: 'twice', label: 'ორჯერ' },
] as const

function WindowFields({
  form,
  stage,
  twice,
}: {
  form: Form
  stage: PayStage
  twice: boolean
}) {
  return (
    <section
      aria-labelledby={`payroll-window-${stage}`}
      className="grid min-w-0 gap-3 p-4 sm:p-5 @2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,2fr)] @2xl:gap-5"
    >
      <h3
        id={`payroll-window-${stage}`}
        className="text-sm font-semibold @2xl:self-start @2xl:pt-8"
      >
        {payStageLabel(stage, twice)}
      </h3>
      <FieldGroup className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <form.Field name={`schedule.${stage}.offset`}>
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`payroll-offset-${stage}`}>
                გაცემის თვე
              </FieldLabel>
              <Select
                value={String(field.state.value)}
                onValueChange={(value) => {
                  if (value === '0' || value === '1')
                    field.handleChange(value === '0' ? 0 : 1)
                }}
              >
                <SelectTrigger
                  id={`payroll-offset-${stage}`}
                  className="w-full"
                >
                  <SelectValue>
                    {monthLabels[field.state.value ?? 0]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{monthLabels[0]}</SelectItem>
                  <SelectItem value="1">{monthLabels[1]}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>
        <div className="grid grid-cols-2 gap-3">
          {dayFields.map(({ key, label }) => (
            <form.Field name={`schedule.${stage}.${key}`} key={key}>
              {(field) => {
                const id = `payroll-${stage}-${key}`
                const invalid = !field.state.meta.isValid
                return (
                  <Field className="min-w-0" data-invalid={invalid}>
                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                    <Input
                      id={id}
                      required
                      className="tabular-nums"
                      type="number"
                      min={1}
                      max={31}
                      value={field.state.value || ''}
                      onChange={(event) =>
                        field.handleChange(Number(event.target.value))
                      }
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      aria-describedby={invalid ? `${id}-error` : undefined}
                    />
                    <FieldError
                      id={`${id}-error`}
                      errors={field.state.meta.errors}
                    />
                  </Field>
                )
              }}
            </form.Field>
          ))}
        </div>
      </FieldGroup>
    </section>
  )
}

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
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Subscribe
        selector={(state) => ({
          pending: state.isSubmitting,
          twice: state.values.schedule.first !== null,
        })}
      >
        {({ pending, twice }) => (
          <fieldset
            disabled={pending}
            className="grid min-w-0 items-start gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]"
          >
            <Card className="min-w-0 rounded-2xl [--card-spacing:--spacing(5)]">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <IconAdjustmentsHorizontal
                      className="size-5"
                      aria-hidden="true"
                    />
                  </span>
                  <h2>გაცემის წესები</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-1">
                <FieldSet className="min-w-0 gap-2">
                  <FieldLegend id="payroll-frequency" variant="label">
                    გაცემა თვეში
                  </FieldLegend>
                  <RadioGroup
                    aria-labelledby="payroll-frequency"
                    disabled={pending}
                    value={twice ? 'twice' : 'once'}
                    onValueChange={(value) => {
                      if (value === 'once' || value === 'twice') {
                        form.setFieldValue(
                          'schedule.first',
                          value === 'twice' ? firstPaymentDefault : null,
                        )
                      }
                    }}
                    className="grid-cols-2"
                  >
                    {frequencies.map(({ value, label }) => (
                      <div
                        key={value}
                        className="relative flex min-w-0 items-center gap-2 rounded-lg border bg-muted/20 p-2.5 has-data-checked:border-primary/40 has-data-checked:bg-accent/55"
                      >
                        <RadioGroupItem
                          id={`payroll-frequency-${value}`}
                          value={value}
                          className="z-10"
                        />
                        <FieldLabel
                          htmlFor={`payroll-frequency-${value}`}
                          className="min-w-0 cursor-pointer text-sm after:absolute after:inset-0"
                        >
                          {label}
                        </FieldLabel>
                      </div>
                    ))}
                  </RadioGroup>
                </FieldSet>
                <form.Field name="schedule.fineStage">
                  {(field) => (
                    <Field className="min-w-0">
                      <FieldLabel htmlFor="payroll-fine-stage">
                        ჯარიმის დაქვითვის ეტაპი
                      </FieldLabel>
                      <Select
                        disabled={pending}
                        value={field.state.value}
                        onValueChange={(value) => {
                          if (value === 'salary' || value === 'adjustments')
                            field.handleChange(value)
                        }}
                      >
                        <SelectTrigger
                          id="payroll-fine-stage"
                          className="w-full"
                        >
                          <SelectValue>
                            {payStageLabel(field.state.value, twice)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="salary">
                            {payStageLabel('salary', twice)}
                          </SelectItem>
                          <SelectItem value="adjustments">
                            {payStageLabel('adjustments', twice)}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
              </CardContent>
            </Card>
            <Card className="@container min-w-0 gap-0 rounded-2xl [--card-spacing:--spacing(5)]">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <IconCalendarDollar className="size-5" aria-hidden="true" />
                  </span>
                  <h2>გაცემის გრაფიკი</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y px-0">
                {twice ? (
                  <WindowFields form={form} stage="first" twice={twice} />
                ) : null}
                <WindowFields form={form} stage="salary" twice={twice} />
                <WindowFields form={form} stage="adjustments" twice={twice} />
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-3 bg-muted/20 sm:items-end">
                {error ? (
                  <Alert variant="destructive">
                    <IconAlertCircle aria-hidden="true" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <Button type="submit" disabled={pending} aria-busy={pending}>
                  {pending ? (
                    <Spinner data-icon="inline-start" aria-hidden="true" />
                  ) : (
                    <IconDeviceFloppy
                      data-icon="inline-start"
                      aria-hidden="true"
                    />
                  )}
                  შენახვა
                </Button>
              </CardFooter>
            </Card>
          </fieldset>
        )}
      </form.Subscribe>
    </form>
  )
}
