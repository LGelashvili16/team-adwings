import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { DataPagination } from '#/components/common/data-pagination'
import { Badge } from '#/components/ui/badge'

export function SecuritySubmit({
  pending,
  children,
}: {
  pending: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="relative min-w-44 px-8"
    >
      {pending ? (
        <Spinner className="absolute left-3" aria-hidden="true" />
      ) : null}
      {children}
    </Button>
  )
}
export function DeviceState({ state }: { state: string }) {
  const labels: Record<string, string> = {
    unrequested: 'არააქტიური',
    pending: 'დასადასტურებელი',
    approved: 'აქტიური',
    rejected: 'უარყოფილი',
    revoked: 'გაუქმებული',
  }
  return (
    <Badge
      variant={
        state === 'approved'
          ? 'green'
          : state === 'pending'
            ? 'yellow'
            : state === 'unrequested'
              ? 'secondary'
              : 'red'
      }
    >
      {labels[state] ?? 'შეზღუდული'}
    </Badge>
  )
}
export function SecurityPagination({
  page,
  total,
  pageSize = 20,
  onPage,
}: {
  page: number
  total: number
  pageSize?: number
  onPage: (page: number) => void
}) {
  return (
    <div className="border-t px-4 py-3">
      <DataPagination
        page={page}
        total={total}
        pageSize={pageSize}
        renderLink={(next) => (
          <button type="button" onClick={() => onPage(next)} />
        )}
      />
    </div>
  )
}
