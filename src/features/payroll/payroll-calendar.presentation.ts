import type { PayrollCalendarDay } from './payroll-calendar.types'

export const calendarKindLabels = {
  working: 'სამუშაო დღე',
  day_off: 'დასვენების დღე',
  inherit: 'გამონაკლისის მოხსნა',
}
export const calendarSourceLabels = {
  company: 'კომპანიის კვირა',
  individual: 'ინდივიდუალური კვირა',
  company_exception: 'კომპანიის გამონაკლისი',
  employee_exception: 'თანამშრომლის გამონაკლისი',
  holiday: 'კანონით უქმე',
}
export const calendarLeaveLabels = {
  day_off: 'დასვენება',
  vacation: 'შვებულება',
  sick_leave: 'ბიულეტენი',
}
export function calendarDayStatus(day: PayrollCalendarDay) {
  if (!day.legalCalendarKnown)
    return {
      label: 'სამართლებრივი კალენდარი დასაზუსტებელია',
      variant: 'yellow' as const,
    }
  if (day.kind === 'unknown_history')
    return { label: 'განრიგის ისტორია უცნობია', variant: 'yellow' as const }
  if (day.kind === 'unconfigured')
    return { label: 'განრიგი არ არის განსაზღვრული', variant: 'yellow' as const }
  return day.kind === 'scheduled'
    ? { label: 'სამუშაო დღე', variant: 'green' as const }
    : { label: 'დასვენების დღე', variant: 'secondary' as const }
}
