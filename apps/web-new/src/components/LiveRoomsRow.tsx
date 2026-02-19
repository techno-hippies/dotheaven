import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import type { LiveRoom } from '../lib/duet'

interface LiveRoomsRowProps {
  rooms: LiveRoom[]
  isLoading: boolean
  error: string | null
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export const LiveRoomsRow: Component<LiveRoomsRowProps> = (props) => {
  return (
    <section class="live-row">
      <div class="live-row__header">
        <h2>Live now</h2>
      </div>

      <Show when={!props.isLoading} fallback={<p class="live-row__state">Loading live rooms...</p>}>
        <Show when={!props.error} fallback={<p class="live-row__state">Could not load live rooms.</p>}>
          <Show when={props.rooms.length > 0} fallback={<p class="live-row__state">No live rooms right now.</p>}>
            <div class="live-row__grid">
              <For each={props.rooms}>
                {(room) => (
                  <article class="live-card">
                    <div class="live-card__head">
                      <p class="live-card__title">{room.title}</p>
                      <span class="live-card__mode">{room.audienceMode === 'free' ? 'Free' : 'Ticketed'}</span>
                    </div>
                    <p class="live-card__meta">
                      Host {shortAddress(room.hostWallet)} • {room.listenerCount} listening
                    </p>
                    <a class="live-card__watch" href={room.watchUrl} rel="noreferrer" target="_blank">
                      Watch
                    </a>
                  </article>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Show>
    </section>
  )
}
