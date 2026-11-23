import { IconCalendarWeek } from '@tabler/icons-react'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { WeekStrip } from '#/features/scheduling/components/week-strip'
import type { WorkingWeek } from '#/features/scheduling/scheduling.types'

/** Shows the employee's own week, or the company week they inherit, with a badge saying which one it is. */
export function UserScheduleCard({
  week,
  companyWeek,
}: {
  week: WorkingWeek | null
  companyWeek: WorkingWeek | null
}) {
  const days = week ?? companyWeek
  return (
    <Card className="rounded-2xl py-4 sm:py-5">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 sm:px-5">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/70 text-muted-foreground">
            <IconCalendarWeek className="size-4" aria-hidden="true" />
          </span>
          <h2>სამუშაო განრიგი</h2>
        </CardTitle>
        <Badge variant="secondary">
          {week ? 'ინდივიდუალური' : 'კომპანიის განრიგი'}
        </Badge>
      </CardHeader>
      <CardContent className="px-4 sm:px-5">
        {days ? (
          <WeekStrip days={days} density="comfortable" />
        ) : (
          <p className="text-sm text-muted-foreground">
            კომპანიის სამუშაო განრიგი ჯერ არ არის განსაზღვრული.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
