import { queryOptions } from '@tanstack/react-query'
import {
  getAwardChoices,
  getAwardProposal,
  getAwardProposals,
} from './award-proposals.functions'
import type { z } from 'zod'
import type { AwardSearch, awardLookupSchema } from './award-proposals.schemas'

export const awardKey = (actorId: string) =>
  ['payroll-awards', actorId] as const
export const awardsQuery = (actorId: string, search: AwardSearch) =>
  queryOptions({
    queryKey: [...awardKey(actorId), 'directory', search],
    queryFn: () => getAwardProposals({ data: search }),
    retry: false,
    staleTime: 0,
  })
export const awardQuery = (
  actorId: string,
  proposalId: string,
  page: number,
  q: string,
) =>
  queryOptions({
    queryKey: [...awardKey(actorId), 'detail', proposalId, page, q],
    queryFn: () => getAwardProposal({ data: { proposalId, page, q } }),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === actorId &&
      previousQuery.queryKey[3] === proposalId
        ? previous
        : undefined,
    retry: false,
    staleTime: 0,
  })
export const awardChoicesQuery = (
  actorId: string,
  input: z.infer<typeof awardLookupSchema>,
) =>
  queryOptions({
    queryKey: [...awardKey(actorId), 'choices', input],
    queryFn: () => getAwardChoices({ data: input }),
    retry: false,
    staleTime: 0,
  })
