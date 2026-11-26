import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import {
  findJobLocations,
  readJob,
  readJobs,
  readJobGeofenceSettings,
  readUnreadJobs,
  suggestJobAddress,
  readJobAssignmentCandidates,
} from './jobs.functions'
import { jobAssignmentPageSize } from './jobs.schemas'
import type { JobAssignmentSearch } from './jobs.schemas'
import type { JobMapPosition, JobSearch } from './jobs.types'

export const jobsKeys = { all: (actorId: string) => ['jobs', actorId] as const }
export const jobGeofenceSettingsQueryOptions = (actorId: string) =>
  queryOptions({
    queryKey: [...jobsKeys.all(actorId), 'geofence-settings'],
    queryFn: async () => {
      const result = await readJobGeofenceSettings()
      if (!result.ok) throw new Error(result.message)
      return result.value
    },
    staleTime: 15_000,
    retry: false,
  })
export const jobAssignmentCandidatesQueryOptions = (
  actorId: string,
  search: Omit<JobAssignmentSearch, 'page'>,
) =>
  infiniteQueryOptions({
    queryKey: [
      ...jobsKeys.all(actorId),
      'assignment-candidates',
      search.kind,
      search.q,
      search.roles,
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const result = await readJobAssignmentCandidates({
        data: { ...search, page: pageParam },
        signal,
      })
      if (!result.ok) throw new Error(result.message)
      return result.value
    },
    getNextPageParam: (page, _pages, pageNumber) =>
      pageNumber * jobAssignmentPageSize < page.total
        ? pageNumber + 1
        : undefined,
    retry: false,
  })
export const unreadJobsQueryOptions = (actorId: string) =>
  queryOptions({
    queryKey: [...jobsKeys.all(actorId), 'unread'],
    queryFn: async () => {
      const result = await readUnreadJobs()
      if (!result.ok) throw new Error(result.message)
      return result.value
    },
    staleTime: 15_000,
    retry: false,
  })
export const jobsQueryOptions = (actorId: string, search: JobSearch) =>
  queryOptions({
    queryKey: [
      ...jobsKeys.all(actorId),
      'list',
      search.q,
      search.status,
      search.kind,
      search.scope,
      search.deadlineState,
      search.sort,
      search.view,
      search.page,
      search.from,
      search.to,
    ],
    queryFn: async () => {
      const result = await readJobs({ data: search })
      if (!result.ok) throw new Error(result.message)
      return result.value
    },
    staleTime: 15_000,
    retry: false,
  })
export const jobQueryOptions = (actorId: string, id: string) =>
  queryOptions({
    queryKey: [...jobsKeys.all(actorId), 'detail', id],
    queryFn: async () => {
      const result = await readJob({ data: { id } })
      if (!result.ok) throw new Error(result.message)
      return result.value
    },
    staleTime: 10_000,
    retry: false,
  })

export const jobLocationsQueryOptions = (actorId: string, q: string) =>
  queryOptions({
    queryKey: [...jobsKeys.all(actorId), 'locations', q],
    queryFn: async ({ signal }) => {
      const result = await findJobLocations({ data: { q }, signal })
      if (!result.ok) throw new Error(result.message)
      return result.value
    },
    staleTime: 10 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })

export const jobAddressQueryOptions = (
  actorId: string,
  position?: Pick<JobMapPosition, 'longitude' | 'latitude'>,
) =>
  queryOptions({
    queryKey: [
      ...jobsKeys.all(actorId),
      'address-suggestion',
      2,
      position?.longitude,
      position?.latitude,
    ],
    queryFn: async ({ signal }) => {
      if (!position) throw new Error('მიუთითეთ მდებარეობა რუკაზე.')
      const result = await suggestJobAddress({
        data: { longitude: position.longitude, latitude: position.latitude },
        signal,
      })
      if (!result.ok) throw new Error(result.message)
      return result.value
    },
    staleTime: 10 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
