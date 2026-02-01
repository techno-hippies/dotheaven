import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { EditableInfoCard, EditableInfoCardSection, EditableInfoCardRow } from './editable-info-card'
import { ProfileInfoSection, type ProfileInput } from './profile-info-section'
import { Button } from '../primitives'
import {
  GENDER_OPTIONS,
  NATIONALITY_OPTIONS,
  LANGUAGE_OPTIONS,
  LEARNING_LANGUAGE_OPTIONS,
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
 * Uses the shared ProfileInfoSection component (same as real profile page)
 */
export const ProfileEditor: Story = {
  render: () => {
    const [isEditing, setIsEditing] = createSignal(false)
    const [isSaving, setIsSaving] = createSignal(false)
    const [heavenName, setHeavenName] = createSignal<string | null>('alice')
    const [claiming, setClaiming] = createSignal(false)
    const [claimError, setClaimError] = createSignal<string | null>(null)

    const profileData: ProfileInput = {
      displayName: 'Alice Wonderland',
      bio: 'Designer & developer. Building things on the internet. Cat person.',
      url: 'https://alice.dev',
      twitter: 'alice.heaven',
      github: 'alicewonderland',
      telegram: 'alicewonderland',
      avatar: 'https://picsum.photos/seed/alice/200/200',
      coverPhoto: 'https://picsum.photos/seed/cover/1200/300',
      age: 28,
      gender: 'Woman',
      nationality: 'French',
      nativeLanguage: 'English',
      targetLanguage: 'es, ja',
      locationCityId: 'San Francisco',
      relocate: 'Maybe',
      school: 'Stanford University',
      degree: 'Bachelor',
      fieldBucket: 'Computer Science',
      profession: 'Software Engineer',
      industry: 'Technology',
      relationshipStatus: 'Single',
      heightCm: 170,
      sexuality: 'Bisexual',
      ethnicity: 'White',
      datingStyle: 'Monogamous',
      lookingFor: 'Serious',
      children: 'None',
      wantsChildren: 'Open to it',
      hobbiesCommit: 'Photography, Hiking, Cooking',
      drinking: 'Socially',
      smoking: 'No',
      drugs: 'Never',
      religion: 'Agnostic',
      pets: 'Has pets',
      diet: 'Omnivore',
    }

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
      setClaiming(false)
      return true
    }

    const handleSave = async (data: ProfileInput) => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      console.log('[Profile] Saved:', data)
    }

    return (
      <div class="max-w-[600px] mx-auto p-8">
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold text-[var(--text-primary)]">
            Profile Information
          </h1>
          {!isEditing() ? (
            <Button variant="secondary" onClick={() => setIsEditing(true)}>
              Edit Profile
            </Button>
          ) : (
            <Button onClick={() => setIsSaving(true)} loading={isSaving()}>
              Save Changes
            </Button>
          )}
        </div>

        {isEditing() && (
          <div class="bg-[var(--bg-highlight)] rounded-md p-4 mb-6 border-l-4 border-[var(--accent-blue)]">
            <p class="text-[var(--text-primary)] font-medium">Editing your profile</p>
            <p class="text-[var(--text-secondary)] text-sm mt-1">Complete your profile to help others get to know you better</p>
          </div>
        )}

        <ProfileInfoSection
          profile={profileData}
          isOwnProfile={true}
          isEditing={isEditing()}
          isSaving={isSaving()}
          onSave={handleSave}
          setIsEditing={setIsEditing}
          setIsSaving={setIsSaving}
          heavenName={heavenName()}
          onClaimName={handleClaimName}
          onCheckNameAvailability={handleCheckNameAvailability}
          nameClaiming={claiming()}
          nameClaimError={claimError()}
        />
      </div>
    )
  },
}

/**
 * Shows empty profile with "+ Add" prompts
 */
export const EmptyProfile: Story = {
  render: () => {
    const [isEditing, setIsEditing] = createSignal(true)
    const [isSaving, setIsSaving] = createSignal(false)

    return (
      <div class="max-w-[600px] mx-auto p-8">
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold text-[var(--text-primary)]">
            Complete Your Profile
          </h1>
          <Button onClick={() => setIsSaving(true)} loading={isSaving()}>
            Save Changes
          </Button>
        </div>

        <div class="bg-[var(--bg-highlight)] rounded-md p-4 mb-6 border-l-4 border-[var(--accent-coral)]">
          <p class="text-[var(--text-primary)] font-medium">Your profile is 10% complete</p>
          <p class="text-[var(--text-secondary)] text-sm mt-1">Add more info to help others connect with you</p>
        </div>

        <div class="flex flex-col gap-4">
          <EditableInfoCard>
            <EditableInfoCardSection title="Basics" isEditing={isEditing()}>
              <EditableInfoCardRow label="Age" value="" isEditing={isEditing()} placeholder="Enter your age" />
              <EditableInfoCardRow label="Gender" value="" isEditing={isEditing()} type="select" options={GENDER_OPTIONS} />
              <EditableInfoCardRow label="Nationality" value="" isEditing={isEditing()} type="select" options={NATIONALITY_OPTIONS} />
              <EditableInfoCardRow label="Native language" value="English" isEditing={isEditing()} type="select" options={LANGUAGE_OPTIONS} />
              <EditableInfoCardRow label="Learning" value="" isEditing={isEditing()} type="multiselectdropdown" options={LEARNING_LANGUAGE_OPTIONS} />
            </EditableInfoCardSection>
          </EditableInfoCard>
        </div>
      </div>
    )
  },
}
