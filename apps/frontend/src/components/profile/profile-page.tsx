import { Show, For, type Component, createSignal, createMemo } from 'solid-js'
import {
  AlbumCover,
  FeedPost,
  Scheduler,
  type TimeSlot,
  type DayAvailability,
  ProfileInfoSection,
  type ProfileInput,
  type EnsProfile,
} from '@heaven/ui'
import { ProfileHeader, type ProfileHeaderProps } from './profile-header'
import { ProfileTabs, type ProfileTab } from './profile-tabs'
import { VideoGrid, type VideoGridItem } from './video-grid'

export interface ProfileScrobble {
  id: string
  title: string
  artist: string
  album: string
  timestamp: string
  trackId: string
  coverUrl?: string
}

export interface ProfilePageProps extends Omit<ProfileHeaderProps, 'class' | 'isEditing' | 'isSaving' | 'onEditClick' | 'onSaveClick'> {
  activeTab: ProfileTab
  onTabChange?: (tab: ProfileTab) => void
  videos?: VideoGridItem[]
  onVideoClick?: (videoId: string) => void
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

  const handleEditClick = () => setIsEditing(true)

  const handleSaveClick = async () => {
    setIsSaving(true)
  }

  return (
    <div class="bg-[var(--bg-page)] min-h-screen">
      <ProfileHeader
        username={props.username}
        displayName={props.displayName}
        avatarUrl={props.avatarUrl}
        bannerGradient={props.bannerGradient}
        bannerUrl={props.profileData?.coverPhoto || props.ensProfile?.header}
        bio={props.profileData?.bio}
        url={props.profileData?.url}
        twitter={props.profileData?.twitter}
        github={props.profileData?.github}
        telegram={props.profileData?.telegram}
        verificationState={props.verificationState}
        stats={props.stats}
        isFollowing={props.isFollowing}
        isOwnProfile={props.isOwnProfile}
        isEditing={isEditing()}
        isSaving={isSaving()}
        onFollowClick={props.onFollowClick}
        onMessageClick={props.onMessageClick}
        onAvatarClick={props.onAvatarClick}
        onEditClick={handleEditClick}
        onSaveClick={handleSaveClick}
      />

      <ProfileTabs
        activeTab={props.activeTab}
        onTabChange={props.onTabChange}
      />

      <div class="p-8">
        {/* Videos Tab */}
        <Show when={props.activeTab === 'videos'}>
          <Show
            when={props.videos && props.videos.length > 0}
            fallback={
              <div class="text-center text-[var(--text-secondary)] py-20">
                <svg
                  class="w-20 h-20 mx-auto mb-4 opacity-40"
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M164.44,121.34l-48-32A8,8,0,0,0,104,96v64a8,8,0,0,0,12.44,6.66l48-32a8,8,0,0,0,0-13.32ZM120,145.05V111l25.58,17ZM216,40H40A16,16,0,0,0,24,56V168a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,128H40V56H216V168Zm16,40a8,8,0,0,1-8,8H32a8,8,0,0,1,0-16H224A8,8,0,0,1,232,208Z" />
                </svg>
                <p class="text-lg">No videos yet</p>
              </div>
            }
          >
            <VideoGrid
              videos={props.videos!}
              onVideoClick={props.onVideoClick}
            />
          </Show>
        </Show>

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
                      <FeedPost
                        authorName={props.displayName}
                        timestamp={scrobble.timestamp}
                        hideAuthor
                        contentSlot={
                          <div class="flex items-center gap-4">
                            <AlbumCover
                              src={scrobble.coverUrl}
                              alt={scrobble.album || scrobble.title}
                              class="w-14 h-14 flex-shrink-0"
                            />
                            <div class="flex-1 min-w-0">
                              <div class="text-base font-semibold text-[var(--text-primary)] truncate">{scrobble.title}</div>
                              <div class="text-base text-[var(--text-muted)] truncate">
                                {[scrobble.artist, scrobble.album].filter(Boolean).join(' \u00b7 ')}
                              </div>
                            </div>
                            <span class="text-base text-[var(--text-muted)] flex-shrink-0">{scrobble.timestamp}</span>
                          </div>
                        }
                        likes={0}
                        comments={0}
                        onLike={() => {}}
                        onComment={() => {}}
                      />
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

        {/* Health Tab */}
        <Show when={props.activeTab === 'health'}>
          <div class="text-center text-[var(--text-secondary)] py-20">
            <svg
              class="w-20 h-20 mx-auto mb-4 opacity-40"
              fill="currentColor"
              viewBox="0 0 256 256"
            >
              <path d="M178,32c-20.65,0-38.73,8.88-50,23.89C116.73,40.88,98.65,32,78,32A62.07,62.07,0,0,0,16,94c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,220.66,240,164,240,94A62.07,62.07,0,0,0,178,32ZM128,206.8C109.74,196.16,32,147.69,32,94A46.06,46.06,0,0,1,78,48c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,147.61,146.24,196.15,128,206.8Z" />
            </svg>
            <p class="text-lg font-medium">Health Stats</p>
            <p class="text-sm mt-2">Coming soon...</p>
          </div>
        </Show>

        {/* Schedule Tab */}
        <Show when={props.activeTab === 'schedule'}>
          <div class="flex gap-8">
            {/* Left: Scheduler */}
            <SchedulerDemo />

            {/* Right: Could add booking history or other info here later */}
            <div class="flex-1" />
          </div>
        </Show>
      </div>
    </div>
  )
}

