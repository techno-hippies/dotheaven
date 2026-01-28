import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Header, SearchInput } from './Header'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'
import { IconButton } from '../primitives/icon-button'

const meta: Meta<typeof Header> = {
  title: 'Layout/Header',
  component: Header,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Header>

export const Default: Story = {
  args: {
    rightSlot: (
      <div class="flex items-center gap-3">
        <IconButton variant="ghost" size="md" aria-label="Notifications">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </IconButton>
        <Avatar size="sm" />
      </div>
    ),
  },
}

export const LoggedOut: Story = {
  args: {
    rightSlot: (
      <div class="flex items-center gap-2">
        <Button variant="secondary">
          Login
        </Button>
        <Button variant="default">
          Sign Up
        </Button>
      </div>
    ),
  },
}

export const SearchInputStory: StoryObj<typeof SearchInput> = {
  name: 'Search Input',
  render: () => <SearchInput placeholder="Search for music, artists, playlists..." />,
}
