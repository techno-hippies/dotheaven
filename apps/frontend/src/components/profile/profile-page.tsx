import { Show, For, type Component, type JSX, createSignal } from 'solid-js'
import {
  AlbumCover,
  ProfileInfoSection,
  ScheduleTab,
  IconButton,
  type ProfileInput,
  type EnsProfile,
  type VerificationData,
  type TimeSlot,
  type SessionSlotData,
  type SessionRequestData,
} from '@heaven/ui'
import { ProfileHeader, type ProfileHeaderProps } from './profile-header'
import { ProfileTabs, type ProfileTab } from './profile-tabs'

const ChevronLeftIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
  </svg>
)

export interface ProfileScrobble {
  id: string
  title: string
  artist: string
  album: string
  timestamp: string
  trackId: string
  coverUrl?: string
}

export interface ProfilePageProps extends Omit<ProfileHeaderProps, 'class' | 'isEditing' | 'isSaving' | 'onEditClick' | 'onSaveClick' | 'onSettingsClick'> {
  activeTab: ProfileTab
  onTabChange?: (tab: ProfileTab) => void
  scrobbles?: ProfileScrobble[]
  scrobblesLoading?: boolean
  onScrobbleClick?: (scrobble: ProfileScrobble) => void
  // Profile editing (only shown on own profile)
  profileData?: ProfileInput | null
  profileLoading?: boolean
  onProfileSave?: (data: ProfileInput) => Promise<void>
  // Heaven name
  heavenName?: string | null
  onClaimName?: (name: string) => Promise<boolean>
  onCheckNameAvailability?: (name: string) => Promise<boolean>
  nameClaiming?: boolean
  nameClaimError?: string | null
  // ENS/wallet avatar import
  eoaAddress?: `0x${string}` | null
  ensProfile?: EnsProfile | null
  ensLoading?: boolean
  onImportAvatar?: (uri: string) => void
  // Verification (Self.xyz)
  verification?: VerificationData
  // Settings (inline on profile page)
  settingsSlot?: JSX.Element
  // Schedule
  scheduleBasePrice?: string
  scheduleAccepting?: boolean
  scheduleAvailability?: TimeSlot[]
  scheduleSlots?: SessionSlotData[]
  scheduleSlotsLoading?: boolean
  scheduleRequests?: SessionRequestData[]
  scheduleRequestsLoading?: boolean
  onSetBasePrice?: (priceEth: string) => void
  onToggleAccepting?: (accepting: boolean) => void
  onAvailabilityChange?: (slots: TimeSlot[]) => void
  onCancelSlot?: (slotId: number) => void
  onBookSlot?: (slotId: number) => void
  onAcceptRequest?: (requestId: number) => void
  onDeclineRequest?: (requestId: number) => void
  onRequestCustomTime?: (params: { windowStart: number; windowEnd: number; durationMins: number; amountEth: string }) => void
}

/**
 * ProfilePage - Complete profile page with header, tabs, and content
 *
 * Features:
 * - ProfileHeader with banner, avatar, stats
 * - ProfileTabs navigation
 * - Content area that switches based on active tab
 * - Video grid for Videos tab
 * - Placeholder states for other tabs
 */
