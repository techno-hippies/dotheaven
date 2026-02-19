/**
 * useOnboardingStatus — on-chain profile completeness check.
 *
 * Queries three on-chain sources to determine if the authenticated user
 * has completed all mandatory onboarding steps:
 *   1. Heaven name (getPrimaryName → null if missing)
 *   2. Profile data (getProfile → null if missing)
 *   3. Avatar record (getTextRecord → '' if missing)
 *
 * Uses TanStack Query with localStorage fast-path for returning users.
 */

import { createMemo } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { getPrimaryName, getProfile, getTextRecord } from '../lib/heaven'

export type OnboardingStatus = 'loading' | 'needs-onboarding' | 'complete'

export interface OnboardingResult {
  status: () => OnboardingStatus
  initialStep: () => 'name' | 'basics' | 'avatar' | null
  hasName: () => boolean
  hasProfile: () => boolean
  hasAvatar: () => boolean
}

const CACHE_PREFIX = 'heaven:onboarding:'

function readCache(address: string): 'complete' | 'incomplete' | null {
  try {
    return localStorage.getItem(`${CACHE_PREFIX}${address.toLowerCase()}`) as any
  } catch {
    return null
  }
}

function writeCache(address: string, value: 'complete' | 'incomplete') {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${address.toLowerCase()}`, value)
  } catch { /* ignore */ }
}

export function useOnboardingStatus(
  address: () => `0x${string}` | null | undefined,
): OnboardingResult {
  const addr = () => address() ?? null

  // Fast path: check localStorage cache
  const cached = createMemo(() => {
    const a = addr()
    return a ? readCache(a) : null
  })

  // Query 1: Heaven name
  const nameQuery = createQuery(() => ({
    queryKey: ['primaryName', addr()],
    queryFn: () => getPrimaryName(addr()!),
    get enabled() { return !!addr() },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  }))

  // Query 2: Profile exists
  const profileQuery = createQuery(() => ({
    queryKey: ['profile', addr()],
    queryFn: () => getProfile(addr()!),
    get enabled() { return !!addr() },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  }))

  // Query 3: Avatar record (depends on name query for the node)
  const node = () => nameQuery.data?.node ?? null
  const avatarQuery = createQuery(() => ({
    queryKey: ['textRecord', node(), 'avatar'],
    queryFn: () => getTextRecord(node()!, 'avatar'),
    get enabled() { return !!node() },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  }))

  const hasName = createMemo(() => !!nameQuery.data?.label)
  const hasProfile = createMemo(() => profileQuery.data != null)
  const hasAvatar = createMemo(() => !!node() && !!avatarQuery.data)

  const isLoading = createMemo(() => {
    if (!addr()) return false
    // If cached as complete, skip loading state
    if (cached() === 'complete') return false
    return nameQuery.isLoading || profileQuery.isLoading || (!!node() && avatarQuery.isLoading)
  })

  const status = createMemo((): OnboardingStatus => {
    // If no address, return 'loading' to avoid false 'complete' during session restore
    // The caller (AppLayout/OnboardingPage) should check isAuthenticated separately
    if (!addr()) return 'loading'
    // Fast path: trust localStorage cache for 'complete' users
    // This avoids flash of /onboarding on hard refresh for completed users
    if (cached() === 'complete') return 'complete'
    if (isLoading()) return 'loading'
    if (!hasName() || !hasProfile() || !hasAvatar()) {
      writeCache(addr()!, 'incomplete')
      return 'needs-onboarding'
    }
    writeCache(addr()!, 'complete')
    return 'complete'
  })

  const initialStep = createMemo((): 'name' | 'basics' | 'avatar' | null => {
    if (!hasName()) return 'name'
    if (!hasProfile()) return 'basics'
    if (!hasAvatar()) return 'avatar'
    return null
  })

  return {
    status,
    initialStep,
    hasName,
    hasProfile,
    hasAvatar,
  }
}
