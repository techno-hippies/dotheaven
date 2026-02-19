import type { Component } from 'solid-js'
import { LiveRoomsRow } from './components/LiveRoomsRow'
import { ThemedButton } from './components/ThemedButton'
import { useLiveRooms } from './hooks/useLiveRooms'

export const App: Component = () => {
  const live = useLiveRooms()

  return (
    <main class="app-shell">
      <section class="hero-card">
        <p class="eyebrow">Web New</p>
        <h1>Home v1</h1>
        <p class="subtext">Live rooms now poll duet discovery so GPUI solo rooms can surface here.</p>
        <LiveRoomsRow
          rooms={live.rooms()}
          isLoading={live.isLoading()}
          error={live.error()}
        />
        <ThemedButton label="Create Room" onClick={() => {}} />
      </section>
    </main>
  )
}
