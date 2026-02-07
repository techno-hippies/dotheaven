import type { Meta, StoryObj } from 'storybook-solidjs'
import { CommunityCard } from './community-card'

const meta: Meta<typeof CommunityCard> = {
  title: 'Community/CommunityCard',
  component: CommunityCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', 'max-width': '520px', background: 'var(--bg-page)', padding: '16px', 'border-radius': '6px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof CommunityCard>

// ── Basic ───────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    name: 'Matthias',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
    bio: 'I love red wine, comic books, hiking, and my dog Max.',
    online: true,
    age: 28,
    gender: 'M',
    nationalityCode: 'DE',
    verified: 'verified',
    languages: [
      { code: 'en', proficiency: 7 },
      { code: 'de', proficiency: 7 },
      { code: 'es', proficiency: 3 },
      { code: 'ja', proficiency: 2 },
    ],
  },
}

// ── Verified user ───────────────────────────────────────────────────────

export const Verified: Story = {
  args: {
    name: 'Hannah',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
    bio: "I'm heading to Spain this summer! Can anyone give me recommendations?",
    online: false,
    age: 24,
    gender: 'F',
    nationalityCode: 'US',
    verified: 'verified',
    languages: [
      { code: 'en', proficiency: 7 },
      { code: 'es', proficiency: 4 },
      { code: 'fr', proficiency: 3 },
    ],
  },
}

// ── Many languages ────────────────────────────────────────────

export const ManyLanguages: Story = {
  args: {
    name: 'Eduardo',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop&crop=face',
    bio: "I just moved to Madrid. Let's get coffee!",
    online: true,
    age: 31,
    gender: 'M',
    nationalityCode: 'BR',
    languages: [
      { code: 'en', proficiency: 7 },
      { code: 'pt', proficiency: 7 },
      { code: 'es', proficiency: 5 },
      { code: 'fr', proficiency: 3 },
      { code: 'de', proficiency: 2 },
      { code: 'it', proficiency: 2 },
      { code: 'ja', proficiency: 1 },
      { code: 'ko', proficiency: 1 },
    ],
  },
}

// ── Featured card ───────────────────────────────────────────────────────

export const Featured: Story = {
  args: {
    name: 'Martina',
    avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300&h=300&fit=crop&crop=face',
    bio: 'I want to practice some new Spanish words I learned.',
    online: true,
    featured: true,
    age: 26,
    gender: 'F',
    nationalityCode: 'AT',
    verified: 'verified',
    languages: [
      { code: 'en', proficiency: 7 },
      { code: 'de', proficiency: 7 },
      { code: 'es', proficiency: 3 },
      { code: 'ja', proficiency: 2 },
    ],
  },
}

// ── Minimal (no bio) ──────────────────────────────────────────

export const Minimal: Story = {
  args: {
    name: 'Yuki',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face',
    age: 22,
    nationalityCode: 'JP',
    languages: [
      { code: 'ja', proficiency: 7 },
      { code: 'en', proficiency: 2 },
    ],
  },
}

// ── No avatar ───────────────────────────────────────────────────────

export const NoAvatar: Story = {
  args: {
    name: 'Anonymous',
    bio: 'Looking for language exchange partners!',
    online: false,
    age: 25,
    gender: 'NB',
    nationalityCode: 'KR',
    languages: [
      { code: 'ko', proficiency: 7 },
      { code: 'en', proficiency: 4 },
      { code: 'ja', proficiency: 2 },
    ],
  },
}

// ── Multiple cards stacked ──────────────────────────────────────────────

export const CardList: StoryObj = {
  decorators: [
    (Story) => (
      <div style={{ width: '480px', height: '600px', overflow: 'auto', background: 'var(--bg-page)', padding: '12px' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div class="flex flex-col gap-2">
      <CommunityCard
        name="Matthias"
        avatarUrl="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face"
        bio="I love red wine, comic books, hiking, and my dog Max."
        online={true}
        age={28}
        gender="M"
        nationalityCode="DE"
        verified="verified"
        languages={[
          { code: 'en', proficiency: 7 },
          { code: 'de', proficiency: 7 },
          { code: 'es', proficiency: 3 },
        ]}
      />
      <CommunityCard
        name="Martina"
        avatarUrl="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face"
        bio="I want to practice some new Spanish words I learned."
        online={true}
        age={26}
        gender="F"
        nationalityCode="AT"
        verified="verified"
        languages={[
          { code: 'en', proficiency: 7 },
          { code: 'de', proficiency: 7 },
          { code: 'es', proficiency: 3 },
        ]}
      />
      <CommunityCard
        name="Hannah"
        avatarUrl="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face"
        bio="I'm heading to Spain this summer! Can anyone give me recommendations?"
        age={24}
        gender="F"
        nationalityCode="US"
        languages={[
          { code: 'en', proficiency: 7 },
          { code: 'es', proficiency: 4 },
          { code: 'fr', proficiency: 3 },
        ]}
      />
      <CommunityCard
        name="Alex"
        avatarUrl="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop&crop=face"
        bio="Artist and musician. They/them pronouns."
        online={true}
        age={27}
        gender="NB"
        nationalityCode="GB"
        languages={[
          { code: 'en', proficiency: 7 },
          { code: 'es', proficiency: 5 },
        ]}
      />
      <CommunityCard
        name="Mia"
        avatarUrl="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face"
        bio="Music lover. Looking for people to practice Japanese with!"
        age={22}
        nationalityCode="CA"
        languages={[
          { code: 'en', proficiency: 7 },
          { code: 'ja', proficiency: 3 },
          { code: 'ko', proficiency: 1 },
        ]}
      />
    </div>
  ),
}
