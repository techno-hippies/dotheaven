import type { Component } from 'solid-js'
import {
  Sidebar,
  SidebarSection,
  ListItem,
  Avatar,
  AlbumCover,
  IconButton,
} from '@heaven/ui'
import { useNavigate, useLocation } from '@solidjs/router'

const ChatCircleIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)

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

export const AppSidebar: Component = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
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
          onClick={() => navigate('/chat/vitalik')}
          active={isActive('/chat/vitalik')}
        />
        <ListItem
          title="nick.heaven"
          subtitle="The transaction went through"
          cover={<Avatar size="sm" />}
          onClick={() => navigate('/chat/nick')}
          active={isActive('/chat/nick')}
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
          onClick={() => navigate('/liked-songs')}
          active={isActive('/liked-songs')}
        />
        <ListItem
          title="Free Weekly"
          subtitle="Playlist • technohippies"
          cover={<AlbumCover size="sm" icon="playlist" />}
        />
      </SidebarSection>
    </Sidebar>
  )
}
