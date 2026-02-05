import { Show, type Component, createSignal, createEffect } from 'solid-js'
import { cn } from '../../lib/utils'
import { EditableInfoCard, EditableInfoCardSection, EditableInfoCardRow } from './editable-info-card'
import { OnboardingNameStep } from '../onboarding/onboarding-name-step'
import { LanguageEditor } from './language-editor'
import {
  GENDER_OPTIONS,
  NATIONALITY_OPTIONS,
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
  alpha3ToAlpha2,
} from '../../constants/profile-options'
import { HOBBY_TAGS, SKILL_TAGS, tagsToOptions } from '../../data/tags'
import type { LanguageEntry } from '../../data/languages'
import { VerificationBadge } from './verification-badge'

const HOBBY_OPTIONS = tagsToOptions(HOBBY_TAGS)
const SKILL_OPTIONS = tagsToOptions(SKILL_TAGS)

export interface ProfileInput {
  displayName?: string
  nameHash?: string
  coverPhoto?: string
  coverFile?: File
  avatar?: string
  avatarFile?: File
  age?: number
  heightCm?: number
  gender?: string
  nationality?: string
  /** Unified language entries with CEFR proficiency levels (replaces nativeLanguage/targetLanguage) */
  languages?: LanguageEntry[]
  locationCityId?: string
  relocate?: string
  degree?: string
  fieldBucket?: string
  school?: string
  profession?: string
  industry?: string
  relationshipStatus?: string
  sexuality?: string
  ethnicity?: string
  datingStyle?: string
  children?: string
  wantsChildren?: string
  lookingFor?: string
  drinking?: string
  smoking?: string
  drugs?: string
  religion?: string
  pets?: string
  diet?: string
  bio?: string
  url?: string
  twitter?: string
  github?: string
  telegram?: string
  friendsOpenToMask?: number
  skillsCommit?: string
  hobbiesCommit?: string
  /** Tag IDs for hobbies (uint16[]), used for on-chain matching */
  hobbyTagIds?: number[]
  /** Tag IDs for skills (uint16[]), used for on-chain matching */
  skillTagIds?: number[]
}

/** Verified identity data from Self.xyz (separate from user-reported profile) */
export interface VerificationData {
  /** Whether the user has a verified passport */
  verified: boolean
  /** 3-letter ISO nationality from passport (e.g. "GBR") */
  nationality: string
}

export interface EnsProfile {
  name: string | null
  avatar: string | null
  /** Raw ENSIP-12 avatar text record (e.g. eip155:1/erc721:0x…/123, ipfs://…) */
  avatarRecord?: string | null
  /** Resolved header/banner image URL (ENS 'header' text record) */
  header?: string | null
}

export interface ProfileInfoSectionProps {
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
  /** EOA address from wallet auth (enables "import from wallet" avatar) */
  eoaAddress?: `0x${string}` | null
  /** Pre-fetched ENS profile for the EOA address */
  ensProfile?: EnsProfile | null
  /** Loading state for ENS profile fetch */
  ensLoading?: boolean
  /** Called when user selects an ENS/external avatar URI (ENSIP-12 ref or URL) */
  onImportAvatar?: (uri: string) => void
  /** Verified identity data — when present and verified, overrides age/nationality display and locks editing */
  verification?: VerificationData
}

