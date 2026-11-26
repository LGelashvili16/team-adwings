import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { employmentDirectoryStatusSchema } from '../employment.schemas'

const options = [
  { value: 'current', label: 'მოქმედი თანამშრომლები' },
  { value: 'former', label: 'ყოფილი თანამშრომლები' },
] as const

export function EmploymentDirectoryFilter({
  value,
  onChange,
}: {
  value: 'current' | 'former' | undefined
  onChange: (value: 'current' | 'former') => void
}) {
  return (
    <Select
      items={options}
      value={value ?? 'current'}
      onValueChange={(selection) => {
        const parsed = employmentDirectoryStatusSchema.safeParse(selection)
        if (parsed.success) onChange(parsed.data)
      }}
    >
      <SelectTrigger
        aria-label="დასაქმების სტატუსი"
        className="w-full sm:w-auto"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map(({ value: option, label }) => (
            <SelectItem key={option} value={option}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
