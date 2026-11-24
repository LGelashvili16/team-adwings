import { queryOptions } from '@tanstack/react-query'
import { getBonusRule, getBonusRules } from './bonus-rules.functions'
import type { BonusRuleSearch } from './bonus-rules.schemas'

export const bonusRulesKey = (actorId: string) =>
  ['payroll-bonus-rules', actorId] as const
export const bonusRulesQuery = (actorId: string, search: BonusRuleSearch) =>
  queryOptions({
    queryKey: [...bonusRulesKey(actorId), 'directory', search],
    queryFn: () => getBonusRules({ data: search }),
    staleTime: 0,
    retry: false,
  })
export const bonusRuleQuery = (
  actorId: string,
  ruleId: string,
  page: number,
  q: string,
) =>
  queryOptions({
    queryKey: [...bonusRulesKey(actorId), 'detail', ruleId, page, q],
    queryFn: () => getBonusRule({ data: { ruleId, page, q } }),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === actorId &&
      previousQuery.queryKey[3] === ruleId
        ? previous
        : undefined,
    staleTime: 0,
    retry: false,
  })
