import { Show, For, type Component, createSignal, createMemo, createEffect } from 'solid-js'
import {
  ActivityItem,
  AlbumCover,
  Scheduler,
  type TimeSlot,
  type DayAvailability,
  EditableInfoCard,
  EditableInfoCardSection,
  EditableInfoCardRow,
  cn,
  GENDER_OPTIONS,
  NATIONALITY_OPTIONS,
  LANGUAGE_OPTIONS,
  LEARNING_LANGUAGE_OPTIONS,
  RELOCATE_OPTIONS,
  DEGREE_OPTIONS,
  FIELD_OPTIONS,
  PROFESSION_OPTIONS,
  INDUSTRY_OPTIONS,
  RELATIONSHIP_OPTIONS,
  SEXUALITY_OPTIONS,
  ETHNICITY_OPTIONS,
  DATING_STYLE_OPTIONS,
  CHILDREN_OPTIONS,
  WANTS_CHILDREN_OPTIONS,
  LOOKING_FOR_OPTIONS,
  DRINKING_OPTIONS,
  SMOKING_OPTIONS,
  DRUGS_OPTIONS,
  RELIGION_OPTIONS,
  PETS_OPTIONS,
  DIET_OPTIONS,
  OnboardingNameStep,
} from '@heaven/ui'
import { ProfileHeader, type ProfileHeaderProps } from './profile-header'
import { ProfileTabs, type ProfileTab } from './profile-tabs'
import { VideoGrid, type VideoGridItem } from './video-grid'
import type { ProfileInput } from '../../lib/heaven'

export interface ProfileScrobble {
  id: string
  title: string
  artist: string
  album: string
  timestamp: string
  trackId: string
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

        {/* Activity Tab */}
        <Show when={props.activeTab === 'activity'}>
          <div class="flex gap-8">
            {/* Left: Profile Info */}
            <div class="flex-shrink-0" style={{ width: '498px' }}>
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
                />
              </Show>
            </div>

