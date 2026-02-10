import type { Component } from 'solid-js'
import { createSignal, createEffect, Show } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { useNavigate } from '@solidjs/router'
import {
  CommunityFeed,
  CommunityFilterDialog,
  countActiveFilters,
  IconButton,
  PageHeader,
  Sliders,
  getNativeLanguages,
  getLearningLanguages,
  type CommunityFilters,
} from '@heaven/ui'
import type { CommunityCardProps } from '@heaven/ui'
import { useI18n } from '@heaven/i18n/solid'
import { useAuth } from './providers'
import { fetchCommunityMembers, fetchUserLocationCityId, getProfile, type CommunityMember } from './lib/heaven'

export const App: Component = () => {
  const { t } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()
  const [filterOpen, setFilterOpen] = createSignal(false)
  const [filters, setFilters] = createSignal<CommunityFilters>({ nativeLanguage: 'en' })
  const [filtersInitialized, setFiltersInitialized] = createSignal(false)

  const userAddress = () => auth.pkpInfo()?.ethAddress?.toLowerCase()

  // Fetch current user's profile to get their languages for default filter
  const profileQuery = createQuery(() => ({
    queryKey: ['community', 'myProfile', userAddress()],
    queryFn: () => getProfile(userAddress()! as `0x${string}`),
    get enabled() { return !!userAddress() },
    staleTime: 5 * 60_000,
  }))

  // My native language codes (for sorting mutual matches)
  const myNativeCodes = () => {
    const langs = profileQuery.data?.languages
    return langs ? getNativeLanguages(langs).map((l) => l.code) : []
  }

  // Initialize filters once when profile loads — default to "native speakers of my learning language"
  createEffect(() => {
    if (filtersInitialized()) return
    const profile = profileQuery.data
    if (!profile) return

    const learning = profile.languages ? getLearningLanguages(profile.languages) : []
    if (learning.length > 0) {
      setFilters({ nativeLanguage: learning[0].code })
    }
    setFiltersInitialized(true)
  })

  // Fetch current user's locationCityId for "Same City" filter (only when authenticated)
  const locationQuery = createQuery(() => ({
    queryKey: ['community', 'myLocation', userAddress()],
    queryFn: () => fetchUserLocationCityId(userAddress()!),
    get enabled() { return !!userAddress() },
    staleTime: 5 * 60_000,
  }))

  // Fetch members based on filters (sameCity uses locationCityId)
  const membersQuery = createQuery(() => ({
    queryKey: ['community', 'members', locationQuery.data, filters()],
    queryFn: () => {
      const f = filters()
      if (f.sameCity && locationQuery.data) {
        return fetchCommunityMembers({ locationCityId: locationQuery.data, ...f })
      }
      return fetchCommunityMembers(f)
    },
    staleTime: 60_000,
  }))

  // Filter out self, sort mutual matches first
  const members = (): CommunityCardProps[] => {
    const all = membersQuery.data ?? []
    const self = userAddress()
    const nativeCodes = myNativeCodes()

    const filtered = all
      .filter((m) => !self || m.address.toLowerCase() !== self)

    // Sort: people learning my native language first (mutual exchange match)
    if (nativeCodes.length > 0) {
      filtered.sort((a, b) => {
        const aLearning = isMutualMatch(a, nativeCodes)
        const bLearning = isMutualMatch(b, nativeCodes)
        if (aLearning && !bLearning) return -1
        if (!aLearning && bLearning) return 1
        return 0
      })
    }

    return filtered.map((m) => ({
      ...m,
      onClick: () => navigate(`/u/${m.address}`),
    }))
  }

  /** Check if a member is learning one of the given language codes */
  function isMutualMatch(m: CommunityMember, nativeCodes: string[]): boolean {
    if (!m.languages) return false
    return m.languages.some(
      (l) => l.proficiency > 0 && l.proficiency < 7 && nativeCodes.includes(l.code),
    )
  }

  const activeFilterCount = () => countActiveFilters(filters())

  return (
    <div class="h-full overflow-y-auto">
      <PageHeader
        title={t('nav.community')}
        rightSlot={
          <div class="relative">
            <IconButton
              variant="soft"
              size="md"
              aria-label={t('common.filter')}
              onClick={() => setFilterOpen(true)}
            >
              <Sliders class="w-5 h-5" />
            </IconButton>
            <Show when={activeFilterCount() > 0}>
              <span class="absolute -top-0.5 -right-1.5 w-4 h-4 bg-[var(--accent-coral)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount()}
              </span>
            </Show>
          </div>
        }
      />
      <CommunityFeed
        members={members()}
        isLoading={membersQuery.isPending}
      />
      <CommunityFilterDialog
        open={filterOpen()}
        onOpenChange={setFilterOpen}
        filters={filters()}
        onFiltersChange={setFilters}
        labels={{
          filterMembers: t('community.filterMembers'),
          gender: t('community.gender'),
          any: t('common.any'),
          nativeLanguage: t('community.nativeLanguage'),
          learningLanguage: t('community.learningLanguage'),
          sameCity: t('community.sameCity'),
          verified: t('community.verified'),
          reset: t('common.reset'),
          apply: t('common.apply'),
        }}
      />
    </div>
  )
}
