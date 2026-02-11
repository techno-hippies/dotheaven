import { Show, For, type Component } from 'solid-js'
import { ProfileSidebarCard, ProfileSidebarRow } from './profile-sidebar-card'
import { getLanguageName, proficiencyLabel } from '../../data/languages'
import { getTagLabel, stringToTagIds } from '../../data/tags'
import { MapPin } from '../../icons'
import { abbreviateLocation } from '../../primitives'
import type { SelectOption } from '../../primitives'
import type { ProfileInput } from './profile-info-section'
import type { LanguageEntry } from '../../data/languages'
import {
  GENDER_OPTIONS,
  DEGREE_OPTIONS,
  FIELD_OPTIONS,
  PROFESSION_OPTIONS,
  INDUSTRY_OPTIONS,
  RELATIONSHIP_OPTIONS,
  RELOCATE_OPTIONS,
  LOOKING_FOR_OPTIONS,
  SEXUALITY_OPTIONS,
  ETHNICITY_OPTIONS,
  DATING_STYLE_OPTIONS,
  CHILDREN_OPTIONS,
  WANTS_CHILDREN_OPTIONS,
  DRINKING_OPTIONS,
  SMOKING_OPTIONS,
  DRUGS_OPTIONS,
  RELIGION_OPTIONS,
  PETS_OPTIONS,
  DIET_OPTIONS,
} from '../../constants/profile-options'

/** Look up the display label for an enum value in an option array */
function optionLabel(options: SelectOption[], value: string | undefined): string | undefined {
  if (!value) return undefined
  return options.find(o => o.value === value)?.label
}

export interface ProfileAboutSidebarProps {
  profile: ProfileInput
  /** Location string (city label) */
  location?: string
  /** Follower count */
  followerCount?: number
  /** Following count */
  followingCount?: number
  onFollowerCountClick?: () => void
  onFollowingCountClick?: () => void
  /** Age */
  age?: number
  /** Gender */
  gender?: string
}

const GENDER_ABBREV: Record<string, string> = {
  woman: 'F', man: 'M', 'non-binary': 'NB',
  'trans-woman': 'TW', 'trans-man': 'TM', intersex: 'IX', other: 'O',
}

