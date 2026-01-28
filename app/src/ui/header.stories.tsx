import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Header, SearchInput } from './header'
import { Avatar } from './avatar'
import { Button } from './button'
import { IconButton } from './icon-button'

const meta: Meta<typeof Header> = {
  title: 'UI/Header',
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

const searchMeta: Meta<typeof SearchInput> = {
  title: 'UI/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
}

export const Search: StoryObj<typeof SearchInput> = {
  render: () => <SearchInput placeholder="Search for music, artists, playlists..." />,
}
