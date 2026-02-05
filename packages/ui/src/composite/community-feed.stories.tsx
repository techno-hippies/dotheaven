import type { Meta, StoryObj } from 'storybook-solidjs'
import { CommunityFeed } from './community-feed'
import type { CommunityCardProps } from './community-card'
import { Avatar } from '../primitives/avatar'
import { IconButton } from '../primitives/icon-button'
import { Plus, MagnifyingGlass } from '../icons'

const meta: Meta<typeof CommunityFeed> = {
  title: 'Composite/CommunityFeed',
  component: CommunityFeed,
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof CommunityFeed>

// ── Sample data ─────────────────────────────────────────────────────────

const sampleMembers: CommunityCardProps[] = [
  {
    name: 'Matthias',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
    bio: 'I love red wine, comic books, hiking, and my dog Max.',
    online: true,
    age: 28,
    gender: 'M',
    verified: 'verified',
    topArtists: ['Radiohead', 'Tame Impala', 'Khruangbin'],
    languages: [
      { code: 'en', proficiency: 7 },
      { code: 'de', proficiency: 7 },
      { code: 'es', proficiency: 3 },
      { code: 'ja', proficiency: 2 },
    ],
  },
  {
    name: 'Hannah',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
    bio: "I'm heading to Spain this summer! Can anyone give me recommendations?",
    age: 24,
    gender: 'F',
    verified: 'verified',
    topArtists: ['Bad Bunny', 'Rosalia'],
    languages: [
      { code: 'en', proficiency: 7 },
      { code: 'es', proficiency: 4 },
      { code: 'fr', proficiency: 3 },
      { code: 'it', proficiency: 2 },
      { code: 'pt', proficiency: 1 },
    ],
  },
  {
    name: 'Eduardo',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop&crop=face',
    bio: "I just moved to Madrid. Let's get coffee!",
    online: true,
    age: 31,
    gender: 'M',
    topArtists: ['Gustavo Cerati', 'Soda Stereo'],
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
  {
    name: 'Mia',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face',
    bio: 'Music lover. Looking for people to practice Japanese with!',
    age: 22,
    topArtists: ['Frank Ocean', 'Nujabes'],
    languages: [
      { code: 'en', proficiency: 7 },
      { code: 'ja', proficiency: 3 },
      { code: 'ko', proficiency: 1 },
    ],
  },
  {
    name: 'Liam',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face',
    bio: 'Software engineer by day, language nerd by night. Currently grinding Korean dramas for immersion.',
    online: true,
    age: 29,
    gender: 'M',
    languages: [
      { code: 'en', proficiency: 7 },
      { code: 'ko', proficiency: 3 },
      { code: 'ja', proficiency: 2 },
    ],
  },
  {
    name: 'Sakura',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face',
    bio: 'Art student in Tokyo. I can help with Japanese!',
    age: 21,
    gender: 'F',
    verified: 'verified',
    topArtists: ['Yoasobi', 'Kenshi Yonezu', 'Aimer'],
    languages: [
      { code: 'ja', proficiency: 7 },
      { code: 'en', proficiency: 4 },
      { code: 'fr', proficiency: 2 },
    ],
  },
]

const featuredMember: CommunityCardProps = {
  name: 'Martina',
  avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300&h=300&fit=crop&crop=face',
  bio: 'I want to practice some new Spanish words I learned.',
  online: true,
  age: 26,
  gender: 'F',
  verified: 'verified',
  topArtists: ['Taylor Swift', 'Billie Eilish', 'SZA'],
  languages: [
    { code: 'en', proficiency: 7 },
    { code: 'de', proficiency: 7 },
    { code: 'es', proficiency: 3 },
    { code: 'ja', proficiency: 2 },
  ],
}

// ── Mobile view ─────────────────────────────────────────────────────────

export const Mobile: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '390px', height: '844px', overflow: 'hidden', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    members: sampleMembers,
    featuredMember,
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'nearby', label: 'Nearby', badge: '99+' },
      { id: 'travel', label: 'Travel' },
    ],
    headerLeftSlot: (
      <Avatar
        src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face"
        size="sm"
      />
    ),
    headerRightSlot: (
      <>
        <IconButton size="sm" variant="ghost" aria-label="Add friend">
          <Plus class="w-5 h-5" />
        </IconButton>
        <IconButton size="sm" variant="ghost" aria-label="Search">
          <MagnifyingGlass class="w-5 h-5" />
        </IconButton>
      </>
    ),
  },
}

// ── Desktop view ────────────────────────────────────────────────────────

export const Desktop: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '800px', height: '700px', overflow: 'hidden', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    members: sampleMembers,
    featuredMember,
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'nearby', label: 'Nearby', badge: '99+' },
      { id: 'travel', label: 'Travel' },
    ],
    headerLeftSlot: (
      <Avatar
        src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face"
        size="sm"
      />
    ),
    headerRightSlot: (
      <>
        <IconButton size="sm" variant="ghost" aria-label="Add friend">
          <Plus class="w-5 h-5" />
        </IconButton>
        <IconButton size="sm" variant="ghost" aria-label="Search">
          <MagnifyingGlass class="w-5 h-5" />
        </IconButton>
      </>
    ),
  },
}

// ── No featured member ──────────────────────────────────────────────────

export const NoFeatured: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '390px', height: '844px', overflow: 'hidden', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    members: sampleMembers,
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'nearby', label: 'Nearby', badge: '99+' },
      { id: 'travel', label: 'Travel' },
    ],
  },
}

// ── Empty state ─────────────────────────────────────────────────────────

export const Empty: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '390px', height: '400px', overflow: 'hidden', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    members: [],
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'nearby', label: 'Nearby' },
      { id: 'travel', label: 'Travel' },
    ],
    activeTab: 'nearby',
  },
}

// ── Nearby tab active ───────────────────────────────────────────────────

export const NearbyTab: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '390px', height: '844px', overflow: 'hidden', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    members: sampleMembers.slice(0, 3),
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'nearby', label: 'Nearby', badge: '3' },
      { id: 'travel', label: 'Travel' },
    ],
    activeTab: 'nearby',
  },
}
