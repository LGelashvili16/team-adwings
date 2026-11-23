import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import {
  IconChevronLeft,
  IconChevronRight,
  IconDots,
} from '@tabler/icons-react'
import { cn } from 'cn'
import { buttonVariants } from './button'
import type { ComponentProps } from 'react'

function Pagination({ className, ...props }: ComponentProps<'nav'>) {
  return (
    <nav
      aria-label="გვერდები"
      data-slot="pagination"
      className={cn('flex justify-center', className)}
      {...props}
    />
  )
}
function PaginationContent({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('flex flex-wrap items-center gap-1', className)}
      {...props}
    />
  )
}
function PaginationItem(props: ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />
}
function PaginationLink({
  className,
  isActive,
  variant,
  render,
  ...props
}: useRender.ComponentProps<'a'> & {
  isActive?: boolean
  variant?: 'outline' | 'ghost'
}) {
  return useRender({
    defaultTagName: 'a',
    render,
    props: mergeProps<'a'>(
      {
        'aria-current': isActive ? 'page' : undefined,
        className: cn(
          buttonVariants({
            depth: 'raised',
            variant: variant ?? (isActive ? 'outline' : 'ghost'),
            size: 'icon',
          }),
          'h-10 min-w-10 w-auto px-2',
          isActive &&
            'border-primary/40 bg-accent text-accent-foreground dark:border-primary/45 dark:bg-accent',
          'aria-disabled:pointer-events-none aria-disabled:border-border/60 aria-disabled:bg-muted/40 aria-disabled:text-muted-foreground/60 aria-disabled:shadow-none dark:aria-disabled:border-input/50 dark:aria-disabled:bg-muted/25',
          className,
        ),
      },
      props,
    ),
    state: { slot: 'pagination-link' },
  })
}
function PaginationPrevious({
  className,
  ...props
}: ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="წინა გვერდი"
      variant="outline"
      className={cn(
        'border-border bg-secondary/75 text-foreground hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/50 dark:hover:bg-accent',
        className,
      )}
      {...props}
    >
      <IconChevronLeft aria-hidden="true" />
    </PaginationLink>
  )
}
function PaginationNext({
  className,
  ...props
}: ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="შემდეგი გვერდი"
      variant="outline"
      className={cn(
        'border-border bg-secondary/75 text-foreground hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/50 dark:hover:bg-accent',
        className,
      )}
      {...props}
    >
      <IconChevronRight aria-hidden="true" />
    </PaginationLink>
  )
}
function PaginationEllipsis({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn('flex size-10 items-center justify-center', className)}
      {...props}
    >
      <IconDots className="size-4" />
    </span>
  )
}
export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