export const ProfileAboutSidebar: Component<ProfileAboutSidebarProps> = (props) => {
  const languages = () => props.profile.languages ?? []
  const hasLanguages = () => languages().length > 0
  const hasAbout = () => hasLanguages() || !!props.location || props.followerCount !== undefined || props.followingCount !== undefined || props.age || props.gender

  const ageGenderDisplay = () => {
    const parts = []
    if (props.age && props.age > 0) parts.push(String(props.age))
    const genderAbbrev = GENDER_ABBREV[props.gender ?? ''] ?? props.gender
    if (genderAbbrev) parts.push(genderAbbrev)
    return parts.join('')
  }

  const school = () => props.profile.school
  const degree = () => optionLabel(DEGREE_OPTIONS, props.profile.degree)
  const field = () => optionLabel(FIELD_OPTIONS, props.profile.fieldBucket)
  const profession = () => optionLabel(PROFESSION_OPTIONS, props.profile.profession)
  const industry = () => optionLabel(INDUSTRY_OPTIONS, props.profile.industry)
  const hasEducation = () => !!(school() || degree() || field() || profession() || industry())

  const relationship = () => optionLabel(RELATIONSHIP_OPTIONS, props.profile.relationshipStatus)
  const height = () => props.profile.heightCm ? `${props.profile.heightCm} cm` : undefined
  const flexibility = () => optionLabel(RELOCATE_OPTIONS, props.profile.relocate)
  const lookingFor = () => optionLabel(LOOKING_FOR_OPTIONS, props.profile.lookingFor)
  const sexuality = () => optionLabel(SEXUALITY_OPTIONS, props.profile.sexuality)
  const ethnicity = () => optionLabel(ETHNICITY_OPTIONS, props.profile.ethnicity)
  const datingStyle = () => optionLabel(DATING_STYLE_OPTIONS, props.profile.datingStyle)
  const children = () => optionLabel(CHILDREN_OPTIONS, props.profile.children)
  const wantsChildren = () => optionLabel(WANTS_CHILDREN_OPTIONS, props.profile.wantsChildren)
  const hasDating = () => !!(relationship() || height() || flexibility() || lookingFor() || sexuality() || ethnicity() || datingStyle() || children() || wantsChildren())

  const hobbyIds = () => stringToTagIds(props.profile.hobbiesCommit)
  const skillIds = () => stringToTagIds(props.profile.skillsCommit)
  const hobbyLabels = () => hobbyIds().map(id => getTagLabel(id))
  const skillLabels = () => skillIds().map(id => getTagLabel(id))
  const drinking = () => optionLabel(DRINKING_OPTIONS, props.profile.drinking)
  const smoking = () => optionLabel(SMOKING_OPTIONS, props.profile.smoking)
  const drugs = () => optionLabel(DRUGS_OPTIONS, props.profile.drugs)
  const religion = () => optionLabel(RELIGION_OPTIONS, props.profile.religion)
  const pets = () => optionLabel(PETS_OPTIONS, props.profile.pets)
  const diet = () => optionLabel(DIET_OPTIONS, props.profile.diet)
  const hasLifestyle = () => !!(hobbyIds().length || skillIds().length || drinking() || smoking() || drugs() || religion() || pets() || diet())

  return (
    <div class="flex flex-col gap-3">
      {/* About — age/gender, location, followers/following, languages */}
      <Show when={hasAbout()}>
        <ProfileSidebarCard title="About">
          <Show when={ageGenderDisplay()}>
            <ProfileSidebarRow label="Age / Gender" value={ageGenderDisplay()} />
          </Show>
          <Show when={props.location}>
            <ProfileSidebarRow label="Location">
              <span class="flex items-center gap-1.5 text-base text-[var(--text-secondary)]">
                <MapPin class="w-[16px] h-[16px] flex-shrink-0" />
                {abbreviateLocation(props.location!)}
              </span>
            </ProfileSidebarRow>
          </Show>
          <Show when={props.followerCount !== undefined}>
            <ProfileSidebarRow label="Followers">
              <button
                type="button"
                class="hover:underline text-base text-[var(--text-secondary)] font-semibold"
                onClick={() => props.onFollowerCountClick?.()}
              >
                {props.followerCount ?? 0}
              </button>
            </ProfileSidebarRow>
          </Show>
          <Show when={props.followingCount !== undefined}>
            <ProfileSidebarRow label="Following">
              <button
                type="button"
                class="hover:underline text-base text-[var(--text-secondary)] font-semibold"
                onClick={() => props.onFollowingCountClick?.()}
              >
                {props.followingCount ?? 0}
              </button>
            </ProfileSidebarRow>
          </Show>
          <Show when={hasLanguages()}>
            <ProfileSidebarRow label="Languages">
              <span class="text-base text-[var(--text-secondary)]">
                {languages().map((lang: LanguageEntry) => {
                  const name = getLanguageName(lang.code)
                  const prof = proficiencyLabel(lang.proficiency)
                  // Native (proficiency 7) vs Learning (proficiency 1-6)
                  if (lang.proficiency === 7) {
                    return `Native ${name}`
                  } else {
                    return `Learning ${name} (${prof})`
                  }
                }).join(', ')}
              </span>
            </ProfileSidebarRow>
          </Show>
        </ProfileSidebarCard>
      </Show>

      {/* Education & Career */}
      <Show when={hasEducation()}>
        <ProfileSidebarCard title="Education & Career">
          <ProfileSidebarRow label="School" value={school()} />
          <ProfileSidebarRow label="Degree" value={degree()} />
          <ProfileSidebarRow label="Field" value={field()} />
          <ProfileSidebarRow label="Profession" value={profession()} />
          <ProfileSidebarRow label="Industry" value={industry()} />
        </ProfileSidebarCard>
      </Show>

      {/* Dating */}
      <Show when={hasDating()}>
        <ProfileSidebarCard title="Dating">
          <ProfileSidebarRow label="Relationship" value={relationship()} />
          <ProfileSidebarRow label="Height" value={height()} />
          <ProfileSidebarRow label="Flexibility" value={flexibility()} />
          <ProfileSidebarRow label="Looking for" value={lookingFor()} />
          <ProfileSidebarRow label="Sexuality" value={sexuality()} />
          <ProfileSidebarRow label="Ethnicity" value={ethnicity()} />
          <ProfileSidebarRow label="Dating style" value={datingStyle()} />
          <ProfileSidebarRow label="Children" value={children()} />
          <ProfileSidebarRow label="Wants children" value={wantsChildren()} />
        </ProfileSidebarCard>
      </Show>

      {/* Lifestyle */}
      <Show when={hasLifestyle()}>
        <ProfileSidebarCard title="Lifestyle">
          <Show when={hobbyLabels().length > 0}>
            <ProfileSidebarRow label="Hobbies">
              <span class="text-base text-[var(--text-secondary)]">{hobbyLabels().join(', ')}</span>
            </ProfileSidebarRow>
          </Show>
          <Show when={skillLabels().length > 0}>
            <ProfileSidebarRow label="Skills">
              <span class="text-base text-[var(--text-secondary)]">{skillLabels().join(', ')}</span>
            </ProfileSidebarRow>
          </Show>
          <ProfileSidebarRow label="Drinking" value={drinking()} />
          <ProfileSidebarRow label="Smoking" value={smoking()} />
          <ProfileSidebarRow label="Drugs" value={drugs()} />
          <ProfileSidebarRow label="Religion" value={religion()} />
          <ProfileSidebarRow label="Pets" value={pets()} />
          <ProfileSidebarRow label="Diet" value={diet()} />
        </ProfileSidebarCard>
      </Show>
    </div>
  )
}
