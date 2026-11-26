import {
  IconCalendarCheck,
  IconCalendarEventFilled,
  IconClock,
  IconClockFilled,
  IconCalendarDollar,
  IconCalendarMonthFilled,
  IconUserDollar,
  IconUserFilled,
  IconMoneybagPlus,
  IconCoinFilled,
  IconSettings,
  IconSettingsFilled,
  IconWallet,
  IconCreditCardFilled,
  IconAdjustmentsHorizontal,
  IconAdjustmentsHorizontalFilled,
  IconHistory,
  IconMap,
  IconMapPinFilled,
  IconList,
  IconListFilled,
  IconBell,
  IconBellFilled,
  IconBellRinging,
  IconBellRingingFilled,
  IconCalendarMonth,
  IconCircleHalf2,
  IconCircleHalf,
  IconCalendarWeek,
  IconCalendarWeekFilled,
  IconCalendarOff,
  IconCalendarFilled,
  IconChecklist,
  IconListCheckFilled,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconArchive,
  IconArchiveFilled,
} from '@tabler/icons-react'
import type { Icon, IconProps } from '@tabler/icons-react'
import { forwardRef } from 'react'
import { cn } from 'cn'

// Tabler has no filled half-circle; retain the payroll period's half indicator.
const HalfPeriodFilled = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <IconCircleHalf {...props} ref={ref}>
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
  </IconCircleHalf>
))

const filledIcons = new Map<Icon, Icon>([
  [IconCalendarCheck, IconCalendarEventFilled],
  [IconClock, IconClockFilled],
  [IconCalendarDollar, IconCalendarMonthFilled],
  [IconUserDollar, IconUserFilled],
  [IconMoneybagPlus, IconCoinFilled],
  [IconSettings, IconSettingsFilled],
  [IconWallet, IconCreditCardFilled],
  [IconAdjustmentsHorizontal, IconAdjustmentsHorizontalFilled],
  [IconHistory, IconClockFilled],
  [IconMap, IconMapPinFilled],
  [IconList, IconListFilled],
  [IconBell, IconBellFilled],
  [IconBellRinging, IconBellRingingFilled],
  [IconCalendarMonth, IconCalendarMonthFilled],
  [IconCircleHalf2, HalfPeriodFilled],
  [IconCalendarWeek, IconCalendarWeekFilled],
  [IconCalendarOff, IconCalendarFilled],
  [IconChecklist, IconListCheckFilled],
  [IconCircleCheck, IconCircleCheckFilled],
  [IconArchive, IconArchiveFilled],
])

/** Both variants follow the parent tab state, including route-rendered links. */
export function TabsIcon({
  icon: Outline,
  className,
  ...props
}: IconProps & { icon: Icon }) {
  const Filled = filledIcons.get(Outline) ?? Outline
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex size-4 shrink-0', className)}
    >
      <Outline
        {...props}
        className="size-full group-data-active/tab-trigger:hidden"
      />
      <Filled
        {...props}
        className="hidden size-full group-data-active/tab-trigger:block"
      />
    </span>
  )
}
