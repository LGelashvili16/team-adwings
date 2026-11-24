import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { formatGeorgianDate, formatGeorgianDateTime } from '#/lib/date-format'
import {
  bonusCalculationLabels,
  bonusKindLabels,
  bonusUnitLabel,
} from '../bonus-rules.presentation'
import { formatSalary, salaryBasisLabels } from '../salary.presentation'
import type {
  BonusRuleDetail,
  BonusRuleSummary,
  BonusRuleVersion,
} from '../bonus-rules.types'

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, BonusRuleSummary>()
const historyHelper = createColumnHelper<
  typeof features,
  BonusRuleDetail['history'][number]
>()
export function BonusRuleTerms({ rule }: { rule: BonusRuleVersion }) {
  return (
    <div className="flex min-w-48 flex-col gap-2 whitespace-normal">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">{formatSalary(rule)}</span>
        <Badge variant={rule.enabled ? 'green' : 'secondary'}>
          {rule.enabled ? 'ჩართული' : 'გამორთული'}
        </Badge>
      </div>
      <span className="text-sm">{bonusUnitLabel(rule)}</span>
      <span className="text-xs text-muted-foreground">
        {salaryBasisLabels[rule.amountBasis]}
      </span>
      <span className="text-xs text-muted-foreground">
        ამოქმედება: {formatGeorgianDate(rule.effectiveFrom)}
      </span>
    </div>
  )
}
export function BonusRulesTable({ records }: { records: BonusRuleSummary[] }) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'rule',
          header: 'წახალისების წესი',
          cell: ({ row }) => (
            <div className="flex min-w-52 max-w-sm flex-col gap-2 whitespace-normal wrap-anywhere">
              <Link
                className="font-medium hover:underline"
                to="/manage/payroll/bonuses/$ruleId"
                params={{ ruleId: row.original.ruleId }}
                search={{ page: 1, q: '' }}
              >
                {row.original.latest.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {bonusKindLabels[row.original.latest.kind]} ·{' '}
                {bonusCalculationLabels[row.original.latest.calculation]}
              </span>
              <span className="text-xs text-muted-foreground">
                ბოლო ჩანაწერი: ვერსია {row.original.latest.version}
              </span>
            </div>
          ),
        }),
        helper.display({
          id: 'current',
          header: 'დღეს მოქმედი პირობა',
          cell: ({ row }) =>
            row.original.current ? (
              <BonusRuleTerms rule={row.original.current} />
            ) : (
              <Badge variant="orange">ჯერ არ მოქმედებს</Badge>
            ),
        }),
        helper.display({
          id: 'next',
          header: 'შემდეგი ცვლილება',
          cell: ({ row }) =>
            row.original.next ? (
              <BonusRuleTerms rule={row.original.next} />
            ) : (
              <span className="text-sm text-muted-foreground">
                არ არის დაგეგმილი
              </span>
            ),
        }),
      ]),
    [],
  )
  const table = useTable({ features, columns, data: records })
  return (
    <Table
      tabIndex={0}
      className="focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TableCaption className="sr-only">
        წახალისების წესები და მოქმედი პირობები
      </TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead scope="col" key={header.id} className="px-4">
                <table.FlexRender header={header} />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className="px-4 py-4 align-top">
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
export function BonusRuleHistoryTable({
  records,
  timezone,
}: {
  records: BonusRuleDetail['history']
  timezone: string
}) {
  const columns = useMemo(
    () =>
      historyHelper.columns([
        historyHelper.display({
          id: 'version',
          header: 'ვერსია და ამოქმედება',
          cell: ({ row }) => (
            <div className="flex min-w-44 flex-col gap-2">
              <span className="font-medium">ვერსია {row.original.version}</span>
              <span>{formatGeorgianDate(row.original.effectiveFrom)}</span>
              <span className="text-xs text-muted-foreground">
                {bonusKindLabels[row.original.kind]}
              </span>
            </div>
          ),
        }),
        historyHelper.display({
          id: 'terms',
          header: 'შენახული პირობა',
          cell: ({ row }) => (
            <div className="flex max-w-sm flex-col gap-3 whitespace-normal wrap-anywhere">
              <span className="font-medium">{row.original.name}</span>
              <BonusRuleTerms rule={row.original} />
              <span className="text-sm text-muted-foreground">
                {row.original.qualification}
              </span>
            </div>
          ),
        }),
        historyHelper.display({
          id: 'audit',
          header: 'ცვლილების საფუძველი',
          cell: ({ row }) => (
            <div className="flex min-w-52 max-w-sm flex-col gap-2 whitespace-normal wrap-anywhere">
              <span>{row.original.actorName}</span>
              <time
                className="text-xs text-muted-foreground"
                dateTime={row.original.recordedAt}
              >
                {formatGeorgianDateTime(row.original.recordedAt, timezone)}
              </time>
              <span className="text-sm">{row.original.reason}</span>
            </div>
          ),
        }),
      ]),
    [timezone],
  )
  const table = useTable({ features, columns, data: records })
  return (
    <Table
      tabIndex={0}
      className="focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TableCaption className="sr-only">
        წახალისების წესის ცვლილებების ისტორია
      </TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead scope="col" key={header.id} className="px-4">
                <table.FlexRender header={header} />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className="px-4 py-4 align-top">
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
