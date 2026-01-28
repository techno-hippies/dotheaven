import type { Meta, StoryObj } from 'storybook-solidjs'
import { InfoCard, InfoCardSection, InfoCardRow } from './info-card'

const meta: Meta<typeof InfoCard> = {
  title: 'Components/InfoCard',
  component: InfoCard,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#1a1625' }
      ]
    }
  },
  tags: ['autodocs']
}

export default meta
type Story = StoryObj<typeof InfoCard>

/**
 * Basics section - personal information
 */
export const Basics: Story = {
  render: () => (
    <InfoCard class="w-[498px]">
      <InfoCardSection title="Basics">
        <InfoCardRow label="Age" value="28" />
        <InfoCardRow label="Gender" value="Woman" />
        <InfoCardRow label="Nationality" value="French" />
        <InfoCardRow label="Native language" value="English" />
        <InfoCardRow label="Learning" value="Spanish, Japanese" />
      </InfoCardSection>
    </InfoCard>
  )
}

/**
 * Location section - geographic information
 */
export const Location: Story = {
  render: () => (
    <InfoCard class="w-[498px]">
      <InfoCardSection title="Location">
        <InfoCardRow label="Location" value="San Francisco" />
        <InfoCardRow label="Flexibility" value="Open to relocating" />
      </InfoCardSection>
    </InfoCard>
  )
}

/**
 * Dating section - relationship preferences
 */
export const Dating: Story = {
  render: () => (
    <InfoCard class="w-[498px]">
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
  )
}

/**
 * Education & Career section - professional background
 */
export const EducationCareer: Story = {
  render: () => (
    <InfoCard class="w-[498px]">
      <InfoCardSection title="Education & Career">
        <InfoCardRow label="School" value="Stanford University" />
        <InfoCardRow label="Degree" value="Bachelor of Science" />
        <InfoCardRow label="Field of study" value="Computer Science" />
        <InfoCardRow label="Profession" value="Software Engineer" />
        <InfoCardRow label="Industry" value="Technology" />
        <InfoCardRow label="Skills" value="React, TypeScript, Design" />
      </InfoCardSection>
    </InfoCard>
  )
}

/**
 * Lifestyle section - habits and preferences
 */
export const Lifestyle: Story = {
  render: () => (
    <InfoCard class="w-[498px]">
      <InfoCardSection title="Lifestyle">
        <InfoCardRow label="Hobbies" value="Photography, Hiking, Cooking" />
        <InfoCardRow label="Drinking" value="Socially" />
        <InfoCardRow label="Smoking" value="No" />
        <InfoCardRow label="Drugs" value="Never" />
      </InfoCardSection>
    </InfoCard>
  )
}

/**
 * All cards shown separately (as they appear in profile)
 */
export const AllCards: Story = {
  render: () => (
    <div class="flex flex-col gap-4 w-[498px]">
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
  )
}

/**
 * Empty state
 */
export const Empty: Story = {
  render: () => (
    <InfoCard class="w-[498px]">
      <InfoCardSection title="Basics">
        <div class="text-[var(--text-muted)] text-center py-4">
          No information available
        </div>
      </InfoCardSection>
    </InfoCard>
  )
}

/**
 * Account settings example - showing generalizability
 */
export const AccountSettings: Story = {
  render: () => (
    <div class="flex flex-col gap-4 w-[498px]">
      <InfoCard>
        <InfoCardSection title="Account">
          <InfoCardRow label="Username" value="@heaven_user" />
          <InfoCardRow label="Email" value="user@heaven.com" />
          <InfoCardRow label="Member since" value="January 2026" />
        </InfoCardSection>
      </InfoCard>

      <InfoCard>
        <InfoCardSection title="Privacy">
          <InfoCardRow label="Profile visibility" value="Public" />
          <InfoCardRow label="Activity status" value="Visible" />
          <InfoCardRow label="Message requests" value="Everyone" />
        </InfoCardSection>
      </InfoCard>
    </div>
  )
}
