import { Show, type Component, createSignal, createEffect } from 'solid-js'
import { cn } from '../../lib/classnames'
import { EditableInfoCard, EditableInfoCardSection, EditableInfoCardRow } from './editable-info-card'
import { OnboardingNameStep } from '../onboarding/onboarding-name-step'
import { LanguageEditor } from './language-editor'
import {
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
} from '../../constants/profile-options'
import { HOBBY_TAGS, SKILL_TAGS, tagsToOptions } from '../../data/tags'
import type { LanguageEntry } from '../../data/languages'
import { Globe, XLogo, GithubLogo, TelegramLogo, Image, Camera } from '../../icons'

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
            icon={<Globe class="w-4 h-4" />}
            onValueChange={(v: string | string[]) => updateField('url', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="X / Twitter"
            value={formData().twitter}
            isEditing={props.isEditing}
            placeholder="@username"
            icon={<XLogo class="w-4 h-4" />}
            onValueChange={(v: string | string[]) => updateField('twitter', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="GitHub"
            value={formData().github}
            isEditing={props.isEditing}
            placeholder="username"
            icon={<GithubLogo class="w-4 h-4" />}
            onValueChange={(v: string | string[]) => updateField('github', typeof v === 'string' ? v : undefined)}
          />
          <EditableInfoCardRow
            label="Telegram"
            value={formData().telegram}
            isEditing={props.isEditing}
            placeholder="username"
            icon={<TelegramLogo class="w-4 h-4" />}
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
                        <Image class="w-10 h-10" />
                        <span class="text-base font-medium">Upload cover photo</span>
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
                          <Camera class="w-8 h-8" />
                        </div>
                      }
                    >
                      <img src={avatarPreview()!} alt="Avatar" class="w-full h-full object-cover" />
                    </Show>
                  </div>
                  <div class="flex flex-col gap-2 flex-1">
                    <p class="text-base text-[var(--text-secondary)]">
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
                          <span class="text-base font-medium text-[var(--text-primary)] block truncate">
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
                      <div class="flex items-center gap-2 p-2 text-base text-[var(--text-muted)]">
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

      {/* Languages */}
      <EditableInfoCard>
        <EditableInfoCardSection title="Languages" isEditing={props.isEditing}>
          <LanguageEditor languages={formData().languages || []} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} onChange={(langs) => updateField('languages', langs)} />
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
          <EditableInfoCardRow label="Flexibility" value={formData().relocate} isEditing={props.isEditing} isOwnProfile={props.isOwnProfile} type="select" options={RELOCATE_OPTIONS} onValueChange={(v: string | string[]) => updateField('relocate', typeof v === 'string' ? v : undefined)} />
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
