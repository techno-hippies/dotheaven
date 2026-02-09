import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { Avatar } from '../../primitives/avatar'
import { Plus } from '../../icons'

export interface LiveRoom {
  id: string
  hostName: string
  hostAvatarUrl?: string
  participantCount: number
  /** Album art or cover image for the room background */
  coverUrl?: string
}

export interface LiveRoomsRowProps {
  rooms: LiveRoom[]
  onRoomClick?: (roomId: string) => void
  /** When provided, renders a "create room" card as the first item */
  onCreateRoom?: () => void
  /** Avatar URL for the create-room card. Falls back to UserCircle icon if absent. */
  createAvatarUrl?: string
  /** Max live rooms to display (default 5). Create card doesn't count. */
  maxVisible?: number
  /** i18n: label for the create-room card (default: "Your room") */
  createRoomLabel?: string
}

const DEFAULT_MAX_VISIBLE = 5
const CARD_CLASSES = 'relative w-[120px] h-[180px] rounded-xl overflow-hidden flex-shrink-0 cursor-pointer border-none p-0'

export const LiveRoomsRow: Component<LiveRoomsRowProps> = (props) => {
  const shouldShow = () => props.rooms.length > 0 || !!props.onCreateRoom
  const maxVisible = () => props.maxVisible ?? DEFAULT_MAX_VISIBLE
  const visibleRooms = () => props.rooms.slice(0, maxVisible())

  return (
    <Show when={shouldShow()}>
      <div class="flex gap-2.5 px-4 py-3 overflow-x-auto scrollbar-none">
        {/* Create room card */}
        <Show when={props.onCreateRoom}>
          <button
            class={CARD_CLASSES + ' bg-[var(--bg-elevated)]'}
            onClick={() => props.onCreateRoom?.()}
          >
            {/* Background — user avatar blurred, or solid fallback */}
            <Show when={props.createAvatarUrl}>
              <img
                src={props.createAvatarUrl}
                alt=""
                class="absolute inset-0 w-full h-full object-cover opacity-40 blur-sm"
              />
            </Show>

            {/* Center + icon */}
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-10 h-10 rounded-full bg-[var(--accent-blue)] flex items-center justify-center">
                <Plus class="w-5 h-5 text-white" />
              </div>
            </div>

            {/* Bottom label — same position as host name on room cards */}
            <div class="absolute bottom-0 left-0 right-0 p-2.5 flex flex-col items-start">
              <p class="text-sm font-semibold text-[var(--text-primary)]">{props.createRoomLabel ?? 'Your room'}</p>
            </div>
          </button>
        </Show>

        {/* Live room cards */}
        <For each={visibleRooms()}>
          {(room) => (
            <button
              class={CARD_CLASSES}
              onClick={() => props.onRoomClick?.(room.id)}
            >
              {/* Background — cover art or gradient fallback */}
              <Show
                when={room.coverUrl}
                fallback={
                  <div
                    class="absolute inset-0"
                    style="background: linear-gradient(135deg, var(--bg-highlight) 0%, var(--bg-elevated) 100%)"
                  />
                }
              >
                <img
                  src={room.coverUrl}
                  alt=""
                  class="absolute inset-0 w-full h-full object-cover"
                />
                {/* Darken overlay for text readability */}
                <div class="absolute inset-0 bg-black/30" />
              </Show>

              {/* Host avatar — top left */}
              <div class="absolute top-2 left-2">
                <Avatar
                  src={room.hostAvatarUrl}
                  size="sm"
                  alt={room.hostName}
                  class="ring-2 ring-white/30"
                />
              </div>

              {/* Bottom info — host name + participant count */}
              <div class="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/70 to-transparent flex flex-col items-start">
                <p class="text-sm font-semibold text-white truncate max-w-full">{room.hostName}</p>
                <p class="text-sm text-white/70">{room.participantCount}</p>
              </div>
            </button>
          )}
        </For>
      </div>
    </Show>
  )
}
