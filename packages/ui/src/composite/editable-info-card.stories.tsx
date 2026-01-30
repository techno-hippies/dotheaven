import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal, Show } from 'solid-js'
import { EditableInfoCard, EditableInfoCardSection, EditableInfoCardRow } from './editable-info-card'
import { OnboardingNameStep } from './onboarding-name-step'
import { Button } from '../primitives'
import type { SelectOption } from '../primitives'
import { cn } from '../lib/utils'

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

// Mock data for selects - MUST match ProfileV1.sol enums
const genderOptions: SelectOption[] = [
  { value: '1', label: 'Woman' },
  { value: '2', label: 'Man' },
  { value: '3', label: 'Non-binary' },
  { value: '4', label: 'Trans woman' },
  { value: '5', label: 'Trans man' },
  { value: '6', label: 'Intersex' },
  { value: '7', label: 'Other' },
]

const relationshipOptions: SelectOption[] = [
  { value: '1', label: 'Single' },
  { value: '2', label: 'In a relationship' },
  { value: '3', label: 'Married' },
  { value: '4', label: 'Divorced' },
  { value: '5', label: 'Separated' },
  { value: '6', label: 'Widowed' },
  { value: '7', label: "It's complicated" },
]

const sexualityOptions: SelectOption[] = [
  { value: '1', label: 'Straight' },
  { value: '2', label: 'Gay' },
  { value: '3', label: 'Lesbian' },
  { value: '4', label: 'Bisexual' },
  { value: '5', label: 'Pansexual' },
  { value: '6', label: 'Asexual' },
  { value: '7', label: 'Queer' },
  { value: '8', label: 'Questioning' },
  { value: '9', label: 'Other' },
]

const ethnicityOptions: SelectOption[] = [
  { value: '1', label: 'White' },
  { value: '2', label: 'Black' },
  { value: '3', label: 'East Asian' },
  { value: '4', label: 'South Asian' },
  { value: '5', label: 'Southeast Asian' },
  { value: '6', label: 'Middle Eastern / North African' },
  { value: '7', label: 'Hispanic / Latino/a' },
  { value: '8', label: 'Native American / Indigenous' },
  { value: '9', label: 'Pacific Islander' },
  { value: '10', label: 'Mixed' },
  { value: '11', label: 'Other' },
]

const datingStyleOptions: SelectOption[] = [
  { value: '1', label: 'Monogamous' },
  { value: '2', label: 'Non-monogamous' },
  { value: '3', label: 'Open relationship' },
  { value: '4', label: 'Polyamorous' },
  { value: '5', label: 'Other' },
]

const childrenOptions: SelectOption[] = [
  { value: '1', label: 'None' },
  { value: '2', label: 'Has children' },
]

const wantsChildrenOptions: SelectOption[] = [
  { value: '1', label: 'No' },
  { value: '2', label: 'Yes' },
  { value: '3', label: 'Open to it' },
  { value: '4', label: 'Unsure' },
]

const drinkingOptions: SelectOption[] = [
  { value: '1', label: 'Never' },
  { value: '2', label: 'Rarely' },
  { value: '3', label: 'Socially' },
  { value: '4', label: 'Often' },
]

const smokingOptions: SelectOption[] = [
  { value: '1', label: 'No' },
  { value: '2', label: 'Socially' },
  { value: '3', label: 'Yes' },
  { value: '4', label: 'Vape' },
]

const drugsOptions: SelectOption[] = [
  { value: '1', label: 'Never' },
  { value: '2', label: 'Sometimes' },
  { value: '3', label: 'Often' },
]

const relocateOptions: SelectOption[] = [
  { value: '1', label: 'No' },
  { value: '2', label: 'Maybe' },
  { value: '3', label: 'Yes' },
]

const degreeOptions: SelectOption[] = [
  { value: '1', label: 'No degree' },
  { value: '2', label: 'High school' },
  { value: '3', label: 'Associate' },
  { value: '4', label: 'Bachelor' },
  { value: '5', label: 'Master' },
  { value: '6', label: 'Doctorate' },
  { value: '7', label: 'Professional' },
  { value: '8', label: 'Bootcamp' },
  { value: '9', label: 'Other' },
]

const fieldBucketOptions: SelectOption[] = [
  { value: '1', label: 'Computer Science' },
  { value: '2', label: 'Engineering' },
  { value: '3', label: 'Math / Statistics' },
  { value: '4', label: 'Physical Sciences' },
  { value: '5', label: 'Biology' },
  { value: '6', label: 'Medicine / Health' },
  { value: '7', label: 'Business' },
  { value: '8', label: 'Economics' },
  { value: '9', label: 'Law' },
  { value: '10', label: 'Social Sciences' },
  { value: '11', label: 'Psychology' },
  { value: '12', label: 'Arts / Design' },
  { value: '13', label: 'Humanities' },
  { value: '14', label: 'Education' },
  { value: '15', label: 'Communications' },
  { value: '16', label: 'Other' },
]