export const ProfileInfoSection: Component<ProfileInfoSectionProps> = (props) => {
  const [formData, setFormData] = createSignal<ProfileInput>(props.profile)
  const [avatarPreview, setAvatarPreview] = createSignal<string | null>(props.profile.avatar || null)
  const [coverPreview, setCoverPreview] = createSignal<string | null>(props.profile.coverPhoto || null)
  let avatarInputRef: HTMLInputElement | undefined
  let coverInputRef: HTMLInputElement | undefined

  // Verification: derived state for locked fields
  const isVerified = () => !!props.verification?.verified
  const verifiedNationalityAlpha2 = () => {
    const nat = props.verification?.nationality
    if (!nat) return undefined
    // If already alpha-2 (2 chars), use directly; otherwise convert from alpha-3
    return nat.length === 2 ? nat.toUpperCase() : alpha3ToAlpha2(nat)
  }
  const verifiedBadge = () => <VerificationBadge state="verified" size="sm" />

  createEffect(() => {
    const profile = props.profile
    if (profile && Object.keys(profile).length > 0) {
      setFormData(profile)
      setAvatarPreview(profile.avatar || null)
      setCoverPreview(profile.coverPhoto || null)
    }
  })

  createEffect(() => {
    if (props.isSaving) {
      handleSave()
    }
  })

  const handleSave = async () => {
    if (!props.onSave) return
    try {
      const data = { ...formData() }
      // Strip verified fields so they are never written back to ProfileV1
      if (isVerified()) {
        delete data.age
        delete data.nationality
      }
      await props.onSave(data)
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
      {/* Identity — edit mode only */}
      <Show when={props.isOwnProfile}>
      <EditableInfoCard>
        <EditableInfoCardSection title="Identity" isEditing={props.isEditing}>
          <div class="flex flex-col gap-4">
            <div class="flex gap-3">
              <span class="text-base text-[var(--text-secondary)] min-w-[140px] flex-shrink-0 py-2.5">
                Heaven Name
              </span>
              <div class="flex-1 min-w-0 py-2.5">
                <Show when={!props.isEditing}>
                  <Show
                    when={props.heavenName}
                    fallback={<span class="text-base text-[var(--text-muted)] italic">+ Add heaven name</span>}
                  >
                    <span class="text-base text-[var(--text-primary)]">{props.heavenName}.heaven</span>
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
                    <span class="text-base text-[var(--text-primary)]">{props.heavenName}.heaven</span>
                  </Show>
                </Show>
              </div>
            </div>
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

      {/* Bio & Links */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Bio & Links" isEditing={props.isEditing}>
          <EditableInfoCardRow
            label="Bio"
            value={formData().bio}
            isEditing={props.isEditing}
            type="textarea"
            placeholder="Tell people about yourself..."
            maxLength={300}
            onValueChange={(v: string | string[]) => updateField('bio', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Website"
            value={formData().url}
            isEditing={props.isEditing}
            placeholder="https://yoursite.com"
            icon={<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.62,87.62,0,0,1-6.4,32.94l-44.7-27.49a15.92,15.92,0,0,0-6.24-2.23l-22.82-3.08a16.11,16.11,0,0,0-16,7.86h-8.72l-3.8-7.86a15.91,15.91,0,0,0-11-8.67l-8-1.73L96.14,104h16.71a16.06,16.06,0,0,0,7.73-2l12.25-6.76a16.62,16.62,0,0,0,3-2.14l26.91-24.34A15.93,15.93,0,0,0,166,64V49.6l3.84,1.7A88.22,88.22,0,0,1,216,128ZM40,128a87.53,87.53,0,0,1,8.54-37.8l11.34,30.27a16,16,0,0,0,11.62,10l21.43,4.61L96.74,143a16.09,16.09,0,0,0,14.4,9h1.48l-7.23,38.51A16.08,16.08,0,0,0,109,207.94l-2.36,1.78A88.18,88.18,0,0,1,40,128Zm82.08,87.82,3-2.23A16,16,0,0,0,132,200.49l7.23-38.51a16,16,0,0,0-3.25-13.14l-12.45-15A16,16,0,0,0,113,128h-4.82l7.56-15.65a16.06,16.06,0,0,0-9.73-22.1l-5.55-1.2,5.07-7.38A16,16,0,0,0,106.8,72H96.14a16,16,0,0,0-7.73,2l-12.25,6.76a16.62,16.62,0,0,0-3,2.14L56,97.54a16.07,16.07,0,0,0-4.67,9.48l-2.12,16.47a16.06,16.06,0,0,0,10.79,17l7.46,2.41-4.13,11a16.08,16.08,0,0,0,5.59,19l22.84,15.71-3.45,18.39A88.39,88.39,0,0,1,122.08,215.82Z" /></svg>}
            onValueChange={(v: string | string[]) => updateField('url', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="X / Twitter"
            value={formData().twitter}
            isEditing={props.isEditing}
            placeholder="@username"
            icon={<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256"><path d="M214.75,211.71l-62.6-98.38,61.77-67.95a8,8,0,0,0-11.84-10.76L143.24,99.34,102.75,35.71A8,8,0,0,0,96,32H48a8,8,0,0,0-6.75,12.3l62.6,98.37-61.77,68a8,8,0,1,0,11.84,10.76l58.84-64.72,40.49,63.63A8,8,0,0,0,160,224h48a8,8,0,0,0,6.75-12.29ZM164.39,208,62.57,48h29L193.43,208Z" /></svg>}
            onValueChange={(v: string | string[]) => updateField('twitter', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="GitHub"
            value={formData().github}
            isEditing={props.isEditing}
            placeholder="username"
            icon={<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256"><path d="M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.47A39.8,39.8,0,0,0,96,192v8H72a24,24,0,0,1-24-24A40,40,0,0,0,8,136a8,8,0,0,0,0,16,24,24,0,0,1,24,24,40,40,0,0,0,40,40H96v16a8,8,0,0,0,16,0V192a24,24,0,0,1,48,0v40a8,8,0,0,0,16,0V192a39.8,39.8,0,0,0-8.44-24.53A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68ZM200,112a40,40,0,0,1-40,40H112a40,40,0,0,1-40-40v-8a41.74,41.74,0,0,1,6.9-22.48A8,8,0,0,0,80,73.83a43.81,43.81,0,0,1,.79-33.58,43.88,43.88,0,0,1,32.32,20.06A8,8,0,0,0,119.82,64h32.35a8,8,0,0,0,6.74-3.69,43.87,43.87,0,0,1,32.32-20.06A43.81,43.81,0,0,1,192,73.83a8.09,8.09,0,0,0,1,7.65A41.72,41.72,0,0,1,200,104Z" /></svg>}
            onValueChange={(v: string | string[]) => updateField('github', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Telegram"
            value={formData().telegram}
            isEditing={props.isEditing}
            placeholder="username"
            icon={<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256"><path d="M228.88,26.19a9,9,0,0,0-9.16-1.57L17.06,103.93a14.22,14.22,0,0,0,2.43,27.21L72,141.45V200a15.92,15.92,0,0,0,10,14.83,15.91,15.91,0,0,0,17.51-3.73l25.32-26.26L165,220a15.88,15.88,0,0,0,10.51,4,16.3,16.3,0,0,0,5-.79,15.85,15.85,0,0,0,10.67-11.63L231.77,35A9,9,0,0,0,228.88,26.19Zm-61.14,36L78.15,126.35l-49.6-9.73ZM88,200V152.52l24.79,21.74Zm87.53,8L92.85,135.5l119-85.29Z" /></svg>}
            onValueChange={(v: string | string[]) => updateField('telegram', typeof v === 'string' ? v : undefined)}
          />
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Photos */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Photos" isEditing={props.isEditing}>
          <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-2">
              <label class="text-base text-[var(--text-secondary)]">Cover Photo</label>
              <Show when={props.isEditing}>
                <div
                  onClick={() => coverInputRef?.click()}
                  class={cn(
                    'w-full h-48 rounded-md cursor-pointer transition-all',
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
                <input ref={coverInputRef} type="file" accept="image/*" class="hidden" onChange={(e) => { const file = e.currentTarget.files?.[0]; if (file) handleFileUpload(file, 'cover') }} />
              </Show>
              <Show when={!props.isEditing && coverPreview()}>
                <img src={coverPreview()!} alt="Cover" class="w-full h-48 rounded-md object-cover" />
              </Show>
            </div>
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
                    {/* Import from ENS */}
                    <Show when={props.eoaAddress && props.ensProfile?.avatar}>
                      <button
                        type="button"
                        class={cn(
                          'flex items-center gap-3 w-full p-2 rounded-md transition-colors',
                          'bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)]',
                          'text-left'
                        )}
                        onClick={() => {
                          if (props.ensProfile?.avatar && props.onImportAvatar) {
                            props.onImportAvatar(props.ensProfile.avatar)
                            setAvatarPreview(props.ensProfile.avatar)
                          }
                        }}
                      >
                        <img
                          src={props.ensProfile!.avatar!}
                          alt="ENS avatar"
                          class="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                        <div class="min-w-0">
                          <span class="text-sm font-medium text-[var(--text-primary)] block truncate">
                            Use ENS avatar
                          </span>
                          <Show when={props.ensProfile?.name}>
                            <span class="text-xs text-[var(--text-muted)] block truncate">
                              {props.ensProfile!.name}
                            </span>
                          </Show>
                        </div>
                      </button>
                    </Show>
                    <Show when={props.eoaAddress && props.ensLoading}>
                      <div class="flex items-center gap-2 p-2 text-sm text-[var(--text-muted)]">
                        <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Checking ENS avatar...
                      </div>
                    </Show>
                    <Show when={props.eoaAddress && !props.ensLoading && !props.ensProfile?.avatar}>
                      <p class="text-xs text-[var(--text-muted)]">
                        No ENS avatar found for your wallet.
                      </p>
                    </Show>
                  </div>
                </Show>
                <Show when={!props.isEditing && avatarPreview()}>
                  <img src={avatarPreview()!} alt="Avatar" class="w-32 h-32 rounded-full object-cover shrink-0" />
                </Show>
                <input ref={avatarInputRef} type="file" accept="image/*" class="hidden" onChange={(e) => { const file = e.currentTarget.files?.[0]; if (file) handleFileUpload(file, 'avatar') }} />
              </div>
            </div>
          </div>
        </EditableInfoCardSection>
      </EditableInfoCard>
      </Show>

      {/* Basics */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Basics" isEditing={props.isEditing}>
          <EditableInfoCardRow
            label="Age"
            value={formData().age?.toString()}
            isEditing={props.isEditing}
            isOwnProfile={props.isOwnProfile}
            placeholder="Enter your age"
            onValueChange={(v: string | string[]) => updateField('age', typeof v === 'string' && v ? Number(v) : undefined)}
          />
          <EditableInfoCardRow label="Gender" value={formData().gender} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={GENDER_OPTIONS} onValueChange={(v: string | string[]) => updateField('gender', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow
            label="Nationality"
            value={isVerified() && verifiedNationalityAlpha2() ? verifiedNationalityAlpha2()! : formData().nationality}
            isEditing={props.isEditing}
            isOwnProfile={props.isOwnProfile}
            type="select"
            options={NATIONALITY_OPTIONS}
            locked={isVerified() && !!verifiedNationalityAlpha2()}
            suffix={isVerified() && verifiedNationalityAlpha2() ? verifiedBadge() : undefined}
            onValueChange={(v: string | string[]) => updateField('nationality', typeof v === 'string' ? v : undefined)}
          />
          <LanguageEditor
            languages={formData().languages || []}
            onChange={(langs) => updateField('languages', langs)}
            isEditing={props.isEditing}
            isOwnProfile={props.isOwnProfile}
          />
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Location */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Location" isEditing={props.isEditing}>
          <EditableInfoCardRow label="Location" value={formData().locationCityId} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="location" placeholder="Search for a city" onLocationChange={(loc) => updateField('locationCityId', loc.label)} />
          <EditableInfoCardRow label="Flexibility" value={formData().relocate} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={RELOCATE_OPTIONS} onValueChange={(v: string | string[]) => updateField('relocate', typeof v === 'string' ? v : undefined)} />
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Education & Career */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Education & Career" isEditing={props.isEditing}>
          <EditableInfoCardRow label="School" value={formData().school} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} placeholder="Enter your school" onValueChange={(v: string | string[]) => updateField('school', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Degree" value={formData().degree} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={DEGREE_OPTIONS} onValueChange={(v: string | string[]) => updateField('degree', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Field of study" value={formData().fieldBucket} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={FIELD_OPTIONS} onValueChange={(v: string | string[]) => updateField('fieldBucket', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Profession" value={formData().profession} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={PROFESSION_OPTIONS} onValueChange={(v: string | string[]) => updateField('profession', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Industry" value={formData().industry} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={INDUSTRY_OPTIONS} onValueChange={(v: string | string[]) => updateField('industry', typeof v === 'string' ? v : undefined)} />
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Dating */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Dating" isEditing={props.isEditing}>
          <EditableInfoCardRow label="Relationship status" value={formData().relationshipStatus} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={RELATIONSHIP_OPTIONS} onValueChange={(v: string | string[]) => updateField('relationshipStatus', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Height (cm)" value={formData().heightCm?.toString()} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} placeholder="e.g. 170" onValueChange={(v: string | string[]) => updateField('heightCm', typeof v === 'string' && v ? Number(v) : undefined)} />
          <EditableInfoCardRow label="Looking for" value={formData().lookingFor} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={LOOKING_FOR_OPTIONS} onValueChange={(v: string | string[]) => updateField('lookingFor', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Sexuality" value={formData().sexuality} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={SEXUALITY_OPTIONS} onValueChange={(v: string | string[]) => updateField('sexuality', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Ethnicity" value={formData().ethnicity} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={ETHNICITY_OPTIONS} onValueChange={(v: string | string[]) => updateField('ethnicity', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Dating style" value={formData().datingStyle} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={DATING_STYLE_OPTIONS} onValueChange={(v: string | string[]) => updateField('datingStyle', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Children" value={formData().children} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={CHILDREN_OPTIONS} onValueChange={(v: string | string[]) => updateField('children', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Wants children" value={formData().wantsChildren} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={WANTS_CHILDREN_OPTIONS} onValueChange={(v: string | string[]) => updateField('wantsChildren', typeof v === 'string' ? v : undefined)} />
        </EditableInfoCardSection>
      </EditableInfoCard>

      {/* Lifestyle */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Lifestyle" isEditing={props.isEditing}>
          <EditableInfoCardRow label="Hobbies" value={formData().hobbiesCommit} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="multiselectdropdown" options={HOBBY_OPTIONS} placeholder="Select hobbies..." onValueChange={(v: string | string[]) => updateField('hobbiesCommit', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Skills" value={formData().skillsCommit} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="multiselectdropdown" options={SKILL_OPTIONS} placeholder="Select skills..." onValueChange={(v: string | string[]) => updateField('skillsCommit', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Drinking" value={formData().drinking} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={DRINKING_OPTIONS} onValueChange={(v: string | string[]) => updateField('drinking', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Smoking" value={formData().smoking} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={SMOKING_OPTIONS} onValueChange={(v: string | string[]) => updateField('smoking', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Drugs" value={formData().drugs} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={DRUGS_OPTIONS} onValueChange={(v: string | string[]) => updateField('drugs', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Religion" value={formData().religion} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={RELIGION_OPTIONS} onValueChange={(v: string | string[]) => updateField('religion', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Pets" value={formData().pets} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={PETS_OPTIONS} onValueChange={(v: string | string[]) => updateField('pets', typeof v === 'string' ? v : undefined)} />
          <EditableInfoCardRow label="Diet" value={formData().diet} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={DIET_OPTIONS} onValueChange={(v: string | string[]) => updateField('diet', typeof v === 'string' ? v : undefined)} />
        </EditableInfoCardSection>
      </EditableInfoCard>
    </div>
  )
}
