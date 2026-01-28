import { Show, type Component } from 'solid-js'
import { InfoCard, InfoCardSection, InfoCardRow } from '@heaven/ui'
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
          <div class="flex flex-col gap-4 max-w-[498px]">
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
      </div>
    </div>
  )
}