// Demo scheduler with mock data
const SchedulerDemo: Component = () => {
  const [selectedDate, setSelectedDate] = createSignal<string>('')
  const [selectedSlot, setSelectedSlot] = createSignal<TimeSlot | null>(null)
  const [isBooking, setIsBooking] = createSignal(false)

  // Generate mock availability for demo - memoized so it only runs once
  const availability = createMemo(() => generateMockAvailability())

  function generateMockAvailability(): DayAvailability[] {
    const availability: DayAvailability[] = []
    const today = new Date()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()

    // Generate for next 30 days
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const date = new Date(currentYear, currentMonth, today.getDate() + dayOffset)
      const dateStr = date.toISOString().split('T')[0]

      // Skip some days to show availability patterns
      if (date.getDay() === 0 || date.getDay() === 6) continue // Skip weekends

      const slots: TimeSlot[] = []

      // Morning slots (9 AM - 12 PM)
      for (let hour = 9; hour < 12; hour++) {
        slots.push({
          startTime: `${hour.toString().padStart(2, '0')}:00`,
          endTime: `${hour.toString().padStart(2, '0')}:30`,
          isBooked: Math.random() > 0.7, // 30% booked
        })
        slots.push({
          startTime: `${hour.toString().padStart(2, '0')}:30`,
          endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
          isBooked: Math.random() > 0.7,
        })
      }

      // Afternoon slots (2 PM - 6 PM)
      for (let hour = 14; hour < 18; hour++) {
        slots.push({
          startTime: `${hour.toString().padStart(2, '0')}:00`,
          endTime: `${hour.toString().padStart(2, '0')}:30`,
          isBooked: Math.random() > 0.7,
        })
        slots.push({
          startTime: `${hour.toString().padStart(2, '0')}:30`,
          endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
          isBooked: Math.random() > 0.7,
        })
      }

      availability.push({ date: dateStr, slots })
    }

    return availability
  }

  return (
    <Scheduler
      availability={availability()}
      selectedDate={selectedDate() || availability()[0]?.date}
      selectedSlot={selectedSlot()}
      onDateSelect={setSelectedDate}
      onSlotSelect={setSelectedSlot}
      onBook={(date, slot) => {
        setIsBooking(true)
        // Simulate API call
        setTimeout(() => {
          setIsBooking(false)
          setSelectedSlot(null)
          alert(`Booking confirmed for ${date} at ${slot.startTime}`)
        }, 1500)
      }}
      isBooking={isBooking()}
      teacherTimezone="America/Los_Angeles (PST)"
      studentTimezone="America/New_York (EST)"
    />
  )
}
