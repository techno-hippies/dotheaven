import type { Meta, StoryObj } from 'storybook-solidjs'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './dropdown-menu'
import { IconButton } from './icon-button'

const meta = {
  title: 'UI/DropdownMenu',
  component: DropdownMenu,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DropdownMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={IconButton<'button'>}
        variant="soft"
        aria-label="More options"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => console.log('Add to playlist')}>
          Add to playlist
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => console.log('Add to queue')}>
          Add to queue
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => console.log('Go to artist')}>
          Go to artist
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => console.log('Go to album')}>
          Go to album
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => console.log('Remove from playlist')}>
          Remove from playlist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={IconButton<'button'>}
        variant="soft"
        aria-label="More options"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => console.log('Add to playlist')}>
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
          </svg>
          Add to playlist
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => console.log('Add to queue')}>
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
          </svg>
          Add to queue
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => console.log('Go to artist')}>
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          Go to artist
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => console.log('Go to album')}>
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
          </svg>
          Go to album
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => console.log('Remove from playlist')}>
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
          Remove from playlist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithGroups: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={IconButton<'button'>}
        variant="soft"
        aria-label="More options"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuGroupLabel>Add to</DropdownMenuGroupLabel>
          <DropdownMenuItem onSelect={() => console.log('Add to playlist')}>
            Add to playlist
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => console.log('Add to queue')}>
            Add to queue
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuGroupLabel>Navigate</DropdownMenuGroupLabel>
          <DropdownMenuItem onSelect={() => console.log('Go to artist')}>
            Go to artist
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => console.log('Go to album')}>
            Go to album
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => console.log('Remove from playlist')}>
          Remove from playlist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithSubmenu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={IconButton<'button'>}
        variant="soft"
        aria-label="More options"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub overlap gutter={4} shift={-8}>
          <DropdownMenuSubTrigger>
            Add to playlist
            <div class="ml-auto">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </div>
          </DropdownMenuSubTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => console.log('Liked Songs')}>
              Liked Songs
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => console.log('My Playlist #1')}>
              My Playlist #1
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => console.log('Chill Vibes')}>
              Chill Vibes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => console.log('Create new playlist')}>
              Create new playlist
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => console.log('Add to queue')}>
          Add to queue
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => console.log('Go to artist')}>
          Go to artist
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => console.log('Go to album')}>
          Go to album
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => console.log('Remove from playlist')}>
          Remove from playlist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}
