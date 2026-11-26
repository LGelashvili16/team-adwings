import { IconExclamationMark } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'

export function JobOverdueBadge() {
  return (
    <Badge variant="red">
      <IconExclamationMark aria-hidden="true" data-icon="inline-start" />
      ვადაგადაცილებული
    </Badge>
  )
}
