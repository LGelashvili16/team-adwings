import { Checkbox } from '#/components/ui/checkbox'
import { useId } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from '#/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  hasPermission,
  permissionSchema,
  roleLabels,
} from '#/lib/authorization/permissions'
import { permissionLabels } from '../admin-access.content'
import type { PermissionOverrides, Role } from '#/lib/authorization/permissions'
import type { ComponentProps } from 'react'

export function AccountRoleFields<T extends Role>({
  options,
  value,
  onChange,
  owner = false,
  disabled,
  invalid,
  errors,
}: {
  options: ReadonlyArray<T>
  value: Array<T>
  onChange: (value: Array<T>) => void
  owner?: boolean
  disabled: boolean
  invalid: boolean
  errors: ComponentProps<typeof FieldError>['errors']
}) {
  const id = useId()
  return (
    <Card>
      <CardContent className="@container">
        <FieldSet
          className="min-w-0"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-hint ${id}-error` : `${id}-hint`}
          data-invalid={invalid}
        >
          <FieldLegend>
            როლები{' '}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          </FieldLegend>
          <FieldDescription id={`${id}-hint`}>
            აირჩიეთ ერთი ან რამდენიმე როლი.
          </FieldDescription>
          <div className="grid gap-x-4 gap-y-3 @md:grid-cols-2">
            {options.map((role) => (
              <Field key={role} orientation="horizontal">
                <Checkbox
                  id={`${id}-${role}`}
                  className="border-muted-foreground"
                  checked={value.includes(role)}
                  disabled={disabled || (role === 'owner' && !owner)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked
                        ? [...value, role]
                        : value.filter((item) => item !== role),
                    )
                  }
                />
                <FieldLabel htmlFor={`${id}-${role}`}>
                  {roleLabels[role]}
                </FieldLabel>
              </Field>
            ))}
          </div>
          <FieldError id={`${id}-error`} errors={errors} />
        </FieldSet>
      </CardContent>
    </Card>
  )
}
export function AccountPermissionFields({
  roles,
  value,
  onChange,
  disabled,
  invalid,
}: {
  roles: Array<Role>
  value: PermissionOverrides
  onChange: (value: PermissionOverrides) => void
  disabled: boolean
  invalid: boolean
}) {
  return (
    <Collapsible
      defaultOpen={value.allow.length > 0 || value.deny.length > 0 || invalid}
      className="flex min-w-0 flex-col gap-4"
    >
      <CollapsibleTrigger
        render={<Button type="button" variant="outline" depth="raised" />}
        className="group w-fit max-w-full"
      >
        ინდივიდუალური უფლებები ({value.allow.length + value.deny.length})
        <IconChevronDown
          className="size-4 group-data-panel-open:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted>
        <FieldSet
          data-invalid={invalid}
          aria-describedby="admin-permissions-error"
        >
          <FieldLegend className="sr-only">ინდივიდუალური უფლებები</FieldLegend>
          <p className="text-sm text-muted-foreground">
            ინდივიდუალური აკრძალვა როლის უფლებაზე უპირატესია. მართვის გვერდებზე
            წვდომა ანგარიშის როლებით იზღუდება.
          </p>
          <div className="flex flex-col gap-3">
            {permissionSchema.options.map((permission) => {
              const canAllow = hasPermission(
                {
                  roles,
                  permissionOverrides: { allow: [permission], deny: [] },
                },
                permission,
              )
              const selected = value.deny.includes(permission)
                ? 'deny'
                : value.allow.includes(permission)
                  ? 'allow'
                  : 'inherit'
              const choices = [
                {
                  value: 'inherit',
                  label: `როლიდან: ${hasPermission(roles, permission) ? 'დაშვებულია' : 'აკრძალულია'}`,
                },
                {
                  value: 'allow',
                  label: canAllow ? 'დაშვება' : 'როლისთვის მიუწვდომელია',
                  disabled: !canAllow,
                },
                { value: 'deny', label: 'აკრძალვა' },
              ]
              return (
                <Field
                  key={permission}
                  className="sm:grid sm:grid-cols-[1fr_14rem] sm:items-center"
                >
                  <FieldLabel htmlFor={`permission-${permission}`}>
                    {permissionLabels[permission]}
                  </FieldLabel>
                  <Select
                    value={selected}
                    items={choices}
                    disabled={disabled}
                    onValueChange={(choice) => {
                      if (
                        choice !== 'allow' &&
                        choice !== 'deny' &&
                        choice !== 'inherit'
                      )
                        return
                      const next = {
                        allow: value.allow.filter(
                          (item) => item !== permission,
                        ),
                        deny: value.deny.filter((item) => item !== permission),
                      }
                      if (choice !== 'inherit') next[choice].push(permission)
                      onChange(next)
                    }}
                  >
                    <SelectTrigger
                      id={`permission-${permission}`}
                      className="w-full dark:shadow-control-raised dark:active:shadow-control-pressed"
                      aria-invalid={invalid}
                      aria-describedby="admin-permissions-error"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {choices.map((choice) => (
                          <SelectItem
                            key={choice.value}
                            value={choice.value}
                            disabled={choice.disabled}
                          >
                            {choice.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )
            })}
          </div>
        </FieldSet>
      </CollapsibleContent>
    </Collapsible>
  )
}
