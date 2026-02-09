import type { Meta, StoryObj } from 'storybook-solidjs'
import { FollowList, type FollowListMember } from './follow-list'

const meta: Meta<typeof FollowList> = {
  title: 'Profile/FollowList',
  component: FollowList,
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof FollowList>

const noop = () => {}

const sampleFollowers: FollowListMember[] = [
  {
    address: '0xC0FFEE0000000000000000000000000000000001',
    name: 'Yuki',
    handle: 'yuki.heaven',
    avatarUrl: 'https://placewaifu.com/image/100',
    nationalityCode: 'JP',
  },
  {
    address: '0xC0FFEE0000000000000000000000000000000002',
    name: 'Camille',
    handle: 'camille.heaven',
    avatarUrl: 'https://placewaifu.com/image/101',
    nationalityCode: 'FR',
  },
  {
    address: '0xC0FFEE0000000000000000000000000000000003',
    name: 'Matheus',
    handle: 'matheus.heaven',
    avatarUrl: 'https://placewaifu.com/image/102',
    nationalityCode: 'BR',
  },
  {
    address: '0xC0FFEE0000000000000000000000000000000004',
    name: 'Sophie',
    handle: 'sophie.heaven',
    avatarUrl: 'https://placewaifu.com/image/103',
    nationalityCode: 'DE',
  },
  {
    address: '0xC0FFEE0000000000000000000000000000000005',
    name: 'Erik',
    handle: 'erik.heaven',
    avatarUrl: 'https://placewaifu.com/image/104',
    nationalityCode: 'SE',
  },
  {
    address: '0xC0FFEE0000000000000000000000000000000006',
    name: '0xBEEF...1234',
    handle: '0xBEEF...1234',
  },
  {
    address: '0xC0FFEE0000000000000000000000000000000007',
    name: 'Hana',
    handle: 'hana.heaven',
    avatarUrl: 'https://placewaifu.com/image/105',
    nationalityCode: 'KR',
  },
  {
    address: '0xC0FFEE0000000000000000000000000000000008',
    name: 'Kai',
    handle: 'kai.heaven',
    avatarUrl: 'https://placewaifu.com/image/106',
    nationalityCode: 'US',
  },
]

// ── Desktop ─────────────────────────────────────────────────────────

export const DesktopFollowers: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '800px', height: '700px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Followers',
    members: sampleFollowers,
    hasMore: true,
    onBack: noop,
    onMemberClick: noop,
    onLoadMore: noop,
  },
}

export const DesktopFollowing: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '800px', height: '700px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Following',
    members: sampleFollowers.slice(0, 4),
    hasMore: false,
    onBack: noop,
    onMemberClick: noop,
  },
}

// ── Mobile ──────────────────────────────────────────────────────────

export const MobileFollowers: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  decorators: [
    (Story) => (
      <div style={{ width: '390px', height: '844px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Followers',
    members: sampleFollowers,
    hasMore: true,
    onBack: noop,
    onMemberClick: noop,
    onLoadMore: noop,
  },
}

export const MobileFollowing: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  decorators: [
    (Story) => (
      <div style={{ width: '390px', height: '844px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Following',
    members: sampleFollowers.slice(0, 3),
    hasMore: false,
    onBack: noop,
    onMemberClick: noop,
  },
}

// ── States ──────────────────────────────────────────────────────────

export const Loading: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '600px', height: '500px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Followers',
    members: [],
    loading: true,
    onBack: noop,
  },
}

export const EmptyFollowers: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '600px', height: '500px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Followers',
    members: [],
    onBack: noop,
  },
}

export const EmptyFollowing: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '600px', height: '500px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Following',
    members: [],
    onBack: noop,
  },
}

export const LoadingMore: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '600px', height: '700px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Followers',
    members: sampleFollowers,
    hasMore: true,
    loadingMore: true,
    onBack: noop,
    onMemberClick: noop,
    onLoadMore: noop,
  },
}
