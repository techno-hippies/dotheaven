/**
 * useActiveRooms — TanStack Query hook for polling GET /rooms/active
 *
 * Polls every 15s, deduplicates by room_id, sorts by created_at desc.
 * Returns typed active rooms for LiveRoomsRow consumption.
 */

import { createQuery } from '@tanstack/solid-query'
import { getActiveRooms, type ActiveRoom } from './rooms'

function normalizeRooms(rooms: ActiveRoom[]): ActiveRoom[] {
  const seen = new Set<string>()
  return rooms
    .filter((r) => {
      if (!r.room_id || seen.has(r.room_id)) return false
      seen.add(r.room_id)
      return true
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function useActiveRooms() {
  const query = createQuery(() => ({
    queryKey: ['active-rooms'],
    queryFn: async () => {
      const result = await getActiveRooms()
      return normalizeRooms(result.rooms)
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  }))

  return {
    rooms: () => query.data ?? [],
    isLoading: () => query.isLoading,
    isFetching: () => query.isFetching,
    error: () => query.error,
    refetch: () => query.refetch(),
  }
}
