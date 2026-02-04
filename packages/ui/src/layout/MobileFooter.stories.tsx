import type { Meta, StoryObj } from 'storybook-solidjs'
import { MobileFooter, MobileFooterItem } from './MobileFooter'

// Phosphor icons (regular weight) - same style as AppSidebar
// Regular weight icons
const HomeIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
  </svg>
)

const SearchIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
  </svg>
)

const MusicNotesIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)

const ChatCircleIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)

const UserIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)

// Fill weight icons for active state
const HomeFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,115.55V208a16,16,0,0,1-16,16H168a16,16,0,0,1-16-16V168a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v40a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V115.55a16,16,0,0,1,5.17-11.78l80-75.48a16,16,0,0,1,21.66,0l80,75.48A16,16,0,0,1,224,115.55Z" />
  </svg>
)

const SearchFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M168,112a56,56,0,1,1-56-56A56,56,0,0,1,168,112Zm61.66,117.66a8,8,0,0,1-11.32,0l-50.06-50.07a88,88,0,1,1,11.32-11.31l50.06,50.06A8,8,0,0,1,229.66,229.66ZM112,184a72,72,0,1,0-72-72A72.08,72.08,0,0,0,112,184Z" />
  </svg>
)

const MusicNotesFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V98.75l112-28v69.33A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69Z" />
  </svg>
)

const ChatCircleFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Z" />
  </svg>
)

const UserFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)

const defaultTabs = [
  { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
  { id: 'search', icon: <SearchIcon />, activeIcon: <SearchFillIcon />, label: 'Search' },
  { id: 'library', icon: <MusicNotesIcon />, activeIcon: <MusicNotesFillIcon />, label: 'Library' },
  { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages' },
  { id: 'profile', icon: <UserIcon />, activeIcon: <UserFillIcon />, label: 'Profile' },
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
      { id: 'search', icon: <SearchIcon />, activeIcon: <SearchFillIcon />, label: 'Search' },
      { id: 'library', icon: <MusicNotesIcon />, activeIcon: <MusicNotesFillIcon />, label: 'Library' },
      { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages', badge: 3 },
      { id: 'profile', icon: <UserIcon />, activeIcon: <UserFillIcon />, label: 'Profile' },
    ],
    activeTab: 'home',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

export const HighBadgeCount: Story = {
  args: {
    tabs: [
      { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
      { id: 'search', icon: <SearchIcon />, activeIcon: <SearchFillIcon />, label: 'Search' },
      { id: 'library', icon: <MusicNotesIcon />, activeIcon: <MusicNotesFillIcon />, label: 'Library' },
      { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages', badge: 150 },
      { id: 'profile', icon: <UserIcon />, activeIcon: <UserFillIcon />, label: 'Profile' },
    ],
    activeTab: 'home',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

export const MessagesActive: Story = {
  args: {
    tabs: [
      { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
      { id: 'search', icon: <SearchIcon />, activeIcon: <SearchFillIcon />, label: 'Search' },
      { id: 'library', icon: <MusicNotesIcon />, activeIcon: <MusicNotesFillIcon />, label: 'Library' },
      { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages', badge: 5 },
      { id: 'profile', icon: <UserIcon />, activeIcon: <UserFillIcon />, label: 'Profile' },
    ],
    activeTab: 'messages',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

export const ProfileActive: Story = {
  args: {
    tabs: defaultTabs,
    activeTab: 'profile',
    onTabPress: (id) => console.log('Tab pressed:', id),
  },
}

// Mobile viewport simulation
export const MobileViewport: Story = {
  args: {
    tabs: [
      { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
      { id: 'search', icon: <SearchIcon />, activeIcon: <SearchFillIcon />, label: 'Search' },
      { id: 'library', icon: <MusicNotesIcon />, activeIcon: <MusicNotesFillIcon />, label: 'Library' },
      { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages', badge: 2 },
      { id: 'profile', icon: <UserIcon />, activeIcon: <UserFillIcon />, label: 'Profile' },
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
const itemMeta: Meta<typeof MobileFooterItem> = {
  title: 'Layout/MobileFooterItem',
  component: MobileFooterItem,
  decorators: [
    (Story) => (
      <div class="bg-[var(--bg-surface)] p-4 inline-flex">
        <Story />
      </div>
    ),
  ],
}

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
      icon={<HomeIcon />}
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
      icon={<ChatCircleIcon />}
      label="Messages"
      active
      badge={12}
      onClick={() => console.log('clicked')}
    />
  ),
}
