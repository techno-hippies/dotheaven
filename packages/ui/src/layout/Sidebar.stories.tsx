import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { Sidebar, SidebarSection } from './Sidebar'
import { ListItem, AlbumCover } from '../composite'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from '../composite/dialog'
import { Avatar, IconButton, Button } from '../primitives'

// Home icon (Phosphor-style)
const HomeIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
  </svg>
)

// Chat circle icon (Phosphor-style)
const ChatCircleIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)

// Music notes icon (Phosphor-style)
const MusicNotesIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const meta: Meta<typeof Sidebar> = {
  title: 'Layout/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div class="h-[600px] bg-[var(--bg-page)]">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof Sidebar>

export const Default: Story = {
  render: () => (
    <Sidebar>
      <button
        type="button"
        class="flex items-center gap-2 px-3 py-3 rounded-md cursor-pointer transition-colors bg-[var(--bg-highlight)]"
      >
        <span class="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)]">
          <HomeIcon />
        </span>
        <span class="text-sm font-semibold text-[var(--text-secondary)]">Home</span>
      </button>
      <SidebarSection
        title="Chat"
        icon={<ChatCircleIcon />}
        action={
          <div class="flex items-center gap-1">
            <IconButton variant="soft" size="md" aria-label="Add chat">
              <PlusIcon />
            </IconButton>
            <IconButton variant="soft" size="md" aria-label="Chat options">
              <ChevronDownIcon />
            </IconButton>
          </div>
        }
      >
        <ListItem
          title="vitalik.eth"
          subtitle="Hey, did you see the new proposal?"
          cover={<Avatar size="sm" />}
        />
        <ListItem
          title="nick.heaven"
          subtitle="The transaction went through"
          cover={<Avatar size="sm" />}
        />
        <ListItem
          title="alice.eth"
          subtitle="Check out this new track!"
          cover={<Avatar size="sm" />}
        />
      </SidebarSection>
      <SidebarSection
        title="Music"
        icon={<MusicNotesIcon />}
        action={
          <div class="flex items-center gap-1">
            <IconButton variant="soft" size="md" aria-label="Add playlist">
              <PlusIcon />
            </IconButton>
            <IconButton variant="soft" size="md" aria-label="Music options">
              <ChevronDownIcon />
            </IconButton>
          </div>
        }
      >
        <ListItem
          title="Liked Songs"
          subtitle="42 songs"
          cover={<AlbumCover size="sm" icon="heart" />}
        />
        <ListItem
          title="Free Weekly"
          subtitle="Playlist • technohippies"
          cover={<AlbumCover size="sm" icon="playlist" />}
        />
        <ListItem
          title="Discover Weekly"
          subtitle="Playlist • Heaven"
          cover={<AlbumCover size="sm" icon="playlist" />}
        />
      </SidebarSection>
    </Sidebar>
  ),
}

export const ChatOnly: Story = {
  render: () => (
    <Sidebar>
      <SidebarSection
        title="Chat"
        icon={<ChatCircleIcon />}
        action={
          <IconButton variant="soft" size="md" aria-label="Add chat">
            <PlusIcon />
          </IconButton>
        }
      >
        <ListItem
          title="vitalik.eth"
          subtitle="Hey, did you see the new proposal?"
          cover={<Avatar size="sm" />}
        />
        <ListItem
          title="nick.heaven"
          subtitle="The transaction went through"
          cover={<Avatar size="sm" />}
        />
      </SidebarSection>
    </Sidebar>
  ),
}

export const MusicOnly: Story = {
  render: () => (
    <Sidebar>
      <SidebarSection
        title="Music"
        icon={<MusicNotesIcon />}
        action={
          <IconButton variant="soft" size="md" aria-label="Add playlist">
            <PlusIcon />
          </IconButton>
        }
      >
        <ListItem
          title="Liked Songs"
          subtitle="42 songs"
          cover={<AlbumCover size="sm" icon="heart" />}
        />
        <ListItem
          title="Free Weekly"
          subtitle="Playlist • technohippies"
          cover={<AlbumCover size="sm" icon="playlist" />}
        />
        <ListItem
          title="Discover Weekly"
          subtitle="Playlist • Heaven"
          cover={<AlbumCover size="sm" icon="playlist" />}
        />
        <ListItem
          title="Chill Vibes"
          subtitle="Playlist • Heaven"
          cover={<AlbumCover size="sm" icon="playlist" />}
        />
      </SidebarSection>
    </Sidebar>
  ),
}

export const Empty: Story = {
  render: () => (
    <Sidebar>
      <SidebarSection
        title="Chat"
        icon={<ChatCircleIcon />}
        action={
          <IconButton variant="soft" size="md" aria-label="Add chat">
            <PlusIcon />
          </IconButton>
        }
      >
        <div class="px-3 py-8 text-center text-[var(--text-muted)] text-sm">
          No conversations yet
        </div>
      </SidebarSection>
    </Sidebar>
  ),
}

export const WithNewChatDialog: Story = {
  render: () => {
    const [address, setAddress] = createSignal('')

    return (
      <Dialog>
        <Sidebar>
          <SidebarSection
            title="Chat"
            icon={<ChatCircleIcon />}
            action={
              <div class="flex items-center gap-1">
                <DialogTrigger
                  as={(props: any) => (
                    <IconButton {...props} variant="soft" size="md" aria-label="Add chat">
                      <PlusIcon />
                    </IconButton>
                  )}
                />
                <IconButton variant="soft" size="md" aria-label="Chat options">
                  <ChevronDownIcon />
                </IconButton>
              </div>
            }
          >
            <ListItem
              title="vitalik.eth"
              subtitle="Hey, did you see the new proposal?"
              cover={<Avatar size="sm" />}
            />
            <ListItem
              title="nick.heaven"
              subtitle="The transaction went through"
              cover={<Avatar size="sm" />}
            />
          </SidebarSection>
        </Sidebar>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>
              Start a conversation with anyone on the network.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <input
              type="text"
              value={address()}
              onInput={(e) => setAddress(e.currentTarget.value)}
              placeholder="Message any ENS, .heaven, or 0x wallet address"
              class="w-full px-4 py-2.5 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
            />
          </DialogBody>
          <DialogFooter>
            <DialogCloseButton
              as={(props: any) => (
                <Button {...props} variant="secondary">Cancel</Button>
              )}
            />
            <Button disabled={!address().trim()}>Start Chat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  },
}
