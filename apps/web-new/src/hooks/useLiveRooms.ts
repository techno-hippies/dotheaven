import { createSignal, onCleanup, onMount } from 'solid-js'
import { fetchLiveRooms, type LiveRoom } from '../lib/duet'

const REFRESH_INTERVAL_MS = 15_000

export function useLiveRooms() {
  const [rooms, setRooms] = createSignal<LiveRoom[]>([])
  const [isLoading, setIsLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  const refresh = async () => {
    try {
      const nextRooms = await fetchLiveRooms()
      setRooms(nextRooms)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed_to_fetch_live_rooms'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  onMount(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    onCleanup(() => window.clearInterval(id))
  })

  return {
    rooms,
    isLoading,
    error,
    refresh,
  }
}
