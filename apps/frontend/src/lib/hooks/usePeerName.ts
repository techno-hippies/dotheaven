/**
 * usePeerName - Resolve display name for a peer address
 *
 * Priority:
 * 1. Heaven name (.heaven) - via getPrimaryName
 * 2. ENS name - via getEnsProfile (checks linked EOA if direct lookup fails)
 * 3. Truncated address fallback
 *
 * Uses TanStack Query for caching.
 */

import { createQuery } from '@tanstack/solid-query'
import { getPrimaryName, getEnsProfile } from '../heaven'

export interface PeerNameResult {
  /** Display name (heaven name, ENS, or truncated address) */
  displayName: string
  /** Heaven name label without .heaven suffix (null if not a heaven user) */
  heavenName: string | null
  /** ENS name (null if none) */
  ensName: string | null
  /** Avatar URL if resolved */
  avatarUrl: string | null
  /** Whether the name is still loading */
  isLoading: boolean
}

function isValidAddress(addr: string): addr is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(addr)
}

function truncateAddress(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

async function resolvePeerName(peerAddress: string): Promise<{
  heavenName: string | null
  ensName: string | null
  avatarUrl: string | null
}> {
  // Not a valid address — can't resolve
  if (!isValidAddress(peerAddress)) {
    return { heavenName: null, ensName: null, avatarUrl: null }
  }

  // 1. Try heaven name lookup
  const heavenResult = await getPrimaryName(peerAddress).catch(() => null)
  if (heavenResult?.label) {
    // TODO: Could also fetch avatar from RecordsV1 here
    return { heavenName: heavenResult.label, ensName: null, avatarUrl: null }
  }

  // 2. Try ENS lookup on the address directly
  const ensResult = await getEnsProfile(peerAddress).catch(() => null)
  if (ensResult?.name) {
    return { heavenName: null, ensName: ensResult.name, avatarUrl: ensResult.avatar }
  }

  return { heavenName: null, ensName: null, avatarUrl: null }
}

/**
 * Hook to resolve a peer's display name.
 * Returns heaven name > ENS name > truncated address.
 */
export function usePeerName(peerAddress: () => string | undefined): PeerNameResult {
  const query = createQuery(() => ({
    queryKey: ['peerName', peerAddress()],
    queryFn: () => resolvePeerName(peerAddress()!),
    enabled: !!peerAddress(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  }))

  const addr = peerAddress()
  const fallback = addr ? truncateAddress(addr) : ''

  // Derive display name from query result
  const heavenName = () => query.data?.heavenName ?? null
  const ensName = () => query.data?.ensName ?? null
  const avatarUrl = () => query.data?.avatarUrl ?? null

  const displayName = () => {
    if (heavenName()) return `${heavenName()}.heaven`
    if (ensName()) return ensName()!
    return fallback
  }

  return {
    get displayName() { return displayName() },
    get heavenName() { return heavenName() },
    get ensName() { return ensName() },
    get avatarUrl() { return avatarUrl() },
    get isLoading() { return query.isLoading },
  }
}

/**
 * Batch resolve multiple peer addresses.
 * Returns a map of address → PeerNameResult.
 */
export function usePeerNames(peerAddresses: () => string[]): Map<string, PeerNameResult> {
  const results = new Map<string, PeerNameResult>()

  // Create individual queries for each address
  // TanStack Query will dedupe and cache these
  for (const addr of peerAddresses()) {
    const query = createQuery(() => ({
      queryKey: ['peerName', addr],
      queryFn: () => resolvePeerName(addr),
      enabled: !!addr,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    }))

    const fallback = truncateAddress(addr)
    const heavenName = query.data?.heavenName ?? null
    const ensName = query.data?.ensName ?? null
    const avatarUrl = query.data?.avatarUrl ?? null

    let displayName: string
    if (heavenName) displayName = `${heavenName}.heaven`
    else if (ensName) displayName = ensName
    else displayName = fallback

    results.set(addr, {
      displayName,
      heavenName,
      ensName,
      avatarUrl,
      isLoading: query.isLoading,
    })
  }

  return results
}
