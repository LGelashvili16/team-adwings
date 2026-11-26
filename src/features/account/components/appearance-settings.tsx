import { useEffect } from 'react'
import { useForm } from '@tanstack/react-form'
import { IconPalette } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '#/components/ui/field'
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group'
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  accentPalettes,
} from '#/lib/appearance'
import { cn } from '#/lib/utils'
import { accentIdSchema, appearanceSchema } from '../appearance.schemas'

export function AppearanceSettings() {
  const form = useForm({
    defaultValues: { accent: DEFAULT_ACCENT },
    validators: { onChange: appearanceSchema },
  })

  useEffect(() => {
    // Read the already restored DOM value after hydration, keeping SSR deterministic.
    const sync = () => {
      const result = accentIdSchema.safeParse(
        document.documentElement.dataset.accent,
      )
      form.setFieldValue(
        'accent',
        result.success ? result.data : DEFAULT_ACCENT,
      )
    }
    sync()
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCENT_STORAGE_KEY && event.key !== null) return
      const result = accentIdSchema.safeParse(event.newValue)
      document.documentElement.dataset.accent = result.success
        ? result.data
        : DEFAULT_ACCENT
      sync()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [form])

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <IconPalette className="size-4" aria-hidden="true" />
          </span>
          გარეგნობა
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">
        <form.Field name="accent">
          {(field) => (
            <FieldSet className="gap-3.5">
              <FieldLegend
                variant="label"
                id="accent-legend"
                className="text-muted-foreground"
              >
                აქცენტის ფერი
              </FieldLegend>
              <RadioGroup
                aria-labelledby="accent-legend"
                value={field.state.value}
                onValueChange={(value) => {
                  const result = accentIdSchema.safeParse(value)
                  if (!result.success || result.data === field.state.value)
                    return
                  try {
                    window.localStorage.setItem(ACCENT_STORAGE_KEY, result.data)
                    document.documentElement.dataset.accent = result.data
                    field.handleChange(result.data)
                    toast.success('აქცენტის ფერი შენახულია.')
                  } catch {
                    toast.error(
                      'ფერი ვერ შეინახა. შეამოწმეთ ბრაუზერის საცავის პარამეტრები.',
                    )
                  }
                }}
                className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
              >
                {accentPalettes.map((palette) => {
                  const selected = field.state.value === palette.id
                  return (
                    <div
                      key={palette.id}
                      className={cn(
                        'relative flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors',
                        selected
                          ? 'border-primary bg-accent ring-1 ring-primary/30'
                          : 'border-border/70 bg-muted/20 hover:border-border hover:bg-muted/45',
                      )}
                    >
                      <span
                        className="size-5 shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/20"
                        style={{ backgroundColor: palette.swatch }}
                        aria-hidden="true"
                      />
                      <FieldLabel
                        htmlFor={`accent-${palette.id}`}
                        className="flex-1 cursor-pointer truncate text-sm font-medium after:absolute after:inset-0"
                      >
                        {palette.label}
                      </FieldLabel>
                      <RadioGroupItem
                        id={`accent-${palette.id}`}
                        value={palette.id}
                        className="relative z-10 shrink-0"
                      />
                    </div>
                  )
                })}
              </RadioGroup>
              <FieldError errors={field.state.meta.errors} />
            </FieldSet>
          )}
        </form.Field>
      </CardContent>
    </Card>
  )
}
