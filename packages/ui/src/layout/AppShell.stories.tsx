import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { AppShell } from './AppShell'
import { Sidebar, SidebarSection } from './Sidebar'
import { RightPanel } from './RightPanel'
import { Header } from './Header'
import { ListItem } from '../composite/list-item'
import { MusicPlayer } from '../composite/music-player'
import { AlbumCover } from '../composite/album-cover'
import { Avatar } from '../primitives/avatar'
import { IconButton } from '../primitives/icon-button'

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

const meta: Meta<typeof AppShell> = {
  title: 'Layout/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof AppShell>

export const Default: Story = {
  render: () => (
    <AppShell
      header={
        <Header
          rightSlot={
            <div class="flex items-center gap-3">
              <IconButton variant="ghost" size="md" aria-label="Notifications">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </IconButton>
              <Avatar size="sm" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" class="cursor-pointer" />
            </div>
          }
        />
      }
      sidebar={
        <Sidebar>
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
              subtitle="0 songs"
              cover={<AlbumCover size="sm" icon="heart" />}
            />
            <ListItem
              title="Free Weekly"
              subtitle="Playlist • technohippies"
              cover={<AlbumCover size="sm" icon="playlist" />}
            />
          </SidebarSection>
        </Sidebar>
      }
      rightPanel={
        <RightPanel>
          <div class="p-4">
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Now Playing</h3>
            <div class="aspect-square bg-[var(--bg-highlight)] rounded-lg mb-4" />
            <p class="text-lg font-semibold text-[var(--text-primary)]">Neon Dreams</p>
            <p class="text-base text-[var(--text-secondary)]">Synthwave Collective</p>
          </div>
        </RightPanel>
      }
      footer={
        <MusicPlayer
          title="Neon Dreams"
          artist="Synthwave Collective"
          currentTime="2:47"
          duration="4:39"
          progress={58}
          isPlaying
        />
      }
    >
      <div class="h-full bg-black rounded-t-xl rounded-b-xl flex items-center justify-center">
        <p class="text-[var(--text-muted)]">Main Content Area</p>
      </div>
    </AppShell>
  ),
}