const professionOptions: SelectOption[] = [
  { value: '1', label: 'Software Engineer' },
  { value: '2', label: 'Product' },
  { value: '3', label: 'Design' },
  { value: '4', label: 'Data' },
  { value: '5', label: 'Sales' },
  { value: '6', label: 'Marketing' },
  { value: '7', label: 'Operations' },
  { value: '8', label: 'Founder' },
  { value: '9', label: 'Student' },
  { value: '10', label: 'Other' },
]

const industryOptions: SelectOption[] = [
  { value: '1', label: 'Technology' },
  { value: '2', label: 'Finance' },
  { value: '3', label: 'Healthcare' },
  { value: '4', label: 'Education' },
  { value: '5', label: 'Manufacturing' },
  { value: '6', label: 'Retail' },
  { value: '7', label: 'Media' },
  { value: '8', label: 'Government' },
  { value: '9', label: 'Nonprofit' },
  { value: '10', label: 'Other' },
]

const lookingForOptions: SelectOption[] = [
  { value: '1', label: 'Friendship' },
  { value: '2', label: 'Casual' },
  { value: '3', label: 'Serious' },
  { value: '4', label: 'Long-term' },
  { value: '5', label: 'Marriage' },
  { value: '6', label: 'Not sure' },
  { value: '7', label: 'Other' },
]

const religionOptions: SelectOption[] = [
  { value: '1', label: 'Agnostic' },
  { value: '2', label: 'Atheist' },
  { value: '3', label: 'Buddhist' },
  { value: '4', label: 'Christian' },
  { value: '5', label: 'Hindu' },
  { value: '6', label: 'Jewish' },
  { value: '7', label: 'Muslim' },
  { value: '8', label: 'Sikh' },
  { value: '9', label: 'Spiritual' },
  { value: '10', label: 'Other' },
]

const petsOptions: SelectOption[] = [
  { value: '1', label: 'No pets' },
  { value: '2', label: 'Has pets' },
  { value: '3', label: 'Wants pets' },
  { value: '4', label: 'Allergic' },
]

const dietOptions: SelectOption[] = [
  { value: '1', label: 'Omnivore' },
  { value: '2', label: 'Vegetarian' },
  { value: '3', label: 'Vegan' },
  { value: '4', label: 'Pescatarian' },
  { value: '5', label: 'Halal' },
  { value: '6', label: 'Kosher' },
  { value: '7', label: 'Other' },
]

