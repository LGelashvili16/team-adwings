import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Link } from '@tanstack/react-router'
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { authClient } from '#/lib/auth/auth-client'
import {
  accountSetupFormSchema,
  activateAccountSchema,
  activateAccountFormSchema,
  completeAccountSchema,
} from '#/features/access/access.schemas'
import { replaceUsernameWhitespace } from '#/features/access/access.rules'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { Input } from '#/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { PasswordInput } from '#/components/common/password-input'
import { useHydrated } from '#/hooks/use-hydrated'
import { authContent } from '../auth.content'

const activationFields = [
  { name: 'code', label: 'ერთჯერადი კოდი' },
  { name: 'username', label: 'მომხმარებლის სახელი' },
  { name: 'newPassword', label: 'ახალი პაროლი' },
  { name: 'confirmPassword', label: 'პაროლის გამეორება' },
] as const

const resetFields = [
  { name: 'code', label: 'ერთჯერადი კოდი' },
  { name: 'newPassword', label: 'ახალი პაროლი' },
  { name: 'confirmPassword', label: 'პაროლის გამეორება' },
] as const

export function AccountSetupForm({
  purpose,
}: {
  purpose: 'activation' | 'reset'
}) {
  const hydrated = useHydrated()
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [usernameSpaceReplaced, setUsernameSpaceReplaced] = useState(false)
  const isActivation = purpose === 'activation'
  const fields = isActivation ? activationFields : resetFields
  const content = isActivation
    ? authContent.register
    : authContent.resetPassword
  const form = useForm({
    defaultValues: {
      code: '',
      username: '',
      newPassword: '',
      confirmPassword: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = isActivation
          ? activateAccountFormSchema.safeParse(value)
          : accountSetupFormSchema.safeParse(value)
        if (result.success) return undefined
        const fieldErrors: Partial<Record<string, { message: string }>> = {}
        for (const issue of result.error.issues) {
          const key = issue.path[0]
          if (typeof key === 'string' && !fieldErrors[key]) {
            fieldErrors[key] = { message: issue.message }
          }
        }
        return { fields: fieldErrors }
      },
    },
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = await authClient.$fetch<{ status: boolean }>(
          isActivation ? '/employee-activate' : '/employee-reset',
          {
            method: 'POST',
            body: isActivation
              ? activateAccountSchema.parse(value)
              : completeAccountSchema.parse(value),
          },
        )
        if (result.error || !result.data.status) {
          setError(
            result.error?.status === 429
              ? 'ძალიან ბევრი მცდელობაა. სცადეთ მოგვიანებით.'
              : result.error?.status === 409
                ? 'ეს მომხმარებლის სახელი უკვე დაკავებულია. აირჩიეთ სხვა სახელი.'
                : result.error?.status === 400 || result.error?.status === 403
                  ? 'კოდი არასწორია, ვადაგასულია ან უკვე გამოყენებულია. მიმართეთ ადმინისტრატორს.'
                  : 'მოქმედება ვერ შესრულდა. შეამოწმეთ კავშირი და სცადეთ მოგვიანებით.',
          )
          return
        }
        form.reset()
        setComplete(true)
        toast.success(
          isActivation
            ? 'ანგარიში გააქტიურებულია.'
            : 'პაროლი წარმატებით შეიცვალა.',
        )
      } catch {
        setError('სერვერთან დაკავშირება ვერ მოხერხდა. სცადეთ მოგვიანებით.')
      }
    },
  })
  if (complete) {
    return (
      <Card className="w-full py-8 shadow-sm sm:px-4 sm:py-10">
        <CardContent className="flex flex-col items-center gap-6 text-center">
          <div role="status" className="flex flex-col items-center gap-4">
            <span
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-full bg-badge-green text-badge-green-foreground ring-8 ring-badge-green/30"
            >
              <IconCheck className="size-8" stroke={2.5} />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {purpose === 'activation'
                  ? 'ანგარიში გააქტიურებულია'
                  : 'პაროლი შეცვლილია'}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                {purpose === 'activation'
                  ? 'პაროლი შენახულია. ახლა შეგიძლიათ შეხვიდეთ თქვენი მომხმარებლის სახელითა და ახალი პაროლით.'
                  : 'შეგიძლიათ შეხვიდეთ თქვენი მომხმარებლის სახელითა და ახალი პაროლით.'}
              </p>
            </div>
          </div>
          <Button
            nativeButton={false}
            role="link"
            className="h-10 w-full"
            render={<Link to="/auth/login" />}
          >
            შესვლა
            <IconArrowRight aria-hidden="true" />
          </Button>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="gap-3 pb-7">
        <CardTitle>
          <h1 className="text-3xl font-semibold tracking-tight">
            {content.title}
          </h1>
        </CardTitle>
        <CardDescription>{content.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            {fields.map(({ name, label }) => (
              <form.Field name={name} key={name}>
                {(field) => {
                  const id = `setup-${name}`
                  const invalid = !field.state.meta.isValid
                  const showSpaceNotice =
                    name === 'username' && usernameSpaceReplaced
                  return (
                    <Field data-invalid={invalid}>
                      <FieldLabel htmlFor={id}>
                        {label}
                        <span aria-hidden="true" className="text-destructive">
                          *
                        </span>
                      </FieldLabel>
                      {name === 'code' ? (
                        <Input
                          id={id}
                          name={name}
                          required
                          autoComplete="off"
                          spellCheck={false}
                          autoCapitalize="none"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          aria-invalid={invalid}
                          aria-describedby={`${id}-error`}
                          className="h-10 font-mono uppercase tracking-wider"
                          placeholder="XXXX-XXXX-XXXX"
                        />
                      ) : name === 'username' ? (
                        <Input
                          id={id}
                          name={name}
                          required
                          type="text"
                          autoComplete="username"
                          autoCorrect="off"
                          spellCheck={false}
                          autoCapitalize="none"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => {
                            const input = event.currentTarget
                            const raw = input.value
                            const next = replaceUsernameWhitespace(raw)
                            if (next !== raw) {
                              const start = input.selectionStart ?? raw.length
                              const end = input.selectionEnd ?? start
                              input.value = next
                              input.setSelectionRange(
                                replaceUsernameWhitespace(raw.slice(0, start))
                                  .length,
                                replaceUsernameWhitespace(raw.slice(0, end))
                                  .length,
                              )
                              setUsernameSpaceReplaced(true)
                            } else if (!next.includes('-')) {
                              setUsernameSpaceReplaced(false)
                            }
                            field.handleChange(next)
                          }}
                          aria-invalid={invalid}
                          aria-describedby={
                            [
                              showSpaceNotice && `${id}-space-notice`,
                              invalid && `${id}-error`,
                            ]
                              .filter(Boolean)
                              .join(' ') || undefined
                          }
                          className="h-10"
                          placeholder="მაგ: giorgi-beridze"
                        />
                      ) : (
                        <PasswordInput
                          id={id}
                          name={name}
                          label={label}
                          value={field.state.value}
                          invalid={invalid}
                          onBlur={field.handleBlur}
                          onChange={field.handleChange}
                        />
                      )}
                      <FieldError
                        id={`${id}-error`}
                        errors={field.state.meta.errors}
                      />
                      {showSpaceNotice ? (
                        <Alert
                          id={`${id}-space-notice`}
                          variant="warning"
                          role="status"
                        >
                          <IconAlertTriangle aria-hidden="true" />
                          <AlertDescription>
                            გამოტოვებული ადგილები დეფისებით (-) შეიცვალა.
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </Field>
                  )
                }}
              </form.Field>
            ))}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(pending) => (
                <Button
                  type="submit"
                  disabled={!hydrated || pending}
                  aria-busy={pending}
                  className="h-10 w-full"
                >
                  <span className="flex size-4 items-center justify-center">
                    {pending ? <Spinner aria-hidden="true" /> : null}
                  </span>
                  {purpose === 'activation'
                    ? 'ანგარიშის გააქტიურება'
                    : 'პაროლის შენახვა'}
                </Button>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <Button
          nativeButton={false}
          role="link"
          variant="link"
          render={<Link to="/auth/login" />}
        >
          შესვლაზე დაბრუნება
        </Button>
      </CardFooter>
    </Card>
  )
}
