import {
  IconLayoutDashboard,
  IconClock,
  IconCalendarStats,
  IconCalendarWeek,
  IconCalendarOff,
  IconBell,
  IconSpeakerphone,
  IconUserCircle,
  IconLock,
  IconCalendarCog,
  IconUsers,
  IconUser,
  IconCalendarCheck,
  IconReportAnalytics,
  IconMailPlus,
  IconKey,
  IconBuildingCommunity,
  IconChecklist,
  IconCalendarPause,
  IconShieldLock,
  IconBellCog,
  IconMapPin,
  IconGps,
  IconPlugConnected,
  IconFileSearch,
  IconUserShield,
  IconMessageReport,
} from '@tabler/icons-react'
import type { Permission } from '#/lib/authorization/permissions'

export const navigationItems = [
  // Personal workspace (high priority first)
  {
    to: '/dashboard',
    icon: IconLayoutDashboard,
    label: 'მთავარი',
    permission: null,
  },
  {
    to: '/jobs',
    icon: IconMapPin,
    label: 'სამუშაოების რუკა',
    permission: null,
  },
  {
    to: '/attendance',
    icon: IconClock,
    label: 'დასწრება',
    permission: null,
  },
  {
    to: '/leave',
    icon: IconCalendarOff,
    label: 'შვებულება & ბიულეტენი',
    permission: null,
  },
  {
    to: '/schedule',
    icon: IconCalendarWeek,
    label: 'ჩემი განრიგი',
    permission: null,
  },
  {
    to: '/notifications',
    icon: IconBell,
    label: 'შეტყობინებები',
    permission: null,
  },
  {
    to: '/announcements',
    icon: IconSpeakerphone,
    label: 'განცხადებები',
    permission: null,
  },
  {
    to: '/complaints',
    icon: IconMessageReport,
    label: 'საჩივრები',
    permission: null,
  },
  {
    to: '/timesheets',
    secondary: true,
    icon: IconCalendarStats,
    label: 'სამუშაო საათები',
    permission: null,
  },
  {
    to: '/settings/profile',
    secondary: true,
    icon: IconUserCircle,
    label: 'ჩემი პროფილი',
    permission: null,
  },
  {
    to: '/settings/security',
    secondary: true,
    icon: IconLock,
    label: 'ანგარიშის უსაფრთხოება',
    permission: null,
  },
  // Management (high priority first)
  {
    to: '/manage/attendance',
    icon: IconClock,
    label: 'დასწრებები',
    permission: [
      'attendance.read.all',
      'attendance.read.team',
      'timesheets.review.team',
    ],
  },
  {
    to: '/manage/employees',
    icon: IconUser,
    label: 'თანამშრომლები',
    permission: 'employees.manage',
  },
  {
    to: '/manage/teams',
    icon: IconUsers,
    label: 'გუნდები',
    permission: 'teams.manage',
  },
  {
    to: '/manage/gps',
    icon: IconGps,
    label: 'GPS მოწყობილობები',
    permission: 'gps.read',
  },
  {
    to: '/manage/devices',
    icon: IconShieldLock,
    label: 'დასწრების მოწყობილობები',
    permission: 'attendance.devices.manage',
  },
  {
    to: '/manage/leave',
    icon: IconCalendarCheck,
    label: 'შვებულება & ბიულეტენი',
    permission: 'leave.review',
  },
  {
    to: '/manage/schedule',
    icon: IconCalendarCog,
    label: 'სამუშაო განრიგი',
    permission: 'attendance.configure',
  },
  {
    to: '/manage/announcements',
    icon: IconSpeakerphone,
    label: 'განცხადებების მართვა',
    permission: 'announcements.manage',
  },
  {
    to: '/manage/complaints',
    icon: IconMessageReport,
    label: 'საჩივრების მართვა',
    permission: ['complaints.review.all', 'complaints.review.assigned'],
  },
  {
    to: '/manage/reports',
    icon: IconReportAnalytics,
    label: 'რეპორტები',
    permission: 'reports.read',
  },
  // Administration (high priority first)
  {
    to: '/admin/access',
    icon: IconUserShield,
    label: 'მომხმარებლების წვდომა',
    permission: 'users.manage',
  },
  {
    to: '/admin/roles',
    icon: IconKey,
    label: 'როლები და უფლებები',
    permission: 'roles.manage',
  },
  {
    to: '/admin/settings/security',
    icon: IconShieldLock,
    label: 'უსაფრთხოების პოლიტიკა',
    permission: 'security.configure',
  },
  {
    to: '/admin/settings/company',
    icon: IconBuildingCommunity,
    label: 'კომპანიის პარამეტრები',
    permission: 'company.configure',
  },
  {
    to: '/admin/settings/notifications',
    icon: IconBellCog,
    label: 'შეტყობინებების პარამეტრები',
    permission: 'notifications.configure',
  },
  {
    to: '/admin/integrations',
    icon: IconPlugConnected,
    label: 'ინტეგრაციები',
    permission: 'integrations.manage',
  },
  {
    to: '/admin/audit-log',
    icon: IconFileSearch,
    label: 'მოქმედებების ჟურნალი',
    permission: 'audit.read',
  },
  {
    to: '/admin/invitations',
    icon: IconMailPlus,
    label: 'მოწვევები',
    permission: 'invitations.manage',
  },
  {
    to: '/admin/settings/approvals',
    icon: IconChecklist,
    label: 'დადასტურების წესები',
    permission: 'approvals.configure',
  },
  {
    to: '/admin/settings/leave',
    icon: IconCalendarPause,
    label: 'შვებულების წესები',
    permission: 'leave.configure',
  },
  {
    to: '/admin/locations',
    icon: IconMapPin,
    label: 'სამუშაო ადგილები',
    permission: 'locations.manage',
  },
] as const satisfies ReadonlyArray<{
  to: string
  label: string
  icon: typeof IconLayoutDashboard
  permission: Permission | ReadonlyArray<Permission> | null
  secondary?: boolean
}>

export function isNavigationItemActive(pathname: string, destination: string) {
  const path = pathname.replace(/\/$/, '')
  if (destination === '/attendance') {
    return (
      path === '/attendance' ||
      path.startsWith('/attendance/') ||
      path === '/timesheets' ||
      path.startsWith('/timesheets/')
    )
  }
  if (
    destination === '/manage/employees' ||
    destination === '/manage/attendance' ||
    destination === '/manage/gps'
  ) {
    return path === destination || path.startsWith(`${destination}/`)
  }
  return path === destination
}
