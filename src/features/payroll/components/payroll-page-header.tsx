import { PayrollNavigation } from './payroll-navigation'
import type { ComponentProps, ReactNode } from 'react'

export function PayrollPageHeader({
  title,
  children,
  ...navigation
}: ComponentProps<typeof PayrollNavigation> & {
  title: string
  children?: ReactNode
}) {
  return (
    <header className="grid min-w-0 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-4">
      <h1 className="flex min-h-10 items-center text-xl font-semibold tracking-tight sm:text-2xl">
        {title}
      </h1>
      <div className="min-w-0 lg:col-span-2 lg:row-start-2">
        <PayrollNavigation {...navigation} />
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2 lg:col-start-2 lg:row-start-1 lg:justify-end">
          {children}
        </div>
      ) : null}
    </header>
  )
}
