import { type Component, createSignal, createMemo } from 'solid-js'
import { useNavigate, useParams, useLocation } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { FollowList } from '@heaven/ui'
import { publicProfile } from '@heaven/core'
import { useI18n } from '@heaven/i18n/solid'
import { fetchFollowers, fetchFollowing } from '../lib/heaven/follow'
import { parseProfileId, resolveProfileId } from './profile-utils'

const PAGE_SIZE = 50

export const FollowListPage: Component = () => {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [loadedCount, setLoadedCount] = createSignal(PAGE_SIZE)

  const isFollowers = () => location.pathname.endsWith('/followers')
  const title = () => isFollowers() ? t('follow.followers') : t('follow.following')

  // Resolve params.id (could be heaven name, ENS, HNS, or address) to a hex address
  const parsed = createMemo(() => parseProfileId(params.id))
  const resolvedQuery = createQuery(() => ({
    queryKey: ['profileResolve', params.id],
    queryFn: () => resolveProfileId(parsed()),
    get enabled() { return !!params.id },
  }))
  const resolvedAddress = () => resolvedQuery.data?.address

  const listQuery = createQuery(() => ({
    queryKey: ['followList', resolvedAddress(), isFollowers() ? 'followers' : 'following', loadedCount()],
    queryFn: async () => {
      const addr = resolvedAddress()!
      if (isFollowers()) {
        return fetchFollowers(addr, { first: loadedCount() })
      } else {
        return fetchFollowing(addr, { first: loadedCount() })
      }
    },
    get enabled() { return !!resolvedAddress() },
    staleTime: 1000 * 30,
  }))

  const members = () => listQuery.data ?? []
  const hasMore = () => members().length >= loadedCount()

  return (
    <FollowList
      title={title()}
      members={members()}
      loading={listQuery.isLoading}
      hasMore={hasMore()}
      loadingMore={listQuery.isFetching && !listQuery.isLoading}
      onLoadMore={() => setLoadedCount((c) => c + PAGE_SIZE)}
      onMemberClick={(address) => navigate(publicProfile(address))}
      onBack={() => navigate(publicProfile(params.id ?? ''))}
    />
  )
}
