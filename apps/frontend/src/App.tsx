import type { Component } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { useNavigate } from '@solidjs/router'
import {
  CommunityFeed,
  CommunityFilterDialog,
  countActiveFilters,
  Avatar,
  IconButton,
  Sliders,
  PageHeader,
  type CommunityFilters,
} from '@heaven/ui'
import type { CommunityCardProps } from '@heaven/ui'
import { useAuth } from './providers'
import { fetchCommunityMembers, fetchUserLocationCityId } from './lib/heaven'

export const App: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = createSignal('all')
  const [filterOpen, setFilterOpen] = createSignal(false)
  const [filters, setFilters] = createSignal<CommunityFilters>({})

  const userAddress = () => auth.pkpInfo()?.ethAddress?.toLowerCase()

  // Fetch current user's locationCityId for "Nearby" tab (only when authenticated)
  const locationQuery = createQuery(() => ({
    queryKey: ['community', 'myLocation', userAddress()],
    queryFn: () => fetchUserLocationCityId(userAddress()!),
    get enabled() { return !!userAddress() },
    staleTime: 5 * 60_000,
  }))

  // Fetch members based on active tab and filters
  const membersQuery = createQuery(() => ({
    queryKey: ['community', 'members', activeTab(), locationQuery.data, filters()],
    queryFn: () => {
      const tab = activeTab()
      const f = filters()
      if (tab === 'nearby' && locationQuery.data) {
        return fetchCommunityMembers({ locationCityId: locationQuery.data, ...f })
      }
      return fetchCommunityMembers(f)
    },
    staleTime: 60_000,
  }))

  // Filter out self from the list
  const members = (): CommunityCardProps[] => {
    const all = membersQuery.data ?? []
    const self = userAddress()
    return all
      .filter((m) => !self || m.address.toLowerCase() !== self)
      .map((m) => ({
        ...m,
        onClick: () => navigate(`/u/${m.address}`),
      }))
  }

  // Own avatar for header (only when authenticated)
  const ownAvatarQuery = createQuery(() => ({
    queryKey: ['community', 'ownAvatar', userAddress()],
    queryFn: async () => {
      const all = membersQuery.data ?? []
      const self = userAddress()
      const me = all.find((m) => m.address.toLowerCase() === self)
      return me?.avatarUrl ?? undefined
    },
    get enabled() { return !!userAddress() && !!membersQuery.data },
    staleTime: 5 * 60_000,
  }))

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
  }

  const activeFilterCount = () => countActiveFilters(filters())

  return (
    <div class="flex flex-col h-full">
      <PageHeader
        title="Community"
        leftSlot={
          <Show when={auth.isAuthenticated()}>
            <div class="cursor-pointer" onClick={() => navigate('/profile')}>
              <Avatar
                src={ownAvatarQuery.data}
                size="sm"
              />
            </div>
          </Show>
        }
        rightSlot={
          <div class="relative">
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Filter"
              onClick={() => setFilterOpen(true)}
            >
              <Sliders class="w-5 h-5" />
            </IconButton>
            <Show when={activeFilterCount() > 0}>
              <span class="absolute -top-1 -right-1 w-4 h-4 bg-[var(--accent-coral)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount()}
              </span>
            </Show>
          </div>
        }
      />
      <CommunityFeed
        members={members()}
        activeTab={activeTab()}
        onTabChange={handleTabChange}
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'nearby', label: 'Nearby' },
        ]}
      />
      <CommunityFilterDialog
        open={filterOpen()}
        onOpenChange={setFilterOpen}
        filters={filters()}
        onFiltersChange={setFilters}
      />
    </div>
  )
}
