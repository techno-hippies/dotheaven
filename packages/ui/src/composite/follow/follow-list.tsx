import { type Component, Show, For } from 'solid-js'
import { Avatar } from '../../primitives/avatar'
import { Button } from '../../primitives/button'
import { IconButton } from '../../primitives/icon-button'
import { MediaRow } from '../shared/media-row'
import { ChevronLeft } from '../../icons'

export interface FollowListMember {
  address: string
  name: string
  handle: string
  avatarUrl?: string
  nationalityCode?: string
}

export interface FollowListProps {
  title: string
  members: FollowListMember[]
  loading?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  onMemberClick?: (address: string) => void
  onBack?: () => void
}

export const FollowList: Component<FollowListProps> = (props) => {
  return (
    <div class="flex flex-col h-full">
      {/* Sticky header */}
      <div class="flex items-center gap-3 px-4 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-shrink-0">
        <Show when={props.onBack}>
          <IconButton
            variant="soft"
            size="md"
            onClick={() => props.onBack?.()}
            aria-label="Back"
          >
            <ChevronLeft class="w-5 h-5" />
          </IconButton>
        </Show>
        <span class="text-base font-semibold text-[var(--text-primary)]">{props.title}</span>
      </div>

      {/* Scrollable list */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={!props.loading}
          fallback={
            <div class="px-4 py-8 text-center text-[var(--text-muted)]">Loading...</div>
          }
        >
          <Show
            when={props.members.length > 0}
            fallback={
              <div class="px-4 py-12 text-center text-[var(--text-muted)]">
                {props.title === 'Followers' ? 'No followers yet' : 'Not following anyone yet'}
              </div>
            }
          >
            <div class="divide-y divide-[var(--border-subtle)]">
              <For each={props.members}>
                {(member) => (
                  <MediaRow
                    title={member.name}
                    subtitle={member.handle}
                    cover={<Avatar src={member.avatarUrl} alt={member.name} size="lg" nationalityCode={member.nationalityCode} />}
                    onClick={() => props.onMemberClick?.(member.address)}
                  />
                )}
              </For>
            </div>

            {/* Load more */}
            <Show when={props.hasMore}>
              <div class="px-4 py-4 text-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => props.onLoadMore?.()}
                  disabled={props.loadingMore}
                >
                  {props.loadingMore ? 'Loading...' : 'Load more'}
                </Button>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  )
}
