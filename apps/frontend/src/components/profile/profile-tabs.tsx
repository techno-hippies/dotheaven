import type { Component } from 'solid-js'
import { Tabs, type TabItem } from '@heaven/ui'

export type ProfileTab = 'activity' | 'videos' | 'music' | 'health' | 'schedule'

export interface ProfileTabsProps {
  class?: string
  activeTab: ProfileTab
  onTabChange?: (tab: ProfileTab) => void
}

// Phosphor icon components
const ActivityIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,160H56V56H200V200ZM96,128a8,8,0,0,1,8-8h16V104a8,8,0,0,1,16,0v16h16a8,8,0,0,1,0,16H136v16a8,8,0,0,1-16,0V136H104A8,8,0,0,1,96,128Z" />
  </svg>
)

const VideosIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M164.44,121.34l-48-32A8,8,0,0,0,104,96v64a8,8,0,0,0,12.44,6.66l48-32a8,8,0,0,0,0-13.32ZM120,145.05V111l25.58,17ZM216,40H40A16,16,0,0,0,24,56V168a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,128H40V56H216V168Zm16,40a8,8,0,0,1-8,8H32a8,8,0,0,1,0-16H224A8,8,0,0,1,232,208Z" />
  </svg>
)

const MusicIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,25.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,64V174.08A36,36,0,1,0,88,204V70.25l112-28v99.83A36,36,0,1,0,216,172V32A8,8,0,0,0,212.92,25.69ZM52,224a20,20,0,1,1,20-20A20,20,0,0,1,52,224Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,192Z" />
  </svg>
)

const HealthIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M178,32c-20.65,0-38.73,8.88-50,23.89C116.73,40.88,98.65,32,78,32A62.07,62.07,0,0,0,16,94c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,220.66,240,164,240,94A62.07,62.07,0,0,0,178,32ZM128,206.8C109.74,196.16,32,147.69,32,94A46.06,46.06,0,0,1,78,48c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,147.61,146.24,196.15,128,206.8Z" />
  </svg>
)

const ScheduleIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-96-88v64a8,8,0,0,1-16,0V132.94l-4.42,2.22a8,8,0,0,1-7.16-14.32l16-8A8,8,0,0,1,112,120Zm59.16,30.45L152,176h16a8,8,0,0,1,0,16H136a8,8,0,0,1-6.4-12.8l28.78-38.37A8,8,0,1,0,145.07,132a8,8,0,1,1-13.85-8A24,24,0,0,1,176,136,23.76,23.76,0,0,1,171.16,150.45Z" />
  </svg>
)

const tabs: TabItem[] = [
  {
    id: 'activity',
    label: 'Activity',
    icon: <ActivityIcon />,
  },
  {
    id: 'videos',
    label: 'Videos',
    icon: <VideosIcon />,
  },
  {
    id: 'music',
    label: 'Music',
    icon: <MusicIcon />,
  },
  {
    id: 'health',
    label: 'Health',
    icon: <HealthIcon />,
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
 * - 5 tabs: Activity, Videos, Music, Health, Schedule
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
    />
  )
}
