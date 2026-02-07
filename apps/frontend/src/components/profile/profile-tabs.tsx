import type { Component } from 'solid-js'
import { Tabs, type TabItem } from '@heaven/ui'

export type ProfileTab = 'posts' | 'about' | 'music' | 'wallet' | 'schedule'

export interface ProfileTabsProps {
  class?: string
  activeTab: ProfileTab
  onTabChange?: (tab: ProfileTab) => void
}

// Phosphor icon components
const MusicIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,25.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,64V174.08A36,36,0,1,0,88,204V70.25l112-28v99.83A36,36,0,1,0,216,172V32A8,8,0,0,0,212.92,25.69ZM52,224a20,20,0,1,1,20-20A20,20,0,0,1,52,224Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,192Z" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
  </svg>
)

const ScheduleIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-96-88v64a8,8,0,0,1-16,0V132.94l-4.42,2.22a8,8,0,0,1-7.16-14.32l16-8A8,8,0,0,1,112,120Zm59.16,30.45L152,176h16a8,8,0,0,1,0,16H136a8,8,0,0,1-6.4-12.8l28.78-38.37A8,8,0,1,0,145.07,132a8,8,0,1,1-13.85-8A24,24,0,0,1,176,136,23.76,23.76,0,0,1,171.16,150.45Z" />
  </svg>
)

const AboutIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z" />
  </svg>
)

const PostsIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM184,96a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,96Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,128Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,160Z" />
  </svg>
)

const tabs: TabItem[] = [
  {
    id: 'posts',
    label: 'Posts',
    icon: <PostsIcon />,
  },
  {
    id: 'about',
    label: 'About',
    icon: <AboutIcon />,
  },
  {
    id: 'music',
    label: 'Music',
    icon: <MusicIcon />,
  },
  {
    id: 'wallet',
    label: 'Wallet',
    icon: <WalletIcon />,
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: <ScheduleIcon />,
  },
]

/**
 * ProfileTabs - Tab navigation for profile sections
 *
 * Features:
 * - 4 tabs: About, Activity, Music, Schedule
 * - Phosphor icons for each tab
 * - Active state with bottom border highlight
 * - Click handler for tab switching
 */
export const ProfileTabs: Component<ProfileTabsProps> = (props) => {
  return (
    <Tabs
      class={props.class}
      tabs={tabs}
      activeTab={props.activeTab}
      onTabChange={(tabId) => props.onTabChange?.(tabId as ProfileTab)}
      padded
    />
  )
}
