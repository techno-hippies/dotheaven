import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { MobileFooter, MobileFooterItem } from './MobileFooter'
import {
  Home, HomeFill, UsersThree, UsersThreeFill,
  ChatCircle, ChatCircleFill, User, Wallet, CalendarBlank,
  MusicNotes, MusicNotesFill,
} from '../icons'

// ── Icon aliases (matching original names used in this file) ─────

const HomeIcon = () => <Home />
const CommunityIcon = () => <UsersThree />
const ChatCircleIcon = () => <ChatCircle />
const WalletIcon = () => <Wallet />
const UserIcon = () => <User />
const CalendarIcon = () => <CalendarBlank />
const HomeFillIcon = () => <HomeFill />
const CommunityFillIcon = () => <UsersThreeFill />
const ChatCircleFillIcon = () => <ChatCircleFill />

// No icon package equivalents for these filled variants
const WalletFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm-36,80a12,12,0,1,1,12-12A12,12,0,0,1,180,144Z" />
  </svg>
)

const CalendarFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,48H48V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24Z" />
  </svg>
)

const UserFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.93,220a8,8,0,0,1-6.93,4H32a8,8,0,0,1-6.92-12c15.23-26.33,38.7-45.21,66.09-54.16a72,72,0,1,1,73.66,0c27.39,8.95,50.86,27.83,66.09,54.16A8,8,0,0,1,230.93,220Z" />
  </svg>
)

const defaultTabs = [
  { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
  { id: 'search', icon: <CommunityIcon />, activeIcon: <CommunityFillIcon />, label: 'Community' },
  { id: 'music', icon: <MusicNotes />, activeIcon: <MusicNotesFill />, label: 'Music' },
  { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages' },
  { id: 'schedule', icon: <CalendarIcon />, activeIcon: <CalendarFillIcon />, label: 'Schedule' },
  { id: 'wallet', icon: <WalletIcon />, activeIcon: <WalletFillIcon />, label: 'Wallet' },
]

const meta: Meta<typeof MobileFooter> = {
  title: 'Layout/MobileFooter',
  component: MobileFooter,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div class="h-screen bg-[var(--bg-page)] flex flex-col">
        <div class="flex-1" />
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof MobileFooter>

export const Default: Story = {
  args: {
    tabs: defaultTabs,
    activeTab: 'home',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

export const WithMessageBadge: Story = {
  args: {
    tabs: [
      { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
      { id: 'search', icon: <CommunityIcon />, activeIcon: <CommunityFillIcon />, label: 'Community' },
      { id: 'music', icon: <MusicNotes />, activeIcon: <MusicNotesFill />, label: 'Music' },
      { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages', badge: 3 },
      { id: 'schedule', icon: <CalendarIcon />, activeIcon: <CalendarFillIcon />, label: 'Schedule' },
      { id: 'wallet', icon: <WalletIcon />, activeIcon: <WalletFillIcon />, label: 'Wallet' },
    ],
    activeTab: 'home',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

export const HighBadgeCount: Story = {
  args: {
    tabs: [
      { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
      { id: 'search', icon: <CommunityIcon />, activeIcon: <CommunityFillIcon />, label: 'Community' },
      { id: 'music', icon: <MusicNotes />, activeIcon: <MusicNotesFill />, label: 'Music' },
      { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages', badge: 150 },
      { id: 'schedule', icon: <CalendarIcon />, activeIcon: <CalendarFillIcon />, label: 'Schedule' },
      { id: 'wallet', icon: <WalletIcon />, activeIcon: <WalletFillIcon />, label: 'Wallet' },
    ],
    activeTab: 'home',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

export const MessagesActive: Story = {
  args: {
    tabs: [
      { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
      { id: 'search', icon: <CommunityIcon />, activeIcon: <CommunityFillIcon />, label: 'Community' },
      { id: 'music', icon: <MusicNotes />, activeIcon: <MusicNotesFill />, label: 'Music' },
      { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages', badge: 5 },
      { id: 'schedule', icon: <CalendarIcon />, activeIcon: <CalendarFillIcon />, label: 'Schedule' },
      { id: 'wallet', icon: <WalletIcon />, activeIcon: <WalletFillIcon />, label: 'Wallet' },
    ],
    activeTab: 'messages',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

export const WalletActive: Story = {
  args: {
    tabs: defaultTabs,
    activeTab: 'wallet',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

export const ScheduleActive: Story = {
  args: {
    tabs: defaultTabs,
    activeTab: 'schedule',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

export const MobileViewport: Story = {
  args: {
    tabs: [
      { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
      { id: 'search', icon: <CommunityIcon />, activeIcon: <CommunityFillIcon />, label: 'Community' },
      { id: 'music', icon: <MusicNotes />, activeIcon: <MusicNotesFill />, label: 'Music' },
      { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages', badge: 2 },
      { id: 'schedule', icon: <CalendarIcon />, activeIcon: <CalendarFillIcon />, label: 'Schedule' },
      { id: 'wallet', icon: <WalletIcon />, activeIcon: <WalletFillIcon />, label: 'Wallet' },
    ],
    activeTab: 'home',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
}

// Individual item stories
export const ItemDefault: StoryObj<typeof MobileFooterItem> = {
  render: () => (
    <MobileFooterItem
      icon={<HomeIcon />}
      label="Home"
      onClick={() => console.log('clicked')}
    />
  ),
}

export const ItemActive: StoryObj<typeof MobileFooterItem> = {
  render: () => (
    <MobileFooterItem
      icon={<HomeFillIcon />}
      label="Home"
      active
      onClick={() => console.log('clicked')}
    />
  ),
}

export const ItemWithBadge: StoryObj<typeof MobileFooterItem> = {
  render: () => (
    <MobileFooterItem
      icon={<ChatCircleIcon />}
      label="Messages"
      badge={7}
      onClick={() => console.log('clicked')}
    />
  ),
}

export const ItemActiveBadge: StoryObj<typeof MobileFooterItem> = {
  render: () => (
    <MobileFooterItem
      icon={<ChatCircleFillIcon />}
      label="Messages"
      active
      badge={12}
      onClick={() => console.log('clicked')}
    />
  ),
}
