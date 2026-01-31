import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal, Show } from 'solid-js'
import { EditableInfoCard, EditableInfoCardSection, EditableInfoCardRow } from './editable-info-card'
import { OnboardingNameStep } from './onboarding-name-step'
import { Button } from '../primitives'
import { cn } from '../lib/utils'
import {
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
} from '../constants/profile-options'

const meta = {
  title: 'Composite/EditableInfoCard',
  component: EditableInfoCard,
  parameters: {
    layout: 'padded',
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof EditableInfoCard>

export default meta
type Story = StoryObj<typeof meta>


/**
 * Facebook mid-2010s style profile editor
 * Shows "Edit Profile" button that toggles inline editing
 */
export const ProfileEditor: Story = {
  render: () => {
    const [isEditing, setIsEditing] = createSignal(false)
    const [isSaving, setIsSaving] = createSignal(false)

    // Identity
    const [hasHeavenName, setHasHeavenName] = createSignal(true)
    const [heavenName, setHeavenName] = createSignal('alice')
    const [displayName, setDisplayName] = createSignal('Alice Wonderland')
    const [claiming, setClaiming] = createSignal(false)
    const [claimError, setClaimError] = createSignal<string | null>(null)

    // Photos
    const [avatarPreview, setAvatarPreview] = createSignal<string | null>('https://picsum.photos/seed/alice/200/200')
    const [coverPreview, setCoverPreview] = createSignal<string | null>('https://picsum.photos/seed/cover/1200/300')
    const [avatarFile, setAvatarFile] = createSignal<File | null>(null)
    const [coverFile, setCoverFile] = createSignal<File | null>(null)
    let avatarInputRef: HTMLInputElement | undefined
    let coverInputRef: HTMLInputElement | undefined

    // Profile state - using enum values from contract
    const [age, setAge] = createSignal('28')
    const [gender, setGender] = createSignal('Woman')
    const [nationality, setNationality] = createSignal('French')
    const [nativeLanguage, setNativeLanguage] = createSignal('English')
    const [learningLanguages, setLearningLanguages] = createSignal('es, ja') // ISO codes: Spanish, Japanese

    const [location, setLocation] = createSignal('San Francisco')
    const [flexibility, setFlexibility] = createSignal('Maybe')

    const [school, setSchool] = createSignal('Stanford University')
    const [degree, setDegree] = createSignal('Bachelor')
    const [fieldOfStudy, setFieldOfStudy] = createSignal('Computer Science')
    const [profession, setProfession] = createSignal('Software Engineer')
    const [industry, setIndustry] = createSignal('Technology')
    const [skills, setSkills] = createSignal('React, TypeScript, Design')

    const [relationshipStatus, setRelationshipStatus] = createSignal('Single')
    const [height, setHeight] = createSignal('170')
    const [sexuality, setSexuality] = createSignal('Bisexual')
    const [ethnicity, setEthnicity] = createSignal('White')
    const [datingStyle, setDatingStyle] = createSignal('Monogamous')
    const [lookingFor, setLookingFor] = createSignal('Serious')
    const [children, setChildren] = createSignal('None')
    const [wantsChildren, setWantsChildren] = createSignal('Open to it')

    const [hobbies, setHobbies] = createSignal('Photography, Hiking, Cooking')
    const [drinking, setDrinking] = createSignal('Socially')
    const [smoking, setSmoking] = createSignal('No')
    const [drugs, setDrugs] = createSignal('Never')
    const [religion, setReligion] = createSignal('Agnostic')
    const [pets, setPets] = createSignal('Has pets')
    const [diet, setDiet] = createSignal('Omnivore')

    const handleCheckNameAvailability = async (name: string): Promise<boolean> => {
      await new Promise(resolve => setTimeout(resolve, 400))
      const taken = ['alice', 'bob', 'heaven', 'admin', 'test']
      return !taken.includes(name.toLowerCase())
    }

    const handleClaimName = async (name: string) => {
      setClaiming(true)
      setClaimError(null)
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (Math.random() < 0.1) {
        setClaimError('Registration failed. Please try again.')
        setClaiming(false)
        return false
      }

      setHeavenName(name)
      setHasHeavenName(true)
      setClaiming(false)
      console.log('[Profile] Name claimed:', name)
      return true
    }

    const handleFileUpload = (file: File, type: 'avatar' | 'cover') => {
      if (!file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = (e) => {
        const preview = e.target?.result as string
        if (type === 'avatar') {
          setAvatarPreview(preview)
          setAvatarFile(file)
        } else {
          setCoverPreview(preview)
          setCoverFile(file)
        }
      }
      reader.readAsDataURL(file)
    }

    const handleSave = () => {
      setIsSaving(true)
      setTimeout(() => {
        setIsSaving(false)
        setIsEditing(false)
        alert('Profile saved!')
      }, 1000)
    }

    return (
      <div class="max-w-[600px] mx-auto p-8">
        {/* Header with Edit/Save button */}
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold text-[var(--text-primary)]">
            Profile Information
          </h1>
          {!isEditing() ? (
            <Button
              variant="secondary"
              onClick={() => setIsEditing(true)}
            >
              Edit Profile
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              loading={isSaving()}
            >
              Save Changes
            </Button>
          )}
        </div>

        {/* Editing mode banner (Facebook style) */}
        {isEditing() && (
          <div class="bg-[var(--bg-highlight)] rounded-lg p-4 mb-6 border-l-4 border-[var(--accent-blue)]">
            <p class="text-[var(--text-primary)] font-medium">
              Editing your profile
            </p>
            <p class="text-[var(--text-secondary)] text-sm mt-1">
              Complete your profile to help others get to know you better
            </p>
          </div>
        )}

        {/* Profile sections */}
        <div class="flex flex-col gap-4">
          {/* Identity */}
          <EditableInfoCard>
            <EditableInfoCardSection title="Identity" isEditing={isEditing()}>
              <div class="flex flex-col gap-4">
                {/* Heaven Name */}
                <div class="flex gap-3">
                  <span class="text-base text-[var(--text-secondary)] min-w-[140px] flex-shrink-0 py-2.5">
                    Heaven Name
                  </span>
                  <div class="flex-1 min-w-0 py-2.5">
                    <Show when={!isEditing()}>
                      <Show
                        when={hasHeavenName()}
                        fallback={
                          <span class="text-base text-[var(--text-muted)] italic">
                            + Add heaven name
                          </span>
                        }
                      >
                        <span class="text-base text-[var(--text-primary)]">
                          {heavenName()}.heaven
                        </span>
                      </Show>
                    </Show>
                    <Show when={isEditing()}>
                      <Show
                        when={hasHeavenName()}
                        fallback={
                          <OnboardingNameStep
                            onClaim={handleClaimName}
                            onCheckAvailability={handleCheckNameAvailability}
                            claiming={claiming()}
                            error={claimError()}
                          />
                        }
                      >
                        <span class="text-base text-[var(--text-primary)]">
                          {heavenName()}.heaven
                        </span>
                      </Show>
                    </Show>
                  </div>
                </div>

                {/* Display Name */}
                <EditableInfoCardRow
                  label="Display Name"
                  value={displayName()}
                  isEditing={isEditing()}
                  placeholder="Enter your display name"
                  onValueChange={(v) => setDisplayName(v as string)}
                />
              </div>
            </EditableInfoCardSection>
          </EditableInfoCard>

          {/* Photos */}
          <EditableInfoCard>
            <EditableInfoCardSection title="Photos" isEditing={isEditing()}>
              <div class="flex flex-col gap-6">
                {/* Cover Photo */}
                <div class="flex flex-col gap-2">
                  <label class="text-base text-[var(--text-secondary)]">Cover Photo</label>
                  <Show when={isEditing()}>
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
                  <Show when={!isEditing() && coverPreview()}>
                    <img src={coverPreview()!} alt="Cover" class="w-full h-48 rounded-lg object-cover" />
                  </Show>
                </div>

                {/* Avatar */}
                <div class="flex flex-col gap-2">
                  <label class="text-base text-[var(--text-secondary)]">Avatar</label>
                  <div class="flex items-start gap-4">
                    <Show when={isEditing()}>
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
                    <Show when={!isEditing() && avatarPreview()}>
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
            <EditableInfoCardSection title="Basics" isEditing={isEditing()}>
              <EditableInfoCardRow
                label="Age"
                value={age()}
                isEditing={isEditing()}
                type="text"
                placeholder="Enter your age"
                onValueChange={(v) => setAge(v as string)}
              />
              <EditableInfoCardRow
                label="Gender"
                value={gender()}
                isEditing={isEditing()}
                type="select"
                options={GENDER_OPTIONS}
                onValueChange={(v) => setGender(v as string)}
              />
              <EditableInfoCardRow
                label="Nationality"
                value={nationality()}
                isEditing={isEditing()}
                type="select"
                options={NATIONALITY_OPTIONS}
                onValueChange={(v) => setNationality(v as string)}
              />
              <EditableInfoCardRow
                label="Native language"
                value={nativeLanguage()}
                isEditing={isEditing()}
                type="select"
                options={LANGUAGE_OPTIONS}
                onValueChange={(v) => setNativeLanguage(v as string)}
              />
              <EditableInfoCardRow
                label="Learning"
                value={learningLanguages()}
                isEditing={isEditing()}
                type="multiselectdropdown"
                options={LEARNING_LANGUAGE_OPTIONS}
                placeholder="Select languages you're learning"
                onValueChange={(v) => setLearningLanguages(Array.isArray(v) ? v.join(', ') : v as string)}
              />
            </EditableInfoCardSection>
          </EditableInfoCard>

          {/* Location */}
          <EditableInfoCard>
            <EditableInfoCardSection title="Location" isEditing={isEditing()}>
              <EditableInfoCardRow
                label="Location"
                value={location()}
                isEditing={isEditing()}
                type="location"
                placeholder="Search for a city"
                onLocationChange={(loc) => setLocation(loc.displayName)}
              />
              <EditableInfoCardRow
                label="Flexibility"
                value={flexibility()}
                isEditing={isEditing()}
                type="select"
                options={RELOCATE_OPTIONS}
                onValueChange={(v) => setFlexibility(v as string)}
              />
            </EditableInfoCardSection>
          </EditableInfoCard>

          {/* Education & Career */}
          <EditableInfoCard>
            <EditableInfoCardSection title="Education & Career" isEditing={isEditing()}>
              <EditableInfoCardRow
                label="School"
                value={school()}
                isEditing={isEditing()}
                placeholder="Enter your school"
                onValueChange={(v) => setSchool(v as string)}
              />
              <EditableInfoCardRow
                label="Degree"
                value={degree()}
                isEditing={isEditing()}
                type="select"
                options={DEGREE_OPTIONS}
                onValueChange={(v) => setDegree(v as string)}
              />
              <EditableInfoCardRow
                label="Field of study"
                value={fieldOfStudy()}
                isEditing={isEditing()}
                type="select"
                options={FIELD_OPTIONS}
                onValueChange={(v) => setFieldOfStudy(v as string)}
              />
              <EditableInfoCardRow
                label="Profession"
                value={profession()}
                isEditing={isEditing()}
                type="select"
                options={PROFESSION_OPTIONS}
                onValueChange={(v) => setProfession(v as string)}
              />
              <EditableInfoCardRow
                label="Industry"
                value={industry()}
                isEditing={isEditing()}
                type="select"
                options={INDUSTRY_OPTIONS}
                onValueChange={(v) => setIndustry(v as string)}
              />
              <EditableInfoCardRow
                label="Skills"
                value={skills()}
                isEditing={isEditing()}
                placeholder="Enter your skills (comma separated)"
                onValueChange={(v) => setSkills(v as string)}
              />
            </EditableInfoCardSection>
          </EditableInfoCard>

          {/* Dating */}
          <EditableInfoCard>
            <EditableInfoCardSection title="Dating" isEditing={isEditing()}>
              <EditableInfoCardRow
                label="Relationship status"
                value={relationshipStatus()}
                isEditing={isEditing()}
                type="select"
                options={RELATIONSHIP_OPTIONS}
                onValueChange={(v) => setRelationshipStatus(v as string)}
              />
              <EditableInfoCardRow
                label="Height (cm)"
                value={height()}
                isEditing={isEditing()}
                placeholder="e.g. 170"
                onValueChange={(v) => setHeight(v as string)}
              />
              <EditableInfoCardRow
                label="Looking for"
                value={lookingFor()}
                isEditing={isEditing()}
                type="select"
                options={LOOKING_FOR_OPTIONS}
                onValueChange={(v) => setLookingFor(v as string)}
              />
              <EditableInfoCardRow
                label="Sexuality"
                value={sexuality()}
                isEditing={isEditing()}
                type="select"
                options={SEXUALITY_OPTIONS}
                onValueChange={(v) => setSexuality(v as string)}
              />
              <EditableInfoCardRow
                label="Ethnicity"
                value={ethnicity()}
                isEditing={isEditing()}
                type="select"
                options={ETHNICITY_OPTIONS}
                onValueChange={(v) => setEthnicity(v as string)}
              />
              <EditableInfoCardRow
                label="Dating style"
                value={datingStyle()}
                isEditing={isEditing()}
                type="select"
                options={DATING_STYLE_OPTIONS}
                onValueChange={(v) => setDatingStyle(v as string)}
              />
              <EditableInfoCardRow
                label="Children"
                value={children()}
                isEditing={isEditing()}
                type="select"
                options={CHILDREN_OPTIONS}
                onValueChange={(v) => setChildren(v as string)}
              />
              <EditableInfoCardRow
                label="Wants children"
                value={wantsChildren()}
                isEditing={isEditing()}
                type="select"
                options={WANTS_CHILDREN_OPTIONS}
                onValueChange={(v) => setWantsChildren(v as string)}
              />
            </EditableInfoCardSection>
          </EditableInfoCard>

          {/* Lifestyle */}
          <EditableInfoCard>
            <EditableInfoCardSection title="Lifestyle" isEditing={isEditing()}>
              <EditableInfoCardRow
                label="Hobbies"
                value={hobbies()}
                isEditing={isEditing()}
                type="textarea"
                placeholder="What do you like to do for fun?"
                maxLength={200}
                onValueChange={(v) => setHobbies(v as string)}
              />
              <EditableInfoCardRow
                label="Drinking"
                value={drinking()}
                isEditing={isEditing()}
                type="select"
                options={DRINKING_OPTIONS}
                onValueChange={(v) => setDrinking(v as string)}
              />
              <EditableInfoCardRow
                label="Smoking"
                value={smoking()}
                isEditing={isEditing()}
                type="select"
                options={SMOKING_OPTIONS}
                onValueChange={(v) => setSmoking(v as string)}
              />
              <EditableInfoCardRow
                label="Drugs"
                value={drugs()}
                isEditing={isEditing()}
                type="select"
                options={DRUGS_OPTIONS}
                onValueChange={(v) => setDrugs(v as string)}
              />
              <EditableInfoCardRow
                label="Religion"
                value={religion()}
                isEditing={isEditing()}
                type="select"
                options={RELIGION_OPTIONS}
                onValueChange={(v) => setReligion(v as string)}
              />
              <EditableInfoCardRow
                label="Pets"
                value={pets()}
                isEditing={isEditing()}
                type="select"
                options={PETS_OPTIONS}
                onValueChange={(v) => setPets(v as string)}
              />
              <EditableInfoCardRow
                label="Diet"
                value={diet()}
                isEditing={isEditing()}
                type="select"
                options={DIET_OPTIONS}
                onValueChange={(v) => setDiet(v as string)}
              />
            </EditableInfoCardSection>
          </EditableInfoCard>
        </div>
      </div>
    )
  },
}

/**
 * Shows empty profile with "+ Add" prompts
 * Demonstrates how to entice users to fill out their profile
 */
export const EmptyProfile: Story = {
  render: () => {
    const [isEditing, setIsEditing] = createSignal(true)
    const [isSaving, setIsSaving] = createSignal(false)

    const handleSave = () => {
      setIsSaving(true)
      setTimeout(() => {
        setIsSaving(false)
        setIsEditing(false)
        alert('Profile saved!')
      }, 1000)
    }

    return (
      <div class="max-w-[600px] mx-auto p-8">
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold text-[var(--text-primary)]">
            Complete Your Profile
          </h1>
          <Button
            onClick={handleSave}
            loading={isSaving()}
          >
            Save Changes
          </Button>
        </div>

        {/* Completion banner */}
        <div class="bg-[var(--bg-highlight)] rounded-lg p-4 mb-6 border-l-4 border-[var(--accent-coral)]">
          <p class="text-[var(--text-primary)] font-medium">
            Your profile is 10% complete
          </p>
          <p class="text-[var(--text-secondary)] text-sm mt-1">
            Add more info to help others connect with you
          </p>
        </div>

        {/* Profile sections with mostly empty fields */}
        <div class="flex flex-col gap-4">
          <EditableInfoCard>
            <EditableInfoCardSection title="Basics" isEditing={isEditing()}>
              <EditableInfoCardRow
                label="Age"
                value=""
                isEditing={isEditing()}
                placeholder="Enter your age"
              />
              <EditableInfoCardRow
                label="Gender"
                value=""
                isEditing={isEditing()}
                type="select"
                options={GENDER_OPTIONS}
              />
              <EditableInfoCardRow
                label="Nationality"
                value=""
                isEditing={isEditing()}
                placeholder="Enter your nationality"
              />
              <EditableInfoCardRow
                label="Native language"
                value="English"
                isEditing={isEditing()}
              />
              <EditableInfoCardRow
                label="Learning"
                value=""
                isEditing={isEditing()}
                type="multiselectdropdown"
                options={LEARNING_LANGUAGE_OPTIONS}
              />
            </EditableInfoCardSection>
          </EditableInfoCard>

          <EditableInfoCard>
            <EditableInfoCardSection title="Location" isEditing={isEditing()}>
              <EditableInfoCardRow
                label="Location"
                value=""
                isEditing={isEditing()}
                type="location"
              />
              <EditableInfoCardRow
                label="Flexibility"
                value=""
                isEditing={isEditing()}
              />
            </EditableInfoCardSection>
          </EditableInfoCard>

          <EditableInfoCard>
            <EditableInfoCardSection title="Education & Career" isEditing={isEditing()}>
              <EditableInfoCardRow label="School" value="" isEditing={isEditing()} />
              <EditableInfoCardRow label="Degree" value="" isEditing={isEditing()} />
              <EditableInfoCardRow label="Field of study" value="" isEditing={isEditing()} />
              <EditableInfoCardRow label="Profession" value="" isEditing={isEditing()} />
              <EditableInfoCardRow label="Industry" value="" isEditing={isEditing()} />
              <EditableInfoCardRow label="Skills" value="" isEditing={isEditing()} />
            </EditableInfoCardSection>
          </EditableInfoCard>
        </div>
      </div>
    )
  },
}