export const ProfilePage: Component<ProfilePageProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false)
  const [isSaving, setIsSaving] = createSignal(false)
  const [showSettings, setShowSettings] = createSignal(false)

  const handleEditClick = () => setIsEditing(true)

  const handleSaveClick = async () => {
    setIsSaving(true)
  }

  return (
    <div class="bg-[var(--bg-page)] min-h-screen">
      <Show
        when={!showSettings()}
        fallback={
          /* ── Settings view ── */
          <div class="max-w-2xl mx-auto px-4 md:px-8 py-6">
            <div class="flex items-center gap-3 mb-6">
              <IconButton
                variant="soft"
                size="lg"
                aria-label="Back to profile"
                onClick={() => setShowSettings(false)}
              >
                <ChevronLeftIcon />
              </IconButton>
              <h1 class="text-xl font-bold text-[var(--text-primary)]">Settings</h1>
            </div>
            {props.settingsSlot}
          </div>
        }
      >
        <ProfileHeader
          username={props.username}
          displayName={props.displayName}
          avatarUrl={props.avatarUrl}
          nationalityCode={props.nationalityCode}
          bannerGradient={props.bannerGradient}
          bannerUrl={props.profileData?.coverPhoto || props.ensProfile?.header || undefined}
          bio={props.profileData?.bio}
          url={props.profileData?.url}
          twitter={props.profileData?.twitter}
          github={props.profileData?.github}
          telegram={props.profileData?.telegram}
          verificationState={props.verificationState}
          isFollowing={props.isFollowing}
          isOwnProfile={props.isOwnProfile}
          isEditing={isEditing()}
          isSaving={isSaving()}
          onFollowClick={props.onFollowClick}
          onMessageClick={props.onMessageClick}
          onAvatarClick={props.onAvatarClick}
          onEditClick={handleEditClick}
          onSaveClick={handleSaveClick}
          onVerifyClick={props.onVerifyClick}
          onSettingsClick={props.settingsSlot ? () => setShowSettings(true) : undefined}
          age={props.profileData?.age}
          gender={props.profileData?.gender}
          languages={props.profileData?.languages}
          location={props.profileData?.locationCityId}
          flexibility={props.profileData?.relocate}
        />

        <ProfileTabs
          activeTab={props.activeTab}
          onTabChange={props.onTabChange}
        />

        <div class="p-4 md:p-8">
          {/* About Tab */}
          <Show when={props.activeTab === 'about'}>
            <div class="max-w-[600px]">
              <Show
                when={!props.profileLoading}
                fallback={
                  <div class="py-12 text-center text-[var(--text-muted)]">
                    Loading profile...
                  </div>
                }
              >
                <ProfileInfoSection
                  profile={props.profileData || {}}
                  isOwnProfile={props.isOwnProfile}
                  isEditing={isEditing()}
                  isSaving={isSaving()}
                  onSave={props.onProfileSave}
                  setIsEditing={setIsEditing}
                  setIsSaving={setIsSaving}
                  heavenName={props.heavenName}
                  onClaimName={props.onClaimName}
                  onCheckNameAvailability={props.onCheckNameAvailability}
                  nameClaiming={props.nameClaiming}
                  nameClaimError={props.nameClaimError}
                  eoaAddress={props.eoaAddress}
                  ensProfile={props.ensProfile}
                  ensLoading={props.ensLoading}
                  onImportAvatar={props.onImportAvatar}
                  verification={props.verification}
                />
              </Show>
            </div>
          </Show>

          {/* Activity Tab */}
          <Show when={props.activeTab === 'activity'}>
            <div class="-mx-8">
                <Show when={props.scrobblesLoading}>
                  <div class="py-12 text-center text-[var(--text-muted)]">
                    Loading activity...
                  </div>
                </Show>
                <Show when={!props.scrobblesLoading && (!props.scrobbles || props.scrobbles.length === 0)}>
                  <div class="py-12 text-center text-[var(--text-muted)]">
                    <svg class="w-16 h-16 mx-auto mb-3 opacity-40" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M212.92,25.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,64V174.08A36,36,0,1,0,88,204V70.25l112-28v99.83A36,36,0,1,0,216,172V32A8,8,0,0,0,212.92,25.69ZM52,224a20,20,0,1,1,20-20A20,20,0,0,1,52,224Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,192Z" />
                    </svg>
                    <p class="text-base">No scrobbles yet</p>
                  </div>
                </Show>
                <Show when={!props.scrobblesLoading && props.scrobbles && props.scrobbles.length > 0}>
                  <div class="divide-y divide-[var(--bg-highlight)]">
                    <For each={props.scrobbles}>
                      {(scrobble) => (
                        <div class="flex items-center gap-4 py-3 px-4">
                          <AlbumCover
                            src={scrobble.coverUrl}
                            alt={scrobble.album || scrobble.title}
                            class="w-14 h-14 flex-shrink-0"
                          />
                          <div class="flex-1 min-w-0">
                            <div class="text-base font-semibold text-[var(--text-primary)] truncate">{scrobble.title}</div>
                            <div class="text-base text-[var(--text-muted)] truncate">
                              {[scrobble.artist, scrobble.album].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <span class="text-base text-[var(--text-muted)] flex-shrink-0">{scrobble.timestamp}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
            </div>
          </Show>

          {/* Music Tab */}
          <Show when={props.activeTab === 'music'}>
            <div class="text-center text-[var(--text-secondary)] py-20">
              <svg
                class="w-20 h-20 mx-auto mb-4 opacity-40"
                fill="currentColor"
                viewBox="0 0 256 256"
              >
                <path d="M212.92,25.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,64V174.08A36,36,0,1,0,88,204V70.25l112-28v99.83A36,36,0,1,0,216,172V32A8,8,0,0,0,212.92,25.69ZM52,224a20,20,0,1,1,20-20A20,20,0,0,1,52,224Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,192Z" />
              </svg>
              <p class="text-lg font-medium">Music Collection</p>
              <p class="text-sm mt-2">Coming soon...</p>
            </div>
          </Show>

          {/* Schedule Tab */}
          <Show when={props.activeTab === 'schedule'}>
            <ScheduleTab
              isOwnProfile={props.isOwnProfile}
              basePrice={props.scheduleBasePrice}
              acceptingBookings={props.scheduleAccepting}
              availability={props.scheduleAvailability}
              slots={props.scheduleSlots}
              slotsLoading={props.scheduleSlotsLoading}
              requests={props.scheduleRequests}
              requestsLoading={props.scheduleRequestsLoading}
              onSetBasePrice={props.onSetBasePrice}
              onToggleAccepting={props.onToggleAccepting}
              onAvailabilityChange={props.onAvailabilityChange}
              onCancelSlot={props.onCancelSlot}
              onBookSlot={props.onBookSlot}
              onAcceptRequest={props.onAcceptRequest}
              onDeclineRequest={props.onDeclineRequest}
              onRequestCustomTime={props.onRequestCustomTime}
            />
          </Show>

        </div>
      </Show>
    </div>
  )
}

