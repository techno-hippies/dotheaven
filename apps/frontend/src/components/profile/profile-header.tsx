import type { Component } from 'solid-js'
import { cn, Avatar, Button } from '@heaven/ui'
import { FollowButton } from '../social/follow-button'

export interface ProfileHeaderProps {
  class?: string
  username: string
  displayName: string
  avatarUrl?: string
  bannerGradient?: string
  stats: {
    followers: number
    following: number
    likes: number
  }
  isFollowing?: boolean
  isOwnProfile?: boolean
  isEditing?: boolean
  isSaving?: boolean
  onFollowClick?: () => void
  onMessageClick?: () => void
  onAvatarClick?: () => void
  onEditClick?: () => void
  onSaveClick?: () => void
}

/**
 * ProfileHeader - Large header for user profile pages
 *
 * Features:
 * - Gradient banner at top
 * - Large avatar
 * - Display name + username handle
 * - Follow/Message buttons (or Edit Profile if own profile)
 * - Stats row (followers, following, likes)
 */
export const ProfileHeader: Component<ProfileHeaderProps> = (props) => {
  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M'
    }
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K'
    }
    return count.toString()
  }

  return (
    <div class={cn('relative', props.class)}>
      {/* Banner - gradient background */}
      <div
        class="h-48 w-full rounded-t-lg"
        style={{
          background: props.bannerGradient ?? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      />

      {/* Content container with avatar overlapping banner */}
      <div class="px-8 pb-6">
        {/* Avatar - positioned to overlap banner */}
        <div
          class="-mt-20 mb-4 cursor-pointer inline-block"
          onClick={() => props.onAvatarClick?.()}
          role={props.onAvatarClick ? 'button' : undefined}
          tabIndex={props.onAvatarClick ? 0 : undefined}
        >
          <Avatar
            src={props.avatarUrl}
            alt={props.displayName}
            size="4xl"
          />
        </div>

        {/* Name and buttons row */}
        <div class="flex items-start justify-between mb-4">
          <div>
            <h1 class="text-2xl font-bold text-[var(--text-primary)]">
              {props.displayName}
            </h1>
            <p class="text-base text-[var(--text-secondary)]">
              {props.username}
            </p>
          </div>

          {/* Action buttons */}
          <div class="flex items-center gap-3">
            {props.isOwnProfile ? (
              props.isEditing ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => props.onSaveClick?.()}
                  disabled={props.isSaving}
                >
                  {props.isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => props.onEditClick?.()}
                >
                  Edit Profile
                </Button>
              )
            ) : (
              <>
                <FollowButton
                  isFollowing={props.isFollowing ?? false}
                  onClick={() => props.onFollowClick?.()}
                  size="md"
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => props.onMessageClick?.()}
                >
                  Message
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div class="flex items-center gap-6">
          <button class="group">
            <span class="text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)]">
              {formatCount(props.stats.followers)}
            </span>
            <span class="ml-1.5 text-sm text-[var(--text-secondary)]">
              Followers
            </span>
          </button>

          <button class="group">
            <span class="text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)]">
              {formatCount(props.stats.following)}
            </span>
            <span class="ml-1.5 text-sm text-[var(--text-secondary)]">
              Following
            </span>
          </button>

          <div>
            <span class="text-lg font-bold text-[var(--text-primary)]">
              {formatCount(props.stats.likes)}
            </span>
            <span class="ml-1.5 text-sm text-[var(--text-secondary)]">
              Likes
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
