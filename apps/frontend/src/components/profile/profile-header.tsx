import { type Component, Show } from 'solid-js'
import { cn, Avatar, Button, VerificationBadge, type VerificationState, FollowButton, MapPin, abbreviateLocation } from '@heaven/ui'

const GENDER_ABBREV: Record<string, string> = {
  woman: 'F', man: 'M', 'non-binary': 'NB',
  'trans-woman': 'TW', 'trans-man': 'TM', intersex: 'IX', other: 'O',
}

export interface ProfileHeaderProps {
  class?: string
  username: string
  displayName: string
  avatarUrl?: string
  /** ISO 3166-1 alpha-2 nationality code (e.g. "US"). Shows a flag badge on the avatar. */
  nationalityCode?: string
  bannerGradient?: string
  bannerUrl?: string
  bio?: string
  url?: string
  twitter?: string
  github?: string
  telegram?: string
  isFollowing?: boolean
  isOwnProfile?: boolean
  verificationState?: VerificationState
  isEditing?: boolean
  isSaving?: boolean
  onFollowClick?: () => void
  onMessageClick?: () => void
  onAvatarClick?: () => void
  onEditClick?: () => void
  onSaveClick?: () => void
  onVerifyClick?: () => void
  // Additional metadata to display
  age?: number
  gender?: string
  location?: string
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
  return (
    <div class={cn('relative', props.class)}>
      {/* Banner - image or gradient background */}
      <Show
        when={props.bannerUrl}
        fallback={
          <div
            class="h-32 md:h-48 w-full"
            style={{
              background: props.bannerGradient ?? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
          />
        }
      >
        <img
          src={props.bannerUrl}
          alt="Banner"
          class="h-32 md:h-48 w-full object-cover"
        />
      </Show>

      {/* Content container with avatar overlapping banner */}
      <div class="px-4 md:px-8 pb-6">
        {/* Avatar - positioned to overlap banner */}
        <div
          class="-mt-12 md:-mt-20 mb-4 cursor-pointer inline-block"
          onClick={() => props.onAvatarClick?.()}
          role={props.onAvatarClick ? 'button' : undefined}
          tabIndex={props.onAvatarClick ? 0 : undefined}
        >
          <Avatar
            src={props.avatarUrl}
            alt={props.displayName}
            size="2xl"
            nationalityCode={props.nationalityCode}
            class="md:!w-32 md:!h-32"
          />
        </div>

        {/* Name and buttons row */}
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
          <div class="flex flex-col gap-0.5">
            {/* Name + age/gender inline */}
            <div class="flex items-baseline gap-2">
              <h1 class="text-xl md:text-2xl font-bold text-[var(--text-primary)] inline-flex items-center gap-1.5">
                {props.displayName}
                <VerificationBadge state={props.verificationState ?? 'none'} size="md" />
              </h1>
              <Show when={props.age || props.gender}>
                <span class="text-lg md:text-xl text-[var(--text-muted)]">
                  {[
                    props.age && props.age > 0 ? String(props.age) : null,
                    GENDER_ABBREV[props.gender ?? ''] ?? props.gender,
                  ].filter(Boolean).join('')}
                </span>
              </Show>
            </div>
            <p class="text-base text-[var(--text-secondary)]">
              {props.username}
            </p>
            {/* Location below username */}
            <Show when={props.location}>
              <p class="flex items-center gap-1.5 text-base text-[var(--text-muted)]">
                <MapPin class="w-[18px] h-[18px] flex-shrink-0" />
                {abbreviateLocation(props.location!)}
              </p>
            </Show>
          </div>

          {/* Action buttons */}
          <div class="flex items-center gap-2 md:gap-3">
            {props.isOwnProfile ? (
              props.isEditing ? (
                <Button
                  variant="default"
                  size="md"
                  onClick={() => props.onSaveClick?.()}
                  disabled={props.isSaving}
                  class="flex-1 md:flex-none"
                >
                  {props.isSaving ? 'Saving...' : 'Save'}
                </Button>
              ) : (
                <>
                  <Show when={props.verificationState !== 'verified' && props.onVerifyClick}>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => props.onVerifyClick?.()}
                      class="flex-1 md:flex-none"
                    >
                      Verify
                    </Button>
                  </Show>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => props.onEditClick?.()}
                    class="flex-1 md:flex-none"
                  >
                    Edit Profile
                  </Button>
                </>
              )
            ) : (
              <>
                <FollowButton
                  isFollowing={props.isFollowing ?? false}
                  onClick={() => props.onFollowClick?.()}
                  size="md"
                  class="flex-1 md:flex-none md:min-w-[110px]"
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => props.onMessageClick?.()}
                  class="flex-1 md:flex-none md:min-w-[110px]"
                >
                  Message
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Bio & Links (Instagram/Facebook style) */}
        <Show when={props.bio || props.url || props.twitter || props.github || props.telegram}>
          <div class="mb-4 flex flex-col gap-2">
            <Show when={props.bio}>
              <p class="text-base text-[var(--text-primary)] whitespace-pre-wrap">{props.bio}</p>
            </Show>
            <div class="flex items-center gap-4 flex-wrap">
              <Show when={props.url}>
                <a
                  href={props.url!.startsWith('http') ? props.url : `https://${props.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-1.5 text-base text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256"><path d="M137.54,186.36a8,8,0,0,1,0,11.31l-9.94,10A56,56,0,0,1,48.38,128.4L72.5,104.28A56,56,0,0,1,149.31,102a8,8,0,1,1-10.64,12,40,40,0,0,0-54.85,1.63L59.7,139.72a40,40,0,0,0,56.58,56.58l9.94-9.94A8,8,0,0,1,137.54,186.36Zm70.08-138a56.08,56.08,0,0,0-79.22,0l-9.94,9.95a8,8,0,0,0,11.32,11.31l9.94-9.94a40,40,0,0,1,56.58,56.58L172.18,140.4A40,40,0,0,1,117.33,142a8,8,0,1,0-10.64,12,56,56,0,0,0,76.81-2.26l24.12-24.12A56.08,56.08,0,0,0,207.62,48.38Z" /></svg>
                  {props.url!.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </Show>
              <Show when={props.twitter}>
                <a
                  href={`https://x.com/${props.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-1.5 text-base text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256"><path d="M214.75,211.71l-62.6-98.38,61.77-67.95a8,8,0,0,0-11.84-10.76L143.24,99.34,102.75,35.71A8,8,0,0,0,96,32H48a8,8,0,0,0-6.75,12.3l62.6,98.37-61.77,68a8,8,0,1,0,11.84,10.76l58.84-64.72,40.49,63.63A8,8,0,0,0,160,224h48a8,8,0,0,0,6.75-12.29ZM164.39,208,62.57,48h29L193.43,208Z" /></svg>
                  {props.twitter}
                </a>
              </Show>
              <Show when={props.github}>
                <a
                  href={`https://github.com/${props.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-1.5 text-base text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256"><path d="M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.47A39.8,39.8,0,0,0,96,192v8H72a24,24,0,0,1-24-24A40,40,0,0,0,8,136a8,8,0,0,0,0,16,24,24,0,0,1,24,24,40,40,0,0,0,40,40H96v16a8,8,0,0,0,16,0V192a24,24,0,0,1,48,0v40a8,8,0,0,0,16,0V192a39.8,39.8,0,0,0-8.44-24.53A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68ZM200,112a40,40,0,0,1-40,40H112a40,40,0,0,1-40-40v-8a41.74,41.74,0,0,1,6.9-22.48A8,8,0,0,0,80,73.83a43.81,43.81,0,0,1,.79-33.58,43.88,43.88,0,0,1,32.32,20.06A8,8,0,0,0,119.82,64h32.35a8,8,0,0,0,6.74-3.69,43.87,43.87,0,0,1,32.32-20.06A43.81,43.81,0,0,1,192,73.83a8.09,8.09,0,0,0,1,7.65A41.72,41.72,0,0,1,200,104Z" /></svg>
                  {props.github}
                </a>
              </Show>
              <Show when={props.telegram}>
                <a
                  href={`https://t.me/${props.telegram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-1.5 text-base text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256"><path d="M228.88,26.19a9,9,0,0,0-9.16-1.57L17.06,103.93a14.22,14.22,0,0,0,2.43,27.21L72,141.45V200a15.92,15.92,0,0,0,10,14.83,15.91,15.91,0,0,0,17.51-3.73l25.32-26.26L165,220a15.88,15.88,0,0,0,10.51,4,16.3,16.3,0,0,0,5-.79,15.85,15.85,0,0,0,10.67-11.63L231.77,35A9,9,0,0,0,228.88,26.19Zm-61.14,36L78.15,126.35l-49.6-9.73ZM88,200V152.52l24.79,21.74Zm87.53,8L92.85,135.5l119-85.29Z" /></svg>
                  {props.telegram}
                </a>
              </Show>
            </div>
          </div>
        </Show>

      </div>
    </div>
  )
}
