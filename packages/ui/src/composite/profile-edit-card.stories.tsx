import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { ProfileEditCard } from './profile-edit-card'
import { ProfileEditField } from './profile-edit-field'

const meta = {
  title: 'Composite/ProfileEditCard',
  component: ProfileEditCard,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#1a1625' }],
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ProfileEditCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Basics section with various field types
 */
export const BasicsSection: Story = {
  render: () => {
    const [age, setAge] = createSignal(28)
    const [gender, setGender] = createSignal('woman')
    const [nationality, setNationality] = createSignal('French')
    const [nativeLanguage, setNativeLanguage] = createSignal('English')
    const [learning, setLearning] = createSignal(['Spanish', 'Japanese'])

    return (
      <div class="w-[498px]">
        <ProfileEditCard title="Basics">
          <ProfileEditField
            label="Age"
            type="number"
            value={age()}
            onChange={(val) => setAge(val as number)}
            placeholder="Enter age"
          />
          <ProfileEditField
            label="Gender"
            type="select"
            value={gender()}
            onChange={(val) => setGender(val as string)}
            options={[
              { value: 'woman', label: 'Woman' },
              { value: 'man', label: 'Man' },
              { value: 'non-binary', label: 'Non-binary' },
              { value: 'other', label: 'Other' },
              { value: 'prefer-not-to-say', label: 'Prefer not to say' },
            ]}
          />
          <ProfileEditField
            label="Nationality"
            type="text"
            value={nationality()}
            onChange={(val) => setNationality(val as string)}
            placeholder="Enter nationality"
          />
          <ProfileEditField
            label="Native language"
            type="text"
            value={nativeLanguage()}
            onChange={(val) => setNativeLanguage(val as string)}
            placeholder="Enter native language"
          />
          <ProfileEditField
            label="Learning"
            type="tags"
            value={learning()}
            onChange={(val) => setLearning(val as string[])}
            placeholder="Add language"
          />
        </ProfileEditCard>
      </div>
    )
  },
}

/**
 * Location section
 */
export const LocationSection: Story = {
  render: () => {
    const [location, setLocation] = createSignal('San Francisco')
    const [flexibility, setFlexibility] = createSignal('open-to-relocating')

    return (
      <div class="w-[498px]">
        <ProfileEditCard title="Location">
          <ProfileEditField
            label="Location"
            type="text"
            value={location()}
            onChange={(val) => setLocation(val as string)}
            placeholder="Enter city"
          />
          <ProfileEditField
            label="Flexibility"
            type="select"
            value={flexibility()}
            onChange={(val) => setFlexibility(val as string)}
            options={[
              { value: 'open-to-relocating', label: 'Open to relocating' },
              { value: 'not-open', label: 'Not open to relocating' },
              { value: 'depends', label: 'It depends' },
            ]}
          />
        </ProfileEditCard>
      </div>
    )
  },
}

/**
 * Education & Career section
 */
export const EducationSection: Story = {
  render: () => {
    const [school, setSchool] = createSignal('Stanford University')
    const [degree, setDegree] = createSignal('bachelor')
    const [field, setField] = createSignal('Computer Science')
    const [profession, setProfession] = createSignal('Software Engineer')
    const [industry, setIndustry] = createSignal('Technology')
    const [skills, setSkills] = createSignal(['React', 'TypeScript', 'Design'])

    return (
      <div class="w-[498px]">
        <ProfileEditCard title="Education & Career">
          <ProfileEditField
            label="School"
            type="text"
            value={school()}
            onChange={(val) => setSchool(val as string)}
            placeholder="Enter school name"
          />
          <ProfileEditField
            label="Degree"
            type="select"
            value={degree()}
            onChange={(val) => setDegree(val as string)}
            options={[
              { value: 'high-school', label: 'High School' },
              { value: 'associate', label: 'Associate Degree' },
              { value: 'bachelor', label: 'Bachelor of Science' },
              { value: 'master', label: 'Master of Science' },
              { value: 'phd', label: 'PhD' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <ProfileEditField
            label="Field of study"
            type="text"
            value={field()}
            onChange={(val) => setField(val as string)}
            placeholder="Enter field"
          />
          <ProfileEditField
            label="Profession"
            type="text"
            value={profession()}
            onChange={(val) => setProfession(val as string)}
            placeholder="Enter profession"
          />
          <ProfileEditField
            label="Industry"
            type="text"
            value={industry()}
            onChange={(val) => setIndustry(val as string)}
            placeholder="Enter industry"
          />
          <ProfileEditField
            label="Skills"
            type="tags"
            value={skills()}
            onChange={(val) => setSkills(val as string[])}
            placeholder="Add skill"
          />
        </ProfileEditCard>
      </div>
    )
  },
}

/**
 * Dating preferences section with multi-select
 */
export const DatingSection: Story = {
  render: () => {
    const [status, setStatus] = createSignal('single')
    const [height, setHeight] = createSignal(`5'7" (170 cm)`)
    const [sexuality, setSexuality] = createSignal('bisexual')
    const [ethnicity, setEthnicity] = createSignal('white-caucasian')
    const [datingStyle, setDatingStyle] = createSignal('monogamous')
    const [friendsOpenTo, setFriendsOpenTo] = createSignal(['men', 'women'])
    const [children, setChildren] = createSignal('none')
    const [wantsChildren, setWantsChildren] = createSignal('open-to-it')

    return (
      <div class="w-[498px]">
        <ProfileEditCard title="Dating">
          <ProfileEditField
            label="Relationship status"
            type="select"
            value={status()}
            onChange={(val) => setStatus(val as string)}
            options={[
              { value: 'single', label: 'Single' },
              { value: 'in-relationship', label: 'In a relationship' },
              { value: 'married', label: 'Married' },
              { value: 'its-complicated', label: "It's complicated" },
            ]}
          />
          <ProfileEditField
            label="Height"
            type="text"
            value={height()}
            onChange={(val) => setHeight(val as string)}
            placeholder="e.g. 5'7 (170 cm)"
          />
          <ProfileEditField
            label="Sexuality"
            type="select"
            value={sexuality()}
            onChange={(val) => setSexuality(val as string)}
            options={[
              { value: 'straight', label: 'Straight' },
              { value: 'gay', label: 'Gay' },
              { value: 'lesbian', label: 'Lesbian' },
              { value: 'bisexual', label: 'Bisexual' },
              { value: 'pansexual', label: 'Pansexual' },
              { value: 'asexual', label: 'Asexual' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <ProfileEditField
            label="Ethnicity"
            type="select"
            value={ethnicity()}
            onChange={(val) => setEthnicity(val as string)}
            options={[
              { value: 'white-caucasian', label: 'White / Caucasian' },
              { value: 'black-african', label: 'Black / African' },
              { value: 'hispanic-latino', label: 'Hispanic / Latino' },
              { value: 'asian', label: 'Asian' },
              { value: 'middle-eastern', label: 'Middle Eastern' },
              { value: 'pacific-islander', label: 'Pacific Islander' },
              { value: 'mixed', label: 'Mixed' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <ProfileEditField
            label="Dating style"
            type="select"
            value={datingStyle()}
            onChange={(val) => setDatingStyle(val as string)}
            options={[
              { value: 'monogamous', label: 'Monogamous' },
              { value: 'open', label: 'Open' },
              { value: 'polyamorous', label: 'Polyamorous' },
              { value: 'not-sure', label: 'Not sure yet' },
            ]}
          />
          <ProfileEditField
            label="Friends open to"
            type="multi-select"
            value={friendsOpenTo()}
            onChange={(val) => setFriendsOpenTo(val as string[])}
            options={[
              { value: 'men', label: 'Men' },
              { value: 'women', label: 'Women' },
              { value: 'non-binary', label: 'Non-binary' },
            ]}
          />
          <ProfileEditField
            label="Children"
            type="select"
            value={children()}
            onChange={(val) => setChildren(val as string)}
            options={[
              { value: 'none', label: 'None' },
              { value: 'one', label: 'One' },
              { value: 'two-or-more', label: 'Two or more' },
            ]}
          />
          <ProfileEditField
            label="Wants children"
            type="select"
            value={wantsChildren()}
            onChange={(val) => setWantsChildren(val as string)}
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
              { value: 'open-to-it', label: 'Open to it' },
              { value: 'not-sure', label: 'Not sure' },
            ]}
          />
        </ProfileEditCard>
      </div>
    )
  },
}

/**
 * Lifestyle section with tags and selects
 */
export const LifestyleSection: Story = {
  render: () => {
    const [hobbies, setHobbies] = createSignal(['Photography', 'Hiking', 'Cooking'])
    const [drinking, setDrinking] = createSignal('socially')
    const [smoking, setSmoking] = createSignal('no')
    const [drugs, setDrugs] = createSignal('never')

    return (
      <div class="w-[498px]">
        <ProfileEditCard title="Lifestyle">
          <ProfileEditField
            label="Hobbies"
            type="tags"
            value={hobbies()}
            onChange={(val) => setHobbies(val as string[])}
            placeholder="Add hobby"
          />
          <ProfileEditField
            label="Drinking"
            type="select"
            value={drinking()}
            onChange={(val) => setDrinking(val as string)}
            options={[
              { value: 'never', label: 'Never' },
              { value: 'socially', label: 'Socially' },
              { value: 'regularly', label: 'Regularly' },
            ]}
          />
          <ProfileEditField
            label="Smoking"
            type="select"
            value={smoking()}
            onChange={(val) => setSmoking(val as string)}
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
              { value: 'occasionally', label: 'Occasionally' },
            ]}
          />
          <ProfileEditField
            label="Drugs"
            type="select"
            value={drugs()}
            onChange={(val) => setDrugs(val as string)}
            options={[
              { value: 'never', label: 'Never' },
              { value: 'occasionally', label: 'Occasionally' },
              { value: 'regularly', label: 'Regularly' },
            ]}
          />
        </ProfileEditCard>
      </div>
    )
  },
}

/**
 * Full profile edit page with all sections
 */
export const FullProfileEdit: Story = {
  render: () => {
    // Basics
    const [age, setAge] = createSignal(28)
    const [gender, setGender] = createSignal('woman')
    const [nationality, setNationality] = createSignal('French')
    const [nativeLanguage, setNativeLanguage] = createSignal('English')
    const [learning, setLearning] = createSignal(['Spanish', 'Japanese'])

    // Location
    const [location, setLocation] = createSignal('San Francisco')
    const [flexibility, setFlexibility] = createSignal('open-to-relocating')

    // Education
    const [school, setSchool] = createSignal('Stanford University')
    const [degree, setDegree] = createSignal('bachelor')
    const [field, setField] = createSignal('Computer Science')
    const [profession, setProfession] = createSignal('Software Engineer')
    const [industry, setIndustry] = createSignal('Technology')
    const [skills, setSkills] = createSignal(['React', 'TypeScript', 'Design'])

    // Dating
    const [status, setStatus] = createSignal('single')
    const [height, setHeight] = createSignal(`5'7" (170 cm)`)
    const [sexuality, setSexuality] = createSignal('bisexual')
    const [ethnicity, setEthnicity] = createSignal('white-caucasian')
    const [datingStyle, setDatingStyle] = createSignal('monogamous')
    const [friendsOpenTo, setFriendsOpenTo] = createSignal(['men', 'women'])
    const [children, setChildren] = createSignal('none')
    const [wantsChildren, setWantsChildren] = createSignal('open-to-it')

    // Lifestyle
    const [hobbies, setHobbies] = createSignal(['Photography', 'Hiking', 'Cooking'])
    const [drinking, setDrinking] = createSignal('socially')
    const [smoking, setSmoking] = createSignal('no')
    const [drugs, setDrugs] = createSignal('never')

    return (
      <div class="w-[498px] flex flex-col gap-4 p-8 bg-[var(--bg-page)] min-h-screen">
        <ProfileEditCard title="Basics">
          <ProfileEditField label="Age" type="number" value={age()} onChange={(val) => setAge(val as number)} />
          <ProfileEditField
            label="Gender"
            type="select"
            value={gender()}
            onChange={(val) => setGender(val as string)}
            options={[
              { value: 'woman', label: 'Woman' },
              { value: 'man', label: 'Man' },
              { value: 'non-binary', label: 'Non-binary' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <ProfileEditField label="Nationality" type="text" value={nationality()} onChange={(val) => setNationality(val as string)} />
          <ProfileEditField label="Native language" type="text" value={nativeLanguage()} onChange={(val) => setNativeLanguage(val as string)} />
          <ProfileEditField label="Learning" type="tags" value={learning()} onChange={(val) => setLearning(val as string[])} />
        </ProfileEditCard>

        <ProfileEditCard title="Location">
          <ProfileEditField label="Location" type="text" value={location()} onChange={(val) => setLocation(val as string)} />
          <ProfileEditField
            label="Flexibility"
            type="select"
            value={flexibility()}
            onChange={(val) => setFlexibility(val as string)}
            options={[
              { value: 'open-to-relocating', label: 'Open to relocating' },
              { value: 'not-open', label: 'Not open to relocating' },
            ]}
          />
        </ProfileEditCard>

        <ProfileEditCard title="Education & Career">
          <ProfileEditField label="School" type="text" value={school()} onChange={(val) => setSchool(val as string)} />
          <ProfileEditField
            label="Degree"
            type="select"
            value={degree()}
            onChange={(val) => setDegree(val as string)}
            options={[
              { value: 'bachelor', label: 'Bachelor of Science' },
              { value: 'master', label: 'Master of Science' },
            ]}
          />
          <ProfileEditField label="Field of study" type="text" value={field()} onChange={(val) => setField(val as string)} />
          <ProfileEditField label="Profession" type="text" value={profession()} onChange={(val) => setProfession(val as string)} />
          <ProfileEditField label="Industry" type="text" value={industry()} onChange={(val) => setIndustry(val as string)} />
          <ProfileEditField label="Skills" type="tags" value={skills()} onChange={(val) => setSkills(val as string[])} />
        </ProfileEditCard>

        <ProfileEditCard title="Dating">
          <ProfileEditField
            label="Relationship status"
            type="select"
            value={status()}
            onChange={(val) => setStatus(val as string)}
            options={[{ value: 'single', label: 'Single' }]}
          />
          <ProfileEditField label="Height" type="text" value={height()} onChange={(val) => setHeight(val as string)} />
          <ProfileEditField
            label="Sexuality"
            type="select"
            value={sexuality()}
            onChange={(val) => setSexuality(val as string)}
            options={[{ value: 'bisexual', label: 'Bisexual' }]}
          />
          <ProfileEditField
            label="Ethnicity"
            type="select"
            value={ethnicity()}
            onChange={(val) => setEthnicity(val as string)}
            options={[{ value: 'white-caucasian', label: 'White / Caucasian' }]}
          />
          <ProfileEditField
            label="Dating style"
            type="select"
            value={datingStyle()}
            onChange={(val) => setDatingStyle(val as string)}
            options={[{ value: 'monogamous', label: 'Monogamous' }]}
          />
          <ProfileEditField
            label="Friends open to"
            type="multi-select"
            value={friendsOpenTo()}
            onChange={(val) => setFriendsOpenTo(val as string[])}
            options={[
              { value: 'men', label: 'Men' },
              { value: 'women', label: 'Women' },
            ]}
          />
          <ProfileEditField
            label="Children"
            type="select"
            value={children()}
            onChange={(val) => setChildren(val as string)}
            options={[{ value: 'none', label: 'None' }]}
          />
          <ProfileEditField
            label="Wants children"
            type="select"
            value={wantsChildren()}
            onChange={(val) => setWantsChildren(val as string)}
            options={[{ value: 'open-to-it', label: 'Open to it' }]}
          />
        </ProfileEditCard>

        <ProfileEditCard title="Lifestyle">
          <ProfileEditField label="Hobbies" type="tags" value={hobbies()} onChange={(val) => setHobbies(val as string[])} />
          <ProfileEditField
            label="Drinking"
            type="select"
            value={drinking()}
            onChange={(val) => setDrinking(val as string)}
            options={[{ value: 'socially', label: 'Socially' }]}
          />
          <ProfileEditField
            label="Smoking"
            type="select"
            value={smoking()}
            onChange={(val) => setSmoking(val as string)}
            options={[{ value: 'no', label: 'No' }]}
          />
          <ProfileEditField
            label="Drugs"
            type="select"
            value={drugs()}
            onChange={(val) => setDrugs(val as string)}
            options={[{ value: 'never', label: 'Never' }]}
          />
        </ProfileEditCard>
      </div>
    )
  },
}
