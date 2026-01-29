import { Show, type Component, createSignal, createMemo } from 'solid-js'
import { ActivityItem, AlbumCover, InfoCard, InfoCardSection, InfoCardRow, Scheduler, type TimeSlot, type DayAvailability } from '@heaven/ui'
import { ProfileHeader, type ProfileHeaderProps } from './profile-header'
import { ProfileTabs, type ProfileTab } from './profile-tabs'
import { VideoGrid, type VideoGridItem } from './video-grid'

export interface ProfilePageProps extends Omit<ProfileHeaderProps, 'class'> {
  activeTab: ProfileTab
  onTabChange?: (tab: ProfileTab) => void
  videos?: VideoGridItem[]
  onVideoClick?: (videoId: string) => void
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
  return (
    <div class="bg-[var(--bg-page)] min-h-screen">
      <ProfileHeader
        username={props.username}
        displayName={props.displayName}
        avatarUrl={props.avatarUrl}
        bannerGradient={props.bannerGradient}
        stats={props.stats}
        isFollowing={props.isFollowing}
        isOwnProfile={props.isOwnProfile}
        onFollowClick={props.onFollowClick}
        onMessageClick={props.onMessageClick}
        onAvatarClick={props.onAvatarClick}
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

        {/* Activity Tab */}
        <Show when={props.activeTab === 'activity'}>
          <div class="flex gap-8">
            {/* Left: Info Cards */}
            <div class="flex flex-col gap-4 w-[498px] flex-shrink-0">
              <InfoCard>
                <InfoCardSection title="Basics">
                  <InfoCardRow label="Age" value="28" />
                  <InfoCardRow label="Gender" value="Woman" />
                  <InfoCardRow label="Nationality" value="French" />
                  <InfoCardRow label="Native language" value="English" />
                  <InfoCardRow label="Learning" value="Spanish, Japanese" />
                </InfoCardSection>
              </InfoCard>

              <InfoCard>
                <InfoCardSection title="Location">
                  <InfoCardRow label="Location" value="San Francisco" />
                  <InfoCardRow label="Flexibility" value="Open to relocating" />
                </InfoCardSection>
              </InfoCard>

              <InfoCard>
                <InfoCardSection title="Education & Career">
                  <InfoCardRow label="School" value="Stanford University" />
                  <InfoCardRow label="Degree" value="Bachelor of Science" />
                  <InfoCardRow label="Field of study" value="Computer Science" />
                  <InfoCardRow label="Profession" value="Software Engineer" />
                  <InfoCardRow label="Industry" value="Technology" />
                  <InfoCardRow label="Skills" value="React, TypeScript, Design" />
                </InfoCardSection>
              </InfoCard>

              <InfoCard>
                <InfoCardSection title="Dating">
                  <InfoCardRow label="Relationship status" value="Single" />
                  <InfoCardRow label="Height" value={`5'7" (170 cm)`} />
                  <InfoCardRow label="Sexuality" value="Bisexual" />
                  <InfoCardRow label="Ethnicity" value="White / Caucasian" />
                  <InfoCardRow label="Dating style" value="Monogamous" />
                  <InfoCardRow label="Friends open to" value="Men, Women" />
                  <InfoCardRow label="Children" value="None" />
                  <InfoCardRow label="Wants children" value="Open to it" />
                </InfoCardSection>
              </InfoCard>

              <InfoCard>
                <InfoCardSection title="Lifestyle">
                  <InfoCardRow label="Hobbies" value="Photography, Hiking, Cooking" />
                  <InfoCardRow label="Drinking" value="Socially" />
                  <InfoCardRow label="Smoking" value="No" />
                  <InfoCardRow label="Drugs" value="Never" />
                </InfoCardSection>
              </InfoCard>
            </div>

            {/* Right: Activity Feed */}
            <div class="flex flex-col flex-1">
              <ActivityItem
                icon={
                  <div class="w-[72px] h-[72px] rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
                    <svg class="w-10 h-10 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M235.54,150.21a104.84,104.84,0,0,1-37,52.91A104,104,0,0,1,32,120,103.09,103.09,0,0,1,52.88,57.48a104.84,104.84,0,0,1,52.91-37,8,8,0,0,1,10,10,88.08,88.08,0,0,0,109.8,109.8,8,8,0,0,1,10,10Z" />
                    </svg>
                  </div>
                }
                title="Sleep"
                subtitle="7 hours 30 min"
                timestamp="8h ago"
              />

              <ActivityItem
                icon={
                  <div class="w-[72px] h-[72px] rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
                    <svg class="w-10 h-10 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M231.16,166.63l-28.63-14.31A47.74,47.74,0,0,1,176,109.39V80a8,8,0,0,0-8-8,48.05,48.05,0,0,1-48-48,8,8,0,0,0-12.83-6.37L30.13,76l-.2.16a16,16,0,0,0-1.24,23.75L142.4,213.66a8,8,0,0,0,5.66,2.34H224a16,16,0,0,0,16-16V180.94A15.92,15.92,0,0,0,231.16,166.63ZM224,200H151.37L40,88.63l12.87-9.76,38.79,38.79A8,8,0,0,0,103,106.34L65.74,69.11l40-30.31A64.15,64.15,0,0,0,160,87.5v21.89a63.65,63.65,0,0,0,35.38,57.24L224,180.94ZM70.8,184H32a8,8,0,0,1,0-16H70.8a8,8,0,1,1,0,16Zm40,24a8,8,0,0,1-8,8H48a8,8,0,0,1,0-16h54.8A8,8,0,0,1,110.8,208Z" />
                    </svg>
                  </div>
                }
                title="Run"
                subtitle="45 min · 6.2 km"
                timestamp="5h ago"
              />

              <ActivityItem
                icon={
                  <AlbumCover
                    src="https://picsum.photos/seed/chill/200/200"
                    alt="Late Night Chill"
                    size="lg"
                  />
                }
                title="Shared Late Night Chill"
                subtitle="Playlist · 24 songs"
                timestamp="1d ago"
                onClick={() => console.log('Playlist clicked')}
              />

              <ActivityItem
                icon={
                  <div class="w-[72px] h-[72px] grid grid-cols-2 grid-rows-2 gap-1 rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
                    <img src="https://picsum.photos/seed/1/100/100" alt="Album 1" class="w-full h-full object-cover" />
                    <img src="https://picsum.photos/seed/2/100/100" alt="Album 2" class="w-full h-full object-cover" />
                    <img src="https://picsum.photos/seed/3/100/100" alt="Album 3" class="w-full h-full object-cover" />
                    <img src="https://picsum.photos/seed/4/100/100" alt="Album 4" class="w-full h-full object-cover" />
                  </div>
                }
                title="Scrobbled 12 songs"
                subtitle="Tool, Tame Impala +5 others"
                timestamp="2h ago"
                onClick={() => console.log('Scrobble clicked')}
              />

              <ActivityItem
                icon={
                  <AlbumCover
                    src="https://picsum.photos/seed/artist/200/200"
                    alt="The Weeknd"
                    size="lg"
                  />
                }
                title="The Weeknd, Dua Lipa"
                subtitle="8 songs"
                timestamp="3d ago"
                onClick={() => console.log('Artist clicked')}
              />
            </div>
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
