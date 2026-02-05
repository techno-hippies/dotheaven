import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { Tabs } from './tabs'

const meta = {
  title: 'Primitives/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  argTypes: {
    onTabChange: { action: 'tab changed' },
  },
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

// Simple icons for examples
const HomeIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A16,16,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A16,16,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
  </svg>
)

const SearchIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
  </svg>
)

const UserIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)

const SettingsIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A111.92,111.92,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.63a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.1,8.1,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8,8,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z" />
  </svg>
)

export const Default: Story = {
  args: {
    tabs: [
      { id: 'home', label: 'Home', icon: <HomeIcon /> },
      { id: 'search', label: 'Search', icon: <SearchIcon /> },
      { id: 'profile', label: 'Profile', icon: <UserIcon /> },
      { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
    ],
    activeTab: 'home',
  },
}

export const WithoutIcons: Story = {
  args: {
    tabs: [
      { id: 'overview', label: 'Overview' },
      { id: 'details', label: 'Details' },
      { id: 'comments', label: 'Comments' },
      { id: 'history', label: 'History' },
    ],
    activeTab: 'overview',
  },
}

export const WithDisabled: Story = {
  args: {
    tabs: [
      { id: 'home', label: 'Home', icon: <HomeIcon /> },
      { id: 'search', label: 'Search', icon: <SearchIcon /> },
      { id: 'profile', label: 'Profile', icon: <UserIcon />, disabled: true },
      { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
    ],
    activeTab: 'home',
  },
}

export const Interactive: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal('home')

    return (
      <div class="bg-[var(--bg-page)] p-6 rounded-md">
        <Tabs
          tabs={[
            { id: 'home', label: 'Home', icon: <HomeIcon /> },
            { id: 'search', label: 'Search', icon: <SearchIcon /> },
            { id: 'profile', label: 'Profile', icon: <UserIcon /> },
            { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
          ]}
          activeTab={activeTab()}
          onTabChange={(tab) => setActiveTab(tab)}
        />
        <div class="mt-6 p-6 bg-[var(--bg-surface)] rounded-md">
          <p class="text-[var(--text-secondary)]">
            Active tab: <span class="text-[var(--text-primary)] font-semibold">{activeTab()}</span>
          </p>
        </div>
      </div>
    )
  },
}

export const ManyTabs: Story = {
  args: {
    tabs: [
      { id: 'tab1', label: 'Tab 1' },
      { id: 'tab2', label: 'Tab 2' },
      { id: 'tab3', label: 'Tab 3' },
      { id: 'tab4', label: 'Tab 4' },
      { id: 'tab5', label: 'Tab 5' },
      { id: 'tab6', label: 'Tab 6' },
      { id: 'tab7', label: 'Tab 7' },
    ],
    activeTab: 'tab1',
  },
}
