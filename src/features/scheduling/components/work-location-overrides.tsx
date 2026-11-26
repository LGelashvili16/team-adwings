import { Badge } from '#/components/ui/badge'
import { formatGeorgianDate } from '#/lib/date-format'
import { workLocationLabel } from '../scheduling.content'
import type { WorkLocationPlan } from '../scheduling.types'

export function WorkLocationOverrides({
  overrides,
}: {
  overrides: WorkLocationPlan['overrides']
}) {
  if (!overrides.length) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">უახლოესი ცვლილებები</p>
      <ul className="flex flex-wrap gap-2">
        {overrides.map(({ date, remote }) => (
          <li
            key={date}
            className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
          >
            <time dateTime={date}>{formatGeorgianDate(date)}</time>
            <Badge variant={remote ? 'blue' : 'secondary'}>
              {workLocationLabel(remote)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