// Comprehensive nationality list (ISO 3166-1 alpha-2 codes)
const nationalityOptions: SelectOption[] = [
  { value: 'AF', label: 'Afghan' },
  { value: 'AL', label: 'Albanian' },
  { value: 'DZ', label: 'Algerian' },
  { value: 'AR', label: 'Argentinian' },
  { value: 'AM', label: 'Armenian' },
  { value: 'AU', label: 'Australian' },
  { value: 'AT', label: 'Austrian' },
  { value: 'AZ', label: 'Azerbaijani' },
  { value: 'BH', label: 'Bahraini' },
  { value: 'BD', label: 'Bangladeshi' },
  { value: 'BY', label: 'Belarusian' },
  { value: 'BE', label: 'Belgian' },
  { value: 'BO', label: 'Bolivian' },
  { value: 'BA', label: 'Bosnian' },
  { value: 'BR', label: 'Brazilian' },
  { value: 'BG', label: 'Bulgarian' },
  { value: 'KH', label: 'Cambodian' },
  { value: 'CM', label: 'Cameroonian' },
  { value: 'CA', label: 'Canadian' },
  { value: 'CL', label: 'Chilean' },
  { value: 'CN', label: 'Chinese' },
  { value: 'CO', label: 'Colombian' },
  { value: 'CR', label: 'Costa Rican' },
  { value: 'HR', label: 'Croatian' },
  { value: 'CU', label: 'Cuban' },
  { value: 'CY', label: 'Cypriot' },
  { value: 'CZ', label: 'Czech' },
  { value: 'DK', label: 'Danish' },
  { value: 'DO', label: 'Dominican' },
  { value: 'EC', label: 'Ecuadorian' },
  { value: 'EG', label: 'Egyptian' },
  { value: 'SV', label: 'Salvadoran' },
  { value: 'EE', label: 'Estonian' },
  { value: 'ET', label: 'Ethiopian' },
  { value: 'FI', label: 'Finnish' },
  { value: 'FR', label: 'French' },
  { value: 'GE', label: 'Georgian' },
  { value: 'DE', label: 'German' },
  { value: 'GH', label: 'Ghanaian' },
  { value: 'GR', label: 'Greek' },
  { value: 'GT', label: 'Guatemalan' },
  { value: 'HT', label: 'Haitian' },
  { value: 'HN', label: 'Honduran' },
  { value: 'HK', label: 'Hong Konger' },
  { value: 'HU', label: 'Hungarian' },
  { value: 'IS', label: 'Icelandic' },
  { value: 'IN', label: 'Indian' },
  { value: 'ID', label: 'Indonesian' },
  { value: 'IR', label: 'Iranian' },
  { value: 'IQ', label: 'Iraqi' },
  { value: 'IE', label: 'Irish' },
  { value: 'IL', label: 'Israeli' },
  { value: 'IT', label: 'Italian' },
  { value: 'JM', label: 'Jamaican' },
  { value: 'JP', label: 'Japanese' },
  { value: 'JO', label: 'Jordanian' },
  { value: 'KZ', label: 'Kazakhstani' },
  { value: 'KE', label: 'Kenyan' },
  { value: 'KW', label: 'Kuwaiti' },
  { value: 'KG', label: 'Kyrgyzstani' },
  { value: 'LV', label: 'Latvian' },
  { value: 'LB', label: 'Lebanese' },
  { value: 'LY', label: 'Libyan' },
  { value: 'LT', label: 'Lithuanian' },
  { value: 'LU', label: 'Luxembourger' },
  { value: 'MY', label: 'Malaysian' },
  { value: 'MX', label: 'Mexican' },
  { value: 'MD', label: 'Moldovan' },
  { value: 'MN', label: 'Mongolian' },
  { value: 'ME', label: 'Montenegrin' },
  { value: 'MA', label: 'Moroccan' },
  { value: 'NP', label: 'Nepalese' },
  { value: 'NL', label: 'Dutch' },
  { value: 'NZ', label: 'New Zealander' },
  { value: 'NI', label: 'Nicaraguan' },
  { value: 'NG', label: 'Nigerian' },
  { value: 'NO', label: 'Norwegian' },
  { value: 'OM', label: 'Omani' },
  { value: 'PK', label: 'Pakistani' },
  { value: 'PA', label: 'Panamanian' },
  { value: 'PY', label: 'Paraguayan' },
  { value: 'PE', label: 'Peruvian' },
  { value: 'PH', label: 'Filipino' },
  { value: 'PL', label: 'Polish' },
  { value: 'PT', label: 'Portuguese' },
  { value: 'PR', label: 'Puerto Rican' },
  { value: 'QA', label: 'Qatari' },
  { value: 'RO', label: 'Romanian' },
  { value: 'RU', label: 'Russian' },
  { value: 'SA', label: 'Saudi Arabian' },
  { value: 'RS', label: 'Serbian' },
  { value: 'SG', label: 'Singaporean' },
  { value: 'SK', label: 'Slovak' },
  { value: 'SI', label: 'Slovenian' },
  { value: 'ZA', label: 'South African' },
  { value: 'KR', label: 'South Korean' },
  { value: 'ES', label: 'Spanish' },
  { value: 'LK', label: 'Sri Lankan' },
  { value: 'SE', label: 'Swedish' },
  { value: 'CH', label: 'Swiss' },
  { value: 'SY', label: 'Syrian' },
  { value: 'TW', label: 'Taiwanese' },
  { value: 'TJ', label: 'Tajikistani' },
  { value: 'TZ', label: 'Tanzanian' },
  { value: 'TH', label: 'Thai' },
  { value: 'TN', label: 'Tunisian' },
  { value: 'TR', label: 'Turkish' },
  { value: 'TM', label: 'Turkmen' },
  { value: 'UG', label: 'Ugandan' },
  { value: 'UA', label: 'Ukrainian' },
  { value: 'AE', label: 'Emirati' },
  { value: 'GB', label: 'British' },
  { value: 'US', label: 'American' },
  { value: 'UY', label: 'Uruguayan' },
  { value: 'UZ', label: 'Uzbekistani' },
  { value: 'VE', label: 'Venezuelan' },
  { value: 'VN', label: 'Vietnamese' },
  { value: 'YE', label: 'Yemeni' },
  { value: 'ZM', label: 'Zambian' },
  { value: 'ZW', label: 'Zimbabwean' },
]

