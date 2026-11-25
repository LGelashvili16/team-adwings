import { queryOptions } from '@tanstack/react-query'
import { awardKey } from './award-proposals.queries'
import { getAwardPool } from './award-pools.functions'

export const awardPoolQuery = (
  actorId: string,
  poolId: string,
  page: number,
  q: string,
) =>
  queryOptions({
    queryKey: [...awardKey(actorId), 'pool', poolId, page, q],
    queryFn: () => getAwardPool({ data: { poolId, page, q } }),
    placeholderData: (previous, query) =>
      query?.queryKey[1] === actorId &&
      query.queryKey[3] === poolId &&
      query.queryKey[2] === 'pool'
        ? previous
        : undefined,
    retry: false,
    staleTime: 0,
  })