            {/* Right: Activity Feed (Scrobbles) */}
            <div class="flex flex-col flex-1">
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
                <For each={props.scrobbles}>
                  {(scrobble) => (
                    <ActivityItem
                      icon={
                        <AlbumCover
                          alt={scrobble.album || scrobble.title}
                          size="lg"
                        />
                      }
                      title={scrobble.title}
                      subtitle={[scrobble.artist, scrobble.album].filter(Boolean).join(' \u00b7 ')}
                      timestamp={scrobble.timestamp}
                      onClick={props.onScrobbleClick ? () => props.onScrobbleClick!(scrobble) : undefined}
                    />
                  )}
                </For>
              </Show>
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

// Profile info section with editable cards
interface ProfileInfoSectionProps {
  profile: ProfileInput
  isOwnProfile?: boolean
  isEditing: boolean
  isSaving: boolean
  onSave?: (data: ProfileInput) => Promise<void>
  setIsEditing: (value: boolean) => void
  setIsSaving: (value: boolean) => void
  heavenName?: string | null
  onClaimName?: (name: string) => Promise<boolean>
  onCheckNameAvailability?: (name: string) => Promise<boolean>
  nameClaiming?: boolean
  nameClaimError?: string | null
}

const ProfileInfoSection: Component<ProfileInfoSectionProps> = (props) => {
  const [formData, setFormData] = createSignal<ProfileInput>(props.profile)

  // Photo upload state
  const [avatarPreview, setAvatarPreview] = createSignal<string | null>(props.profile.avatar || null)
  const [coverPreview, setCoverPreview] = createSignal<string | null>(props.profile.coverPhoto || null)
  let avatarInputRef: HTMLInputElement | undefined
  let coverInputRef: HTMLInputElement | undefined

  // Sync form data when profile prop changes (e.g. query resolves)
  createEffect(() => {
    const profile = props.profile
    if (profile && Object.keys(profile).length > 0) {
      setFormData(profile)
      setAvatarPreview(profile.avatar || null)
      setCoverPreview(profile.coverPhoto || null)
    }
  })

  // Update parent's save handler
  createEffect(() => {
    if (props.isSaving) {
      handleSave()
    }
  })

  const handleSave = async () => {
    if (!props.onSave) return

    try {
      await props.onSave(formData())
      props.setIsEditing(false)
    } catch (error) {
      console.error('Failed to save profile:', error)
      alert('Failed to save profile. Please try again.')
    } finally {
      props.setIsSaving(false)
    }
  }

  const updateField = (field: keyof ProfileInput, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleFileUpload = (file: File, type: 'avatar' | 'cover') => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const preview = e.target?.result as string
      if (type === 'avatar') {
        setAvatarPreview(preview)
        updateField('avatar', preview)
        updateField('avatarFile', file)
      } else {
        setCoverPreview(preview)
        updateField('coverPhoto', preview)
        updateField('coverFile', file)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div class="flex flex-col gap-4">
      {/* Identity */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Identity" isEditing={props.isEditing}>
          <div class="flex flex-col gap-4">
            {/* Heaven Name */}
            <div class="flex gap-3">
              <span class="text-base text-[var(--text-secondary)] min-w-[140px] flex-shrink-0 py-2.5">
                Heaven Name
              </span>
              <div class="flex-1 min-w-0 py-2.5">
                <Show when={!props.isEditing}>
                  <Show
                    when={props.heavenName}
                    fallback={
                      <span class="text-base text-[var(--text-muted)] italic">
                        + Add heaven name
                      </span>
                    }
                  >
                    <span class="text-base text-[var(--text-primary)]">
                      {props.heavenName}.heaven
                    </span>
                  </Show>
                </Show>
                <Show when={props.isEditing}>
                  <Show
                    when={props.heavenName}
                    fallback={
                      <Show when={props.onClaimName && props.onCheckNameAvailability}>
                        <OnboardingNameStep
                          onClaim={props.onClaimName!}
                          onCheckAvailability={props.onCheckNameAvailability!}
                          claiming={props.nameClaiming ?? false}
                          error={props.nameClaimError ?? null}
                        />
                      </Show>
                    }
                  >
                    <span class="text-base text-[var(--text-primary)]">
                      {props.heavenName}.heaven
                    </span>
                  </Show>
                </Show>
              </div>
            </div>

            {/* Display Name */}
            <EditableInfoCardRow
              label="Display Name"
              value={formData().displayName}
              isEditing={props.isEditing}
              placeholder="Enter your display name"
              onValueChange={(v: string | string[]) => updateField('displayName', typeof v === 'string' ? v : undefined)}
            />
          </div>
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Photos */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Photos" isEditing={props.isEditing}>
          <div class="flex flex-col gap-6">
            {/* Cover Photo */}
            <div class="flex flex-col gap-2">
              <label class="text-base text-[var(--text-secondary)]">Cover Photo</label>
              <Show when={props.isEditing}>
                <div
                  onClick={() => coverInputRef?.click()}
                  class={cn(
                    'w-full h-48 rounded-lg cursor-pointer transition-all',
                    'border-2 border-dashed',
                    coverPreview()
                      ? 'border-transparent'
                      : 'border-[var(--bg-highlight-hover)] bg-[var(--bg-elevated)] hover:border-[var(--accent-blue)]/50',
                    'flex items-center justify-center overflow-hidden'
                  )}
                >
                  <Show
                    when={coverPreview()}
                    fallback={
                      <div class="flex flex-col items-center gap-2 text-[var(--text-muted)]">
                        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                        <span class="text-sm font-medium">Upload cover photo</span>
                      </div>
                    }
                  >
                    <img src={coverPreview()!} alt="Cover" class="w-full h-full object-cover" />
                  </Show>
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  class="hidden"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0]
                    if (file) handleFileUpload(file, 'cover')
                  }}
                />
              </Show>
              <Show when={!props.isEditing && coverPreview()}>
                <img src={coverPreview()!} alt="Cover" class="w-full h-48 rounded-lg object-cover" />
              </Show>
            </div>

            {/* Avatar */}
            <div class="flex flex-col gap-2">
              <label class="text-base text-[var(--text-secondary)]">Avatar</label>
              <div class="flex items-start gap-4">
                <Show when={props.isEditing}>
                  <div
                    onClick={() => avatarInputRef?.click()}
                    class={cn(
                      'w-32 h-32 rounded-full overflow-hidden cursor-pointer transition-all shrink-0',
                      'border-2 border-dashed',
                      avatarPreview()
                        ? 'border-transparent'
                        : 'border-[var(--bg-highlight-hover)] bg-[var(--bg-elevated)] hover:border-[var(--accent-blue)]/50',
                      'flex items-center justify-center'
                    )}
                  >
                    <Show
                      when={avatarPreview()}
                      fallback={
                        <div class="flex flex-col items-center gap-2 text-[var(--text-muted)]">
                          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                          </svg>
                        </div>
                      }
                    >
                      <img src={avatarPreview()!} alt="Avatar" class="w-full h-full object-cover" />
                    </Show>
                  </div>
                  <div class="flex flex-col gap-2 flex-1">
                    <p class="text-sm text-[var(--text-secondary)]">
                      Anime, cartoon, or illustrated avatars only. Realistic photos will be rejected.
                    </p>
                  </div>
                </Show>
                <Show when={!props.isEditing && avatarPreview()}>
                  <img src={avatarPreview()!} alt="Avatar" class="w-32 h-32 rounded-full object-cover shrink-0" />
                </Show>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  class="hidden"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0]
                    if (file) handleFileUpload(file, 'avatar')
                  }}
                />
              </div>
            </div>
          </div>
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Basics */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Basics" isEditing={props.isEditing}>
          <EditableInfoCardRow
            label="Age"
            value={formData().age?.toString()}
            isEditing={props.isEditing}
            placeholder="Enter your age"
            onValueChange={(v: string | string[]) => updateField('age', typeof v === 'string' && v ? Number(v) : undefined)}
          />
          <EditableInfoCardRow
            label="Gender"
            value={formData().gender}
            isEditing={props.isEditing}
            type="select"
            options={GENDER_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('gender', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Nationality"
            value={formData().nationality}
            isEditing={props.isEditing}
            type="select"
            options={NATIONALITY_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('nationality', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Native language"
            value={formData().nativeLanguage}
            isEditing={props.isEditing}
            type="select"
            options={LANGUAGE_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('nativeLanguage', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Learning"
            value={formData().targetLanguage}
            isEditing={props.isEditing}
            type="multiselectdropdown"
            options={LEARNING_LANGUAGE_OPTIONS}
            placeholder="Select languages you're learning"
            onValueChange={(v: string | string[]) => updateField('targetLanguage', Array.isArray(v) ? v.join(', ') : v as string)}
          />
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Location */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Location" isEditing={props.isEditing}>
          <EditableInfoCardRow
            label="Location"
            value={formData().locationCityId}
            isEditing={props.isEditing}
            type="location"
            placeholder="Search for a city"
            onLocationChange={(loc) => updateField('locationCityId', loc.label)}
          />
          <EditableInfoCardRow
            label="Flexibility"
            value={formData().relocate}
            isEditing={props.isEditing}
            type="select"
            options={RELOCATE_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('relocate', typeof v === 'string' ? v : undefined)}
          />
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Education & Career */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Education & Career" isEditing={props.isEditing}>
          <EditableInfoCardRow
            label="School"
            value={formData().school}
            isEditing={props.isEditing}
            placeholder="Enter your school"
            onValueChange={(v: string | string[]) => updateField('school', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Degree"
            value={formData().degree}
            isEditing={props.isEditing}
            type="select"
            options={DEGREE_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('degree', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Field of study"
            value={formData().fieldBucket}
            isEditing={props.isEditing}
            type="select"
            options={FIELD_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('fieldBucket', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Profession"
            value={formData().profession}
            isEditing={props.isEditing}
            type="select"
            options={PROFESSION_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('profession', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Industry"
            value={formData().industry}
            isEditing={props.isEditing}
            type="select"
            options={INDUSTRY_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('industry', typeof v === 'string' ? v : undefined)}
          />
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Dating */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Dating" isEditing={props.isEditing}>
          <EditableInfoCardRow
            label="Relationship status"
            value={formData().relationshipStatus}
            isEditing={props.isEditing}
            type="select"
            options={RELATIONSHIP_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('relationshipStatus', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Height (cm)"
            value={formData().heightCm?.toString()}
            isEditing={props.isEditing}
            placeholder="e.g. 170"
            onValueChange={(v: string | string[]) => updateField('heightCm', typeof v === 'string' && v ? Number(v) : undefined)}
          />
          <EditableInfoCardRow
            label="Looking for"
            value={formData().lookingFor}
            isEditing={props.isEditing}
            type="select"
            options={LOOKING_FOR_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('lookingFor', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Sexuality"
            value={formData().sexuality}
            isEditing={props.isEditing}
            type="select"
            options={SEXUALITY_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('sexuality', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Ethnicity"
            value={formData().ethnicity}
            isEditing={props.isEditing}
            type="select"
            options={ETHNICITY_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('ethnicity', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Dating style"
            value={formData().datingStyle}
            isEditing={props.isEditing}
            type="select"
            options={DATING_STYLE_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('datingStyle', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Children"
            value={formData().children}
            isEditing={props.isEditing}
            type="select"
            options={CHILDREN_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('children', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Wants children"
            value={formData().wantsChildren}
            isEditing={props.isEditing}
            type="select"
            options={WANTS_CHILDREN_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('wantsChildren', typeof v === 'string' ? v : undefined)}
          />
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Lifestyle */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Lifestyle" isEditing={props.isEditing}>
          <EditableInfoCardRow
            label="Hobbies"
            value={formData().hobbiesCommit}
            isEditing={props.isEditing}
            type="textarea"
            placeholder="What do you like to do for fun?"
            maxLength={200}
            onValueChange={(v: string | string[]) => updateField('hobbiesCommit', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Drinking"
            value={formData().drinking}
            isEditing={props.isEditing}
            type="select"
            options={DRINKING_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('drinking', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Smoking"
            value={formData().smoking}
            isEditing={props.isEditing}
            type="select"
            options={SMOKING_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('smoking', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Drugs"
            value={formData().drugs}
            isEditing={props.isEditing}
            type="select"
            options={DRUGS_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('drugs', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Religion"
            value={formData().religion}
            isEditing={props.isEditing}
            type="select"
            options={RELIGION_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('religion', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Pets"
            value={formData().pets}
            isEditing={props.isEditing}
            type="select"
            options={PETS_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('pets', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Diet"
            value={formData().diet}
            isEditing={props.isEditing}
            type="select"
            options={DIET_OPTIONS}
            onValueChange={(v: string | string[]) => updateField('diet', typeof v === 'string' ? v : undefined)}
          />
        </EditableInfoCardSection>
      </EditableInfoCard>
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
