import {
  IconCircleDashed,
  IconCar,
  IconMapPin,
  IconCheck,
  IconX,
  IconTool,
  IconRulerMeasure,
  IconBriefcase,
} from '@tabler/icons-react'
import type { JobKind, JobStatus } from './jobs.types'
import { jobsTimeZone } from './jobs.dates'
import { formatGeorgianDateTime } from '#/lib/date-format'

const markerStyle = (
  token:
    | 'badge-yellow'
    | 'badge-orange'
    | 'badge-orange-vivid'
    | 'badge-green'
    | 'badge-red'
    | 'primary'
    | 'badge-sky'
    | 'badge-lavender'
    | 'secondary',
) => ({
  backgroundColor: `var(--${token})`,
  color: `var(--${token}-foreground)`,
  borderColor: `var(--${token}-foreground)`,
})

export const jobStatuses = {
  pending: {
    label: 'დაგეგმილი',
    action: 'თავიდან დაგეგმვა',
    variant: 'yellow',
    icon: IconCircleDashed,
    markerStyle: markerStyle('badge-yellow'),
  },
  en_route: {
    label: 'გზაშია',
    action: 'მივდივარ ობიექტზე',
    variant: 'secondary',
    icon: IconCar,
    markerStyle: markerStyle('primary'),
  },
  on_site: {
    label: 'ობიექტზეა',
    action: 'ობიექტზე ვარ',
    variant: 'orange',
    icon: IconMapPin,
    markerStyle: markerStyle('badge-orange'),
  },
  completed: {
    label: 'შესრულებული',
    action: 'სამუშაოს დასრულება',
    variant: 'green',
    icon: IconCheck,
    markerStyle: markerStyle('badge-green'),
  },
  rejected: {
    label: 'უარყოფილი',
    action: 'სამუშაოს უარყოფა',
    variant: 'red',
    icon: IconX,
    markerStyle: markerStyle('badge-red'),
  },
} as const satisfies Record<JobStatus, unknown>
export const jobKinds = {
  installation: {
    label: 'მონტაჟი',
    createLabel: 'მონტაჟის დამატება',
    icon: IconTool,
    variant: 'sky',
    markerStyle: markerStyle('badge-sky'),
  },
  measurement: {
    label: 'აზომვა',
    createLabel: 'აზომვის დამატება',
    icon: IconRulerMeasure,
    variant: 'orange-vivid',
    markerStyle: markerStyle('badge-orange-vivid'),
  },
  other: {
    label: 'სხვა სამუშაო',
    createLabel: 'სხვა სამუშაოს დამატება',
    icon: IconBriefcase,
    variant: 'lavender',
    markerStyle: markerStyle('badge-lavender'),
  },
} as const satisfies Record<JobKind, unknown>
export function formatJobDate(date: string) {
  return formatGeorgianDateTime(date, jobsTimeZone)
}

const historyStatusColors: Record<JobStatus, string> = {
  pending: 'var(--badge-purple-foreground)',
  en_route: 'var(--badge-blue-foreground)',
  on_site: 'var(--badge-orange-foreground)',
  completed: 'var(--badge-green-foreground)',
  rejected: 'var(--badge-red-foreground)',
}

export function jobHistoryPresentation(event: {
  action: string
  status: JobStatus
}) {
  if (event.action === 'created')
    return {
      label: 'სამუშაო დამატებულია',
      color: 'var(--badge-blue-foreground)',
    }
  if (event.action === 'edited')
    return {
      label: 'ინფორმაცია განახლებულია',
      color: 'var(--muted-foreground)',
    }
  if (event.action === 'assignments_changed')
    return {
      label: 'შემსრულებლები განახლებულია',
      color: 'var(--muted-foreground)',
    }
  return {
    label:
      event.status === 'pending'
        ? 'თავიდან დაგეგმილი'
        : jobStatuses[event.status].label,
    color: historyStatusColors[event.status],
  }
}