// ISO 639-1 language codes
const languageOptions: SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Mandarin Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'jv', label: 'Javanese' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'sv', label: 'Swedish' },
]

// Comprehensive language list for multi-select dropdown
const learningLanguageOptions: SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Mandarin Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'jv', label: 'Javanese' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'sv', label: 'Swedish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'cs', label: 'Czech' },
  { value: 'el', label: 'Greek' },
  { value: 'he', label: 'Hebrew' },
  { value: 'th', label: 'Thai' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ms', label: 'Malay' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ro', label: 'Romanian' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'fa', label: 'Persian (Farsi)' },
  { value: 'ur', label: 'Urdu' },
  { value: 'sw', label: 'Swahili' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ca', label: 'Catalan' },
]

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
                options={genderOptions}
                onValueChange={(v) => setGender(v as string)}
              />
              <EditableInfoCardRow
                label="Nationality"
                value={nationality()}
                isEditing={isEditing()}
                type="select"
                options={nationalityOptions}
                onValueChange={(v) => setNationality(v as string)}
              />
              <EditableInfoCardRow
                label="Native language"
                value={nativeLanguage()}
                isEditing={isEditing()}
                type="select"
                options={languageOptions}
                onValueChange={(v) => setNativeLanguage(v as string)}
              />
              <EditableInfoCardRow
                label="Learning"
                value={learningLanguages()}
                isEditing={isEditing()}
                type="multiselectdropdown"
                options={learningLanguageOptions}
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
                options={relocateOptions}
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
                options={degreeOptions}
                onValueChange={(v) => setDegree(v as string)}
              />
              <EditableInfoCardRow
                label="Field of study"
                value={fieldOfStudy()}
                isEditing={isEditing()}
                type="select"
                options={fieldBucketOptions}
                onValueChange={(v) => setFieldOfStudy(v as string)}
              />
              <EditableInfoCardRow
                label="Profession"
                value={profession()}
                isEditing={isEditing()}
                type="select"
                options={professionOptions}
                onValueChange={(v) => setProfession(v as string)}
              />
              <EditableInfoCardRow
                label="Industry"
                value={industry()}
                isEditing={isEditing()}
                type="select"
                options={industryOptions}
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
                options={relationshipOptions}
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
                options={lookingForOptions}
                onValueChange={(v) => setLookingFor(v as string)}
              />
              <EditableInfoCardRow
                label="Sexuality"
                value={sexuality()}
                isEditing={isEditing()}
                type="select"
                options={sexualityOptions}
                onValueChange={(v) => setSexuality(v as string)}
              />
              <EditableInfoCardRow
                label="Ethnicity"
                value={ethnicity()}
                isEditing={isEditing()}
                type="select"
                options={ethnicityOptions}
                onValueChange={(v) => setEthnicity(v as string)}
              />
              <EditableInfoCardRow
                label="Dating style"
                value={datingStyle()}
                isEditing={isEditing()}
                type="select"
                options={datingStyleOptions}
                onValueChange={(v) => setDatingStyle(v as string)}
              />
              <EditableInfoCardRow
                label="Children"
                value={children()}
                isEditing={isEditing()}
                type="select"
                options={childrenOptions}
                onValueChange={(v) => setChildren(v as string)}
              />
              <EditableInfoCardRow
                label="Wants children"
                value={wantsChildren()}
                isEditing={isEditing()}
                type="select"
                options={wantsChildrenOptions}
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
                options={drinkingOptions}
                onValueChange={(v) => setDrinking(v as string)}
              />
              <EditableInfoCardRow
                label="Smoking"
                value={smoking()}
                isEditing={isEditing()}
                type="select"
                options={smokingOptions}
                onValueChange={(v) => setSmoking(v as string)}
              />
              <EditableInfoCardRow
                label="Drugs"
                value={drugs()}
                isEditing={isEditing()}
                type="select"
                options={drugsOptions}
                onValueChange={(v) => setDrugs(v as string)}
              />
              <EditableInfoCardRow
                label="Religion"
                value={religion()}
                isEditing={isEditing()}
                type="select"
                options={religionOptions}
                onValueChange={(v) => setReligion(v as string)}
              />
              <EditableInfoCardRow
                label="Pets"
                value={pets()}
                isEditing={isEditing()}
                type="select"
                options={petsOptions}
                onValueChange={(v) => setPets(v as string)}
              />
              <EditableInfoCardRow
                label="Diet"
                value={diet()}
                isEditing={isEditing()}
                type="select"
                options={dietOptions}
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
                options={genderOptions}
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
                options={learningLanguageOptions}
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
