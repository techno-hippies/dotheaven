import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { ProfileAboutSidebar } from './profile-about-sidebar'
import type { ProfileInput } from './profile-info-section'

const meta = {
  title: 'Profile/ProfileAboutSidebar',
  component: ProfileAboutSidebar,
  parameters: {
    layout: 'padded',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', 'max-width': '360px', background: 'var(--bg-page)', padding: '16px', 'border-radius': '6px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileAboutSidebar>

export default meta
type Story = StoryObj<typeof meta>

const fullProfile: ProfileInput = {
  languages: [
    { code: 'ja', name: 'Japanese', proficiency: 7 },
    { code: 'en', name: 'English', proficiency: 5 },
    { code: 'fr', name: 'French', proficiency: 3 },
  ],
  school: 'University of Tokyo',
  degree: 'bachelor',
  fieldBucket: 'computer-science',
  profession: 'software-engineer',
  industry: 'technology',
  relationshipStatus: 'single',
  heightCm: 165,
  relocate: 'maybe',
  lookingFor: 'long-term',
  sexuality: 'straight',
  ethnicity: 'east-asian',
  datingStyle: 'monogamous',
  children: 'none',
  wantsChildren: 'yes',
  hobbiesCommit: '1,5,102,150,302',
  skillsCommit: '1000,1004,1050',
  drinking: 'socially',
  smoking: 'no',
  drugs: 'never',
  religion: 'agnostic',
  pets: 'has-pets',
  diet: 'omnivore',
}

export const AllFieldsFilled: Story = {
  args: {
    profile: fullProfile,
  },
}

export const LanguagesOnly: Story = {
  args: {
    profile: {
      languages: [
        { code: 'en', name: 'English', proficiency: 7 },
        { code: 'es', name: 'Spanish', proficiency: 4 },
        { code: 'ja', name: 'Japanese', proficiency: 2 },
        { code: 'de', name: 'German', proficiency: 1 },
      ],
    },
  },
}

export const EmptyProfile: Story = {
  args: {
    profile: {},
  },
}

export const TwoColumnLayout: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '100%', 'max-width': '900px', background: 'var(--bg-page)', padding: '16px', 'border-radius': '6px' }}>
        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ width: '340px', 'flex-shrink': '0' }}>
            <Story />
          </div>
          <div style={{ flex: '1', 'min-width': '0' }}>
            <div style={{ padding: '24px', background: 'var(--bg-surface)', 'border-radius': '6px' }}>
              <div style={{ color: 'var(--text-muted)', 'text-align': 'center', padding: '48px 0' }}>
                Activity feed goes here
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  ],
  args: {
    profile: fullProfile,
  },
}
