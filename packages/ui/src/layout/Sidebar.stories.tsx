import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal, Show } from 'solid-js'
import { Sidebar } from './Sidebar'
import { AlbumCover } from '../composite'
import { IconButton } from '../primitives'
import {
  Home, UsersThree, ChatCircle, CalendarBlank, User,
  Gear, Plus, ShareNetwork, Compass, List,
} from '../icons'

// ── Icon aliases (matching original names used in this file) ─────

const HomeIcon = () => <Home />
const CommunityIcon = () => <UsersThree />
const ChatCircleIcon = () => <ChatCircle />
const CalendarIcon = () => <CalendarBlank />
const UserIcon = () => <User />
const GearIcon = () => <Gear class="w-5 h-5" />
const PlusIcon = () => <Plus class="w-5 h-5" />
const ShareIcon = () => <ShareNetwork class="w-5 h-5" />
const CompassIcon = () => <Compass class="w-5 h-5" />
const ListIcon = () => <List class="w-5 h-5" />

// Heaven logo from public/images
const HeavenLogo = (props: { size?: number }) => (
  <img
    src="/images/heaven.png"
    alt="Heaven"
    class="object-contain"
    style={{ width: `${props.size || 32}px`, height: `${props.size || 32}px` }}
  />
)

// ── Reusable sub-components (matching AppSidebar patterns) ─────────────

/** NavItem — matches AppSidebar NavItem exactly */
const NavItem = (props: { icon: () => any; label: string; active?: boolean; badge?: number; onClick?: () => void }) => (
  <button
    type="button"
    class={`flex items-center gap-3 w-full px-3 py-3 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${props.active ? 'bg-[var(--bg-highlight)]' : ''}`}
    onClick={props.onClick}
  >
    <span class="relative w-6 h-6 flex items-center justify-center text-[var(--text-secondary)]">
      <props.icon />
      {props.badge && props.badge > 0 && (
        <span class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1">
          {props.badge > 99 ? '99+' : props.badge}
        </span>
      )}
    </span>
    <span class="text-base font-semibold text-[var(--text-secondary)]">{props.label}</span>
  </button>
)

/** Music collection item — matches AppSidebar's Local/Cloud/Shared buttons */
const MusicCollectionItem = (props: { icon: () => any; label: string; count: string; active?: boolean }) => (
  <button
    type="button"
    class={`flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${props.active ? 'bg-[var(--bg-highlight)]' : ''}`}
  >
    <div class="w-10 h-10 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
      <props.icon />
    </div>
    <div class="flex flex-col min-w-0 text-left">
      <span class="text-base text-[var(--text-primary)]">{props.label}</span>
      <Show when={props.count}>
        <span class="text-base text-[var(--text-muted)]">{props.count}</span>
      </Show>
    </div>
  </button>
)

/** Playlist item — matches AppSidebar's PlaylistDropTarget */
const PlaylistItem = (props: { name: string; count: number; coverSrc?: string; active?: boolean }) => (
  <button
    type="button"
    class={`flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${props.active ? 'bg-[var(--bg-highlight)]' : ''}`}
  >
    <AlbumCover
      size="sm"
      src={props.coverSrc}
      icon="playlist"
    />
    <div class="flex flex-col min-w-0 text-left">
      <span class="text-base text-[var(--text-primary)] truncate">{props.name}</span>
      <span class="text-base text-[var(--text-muted)]">{props.count} songs</span>
    </div>
  </button>
)

/** Compact nav icon button with tooltip */
const CompactNavItem = (props: { icon: () => any; label: string; active?: boolean; badge?: number; onClick?: () => void }) => (
  <button
    type="button"
    class={`relative w-11 h-11 flex items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] ${props.active ? 'bg-[var(--bg-highlight)]' : ''}`}
    onClick={props.onClick}
    title={props.label}
  >
    <span class="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)]">
      <props.icon />
    </span>
    {props.badge && props.badge > 0 && (
      <span class="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1">
        {props.badge > 99 ? '99+' : props.badge}
      </span>
    )}
  </button>
)

/** Compact music collection — icon-only square */
const CompactMusicItem = (props: { icon: () => any; label: string; active?: boolean }) => (
  <button
    type="button"
    class={`w-11 h-11 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors ${props.active ? 'ring-1 ring-[var(--accent-blue)]' : ''}`}
    title={props.label}
  >
    <props.icon />
  </button>
)

/** Compact playlist — cover thumbnail or playlist icon */
const CompactPlaylistItem = (props: { name: string; coverSrc?: string; active?: boolean }) => (
  <button
    type="button"
    class={`w-11 h-11 rounded-md overflow-hidden cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0 ${props.active ? 'ring-1 ring-[var(--accent-blue)]' : ''}`}
    title={props.name}
  >
    {props.coverSrc ? (
      <img src={props.coverSrc} alt={props.name} class="w-full h-full object-cover" />
    ) : (
      <div class="w-full h-full bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
          <path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm104,56H40a8,8,0,0,0,0,16h96a8,8,0,0,0,0-16Zm0,64H40a8,8,0,0,0,0,16h96a8,8,0,0,0,0-16Zm112-24a8,8,0,0,1-3.76,6.78l-64,40A8,8,0,0,1,168,200V120a8,8,0,0,1,12.24-6.78l64,40A8,8,0,0,1,248,160Zm-23.09,0L184,134.43v51.14Z" />
        </svg>
      </div>
    )}
  </button>
)

// ── Stories ─────────────────────────────────────────────────────────────

const meta: Meta<typeof Sidebar> = {
  title: 'Layout/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div class="h-[700px] bg-[var(--bg-page)]">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof Sidebar>

/**
 * Default sidebar — matches the real AppSidebar exactly:
 * Logo + Settings, Nav items, Music section (Cloud, Shared, playlists)
 */
export const Default: Story = {
  render: () => (
    <Sidebar>
      {/* Logo + Settings */}
      <div class="px-3 py-4 mb-2 flex items-center justify-between">
        <HeavenLogo size={36} />
        <IconButton variant="ghost" size="md" aria-label="Settings">
          <GearIcon />
        </IconButton>
      </div>

      {/* Main navigation */}
      <nav class="flex flex-col gap-1">
        <NavItem icon={HomeIcon} label="Home" active />
        <NavItem icon={CommunityIcon} label="Community" />
        <NavItem icon={ChatCircleIcon} label="Messages" badge={3} />
        <NavItem icon={CalendarIcon} label="Schedule" />
        <NavItem icon={UserIcon} label="Profile" />
      </nav>

      {/* Music section */}
      <div class="mt-6 -mx-3 px-3 border-t border-[var(--border-subtle)] pt-4">
        <div class="flex items-center justify-between px-3 mb-2">
          <span class="text-base text-[var(--text-muted)] font-medium">Music</span>
          <IconButton variant="soft" size="md" aria-label="Create playlist">
            <PlusIcon />
          </IconButton>
        </div>

        <div class="flex flex-col gap-0.5">
          <MusicCollectionItem icon={CompassIcon} label="Discover" count="" />
          <MusicCollectionItem icon={ListIcon} label="Library" count="" />
          <MusicCollectionItem icon={ShareIcon} label="Shared" count="12 songs" />

          {/* User playlists */}
          <PlaylistItem name="Chill Vibes" count={8} coverSrc="https://picsum.photos/seed/pl1/96/96" />
          <PlaylistItem name="Workout Mix" count={24} coverSrc="https://picsum.photos/seed/pl2/96/96" />
          <PlaylistItem name="New Playlist" count={0} />
        </div>
      </div>
    </Sidebar>
  ),
}

/** Library active state */
export const LibraryActive: Story = {
  render: () => (
    <Sidebar>
      <div class="px-3 py-4 mb-2 flex items-center justify-between">
        <HeavenLogo size={36} />
        <IconButton variant="ghost" size="md" aria-label="Settings">
          <GearIcon />
        </IconButton>
      </div>

      <nav class="flex flex-col gap-1">
        <NavItem icon={HomeIcon} label="Home" />
        <NavItem icon={CommunityIcon} label="Community" />
        <NavItem icon={ChatCircleIcon} label="Messages" />
        <NavItem icon={CalendarIcon} label="Schedule" />
        <NavItem icon={UserIcon} label="Profile" />
      </nav>

      <div class="mt-6 -mx-3 px-3 border-t border-[var(--border-subtle)] pt-4">
        <div class="flex items-center justify-between px-3 mb-2">
          <span class="text-base text-[var(--text-muted)] font-medium">Music</span>
          <IconButton variant="soft" size="md" aria-label="Create playlist">
            <PlusIcon />
          </IconButton>
        </div>

        <div class="flex flex-col gap-0.5">
          <MusicCollectionItem icon={CompassIcon} label="Discover" count="" />
          <MusicCollectionItem icon={ListIcon} label="Library" count="" active />
          <MusicCollectionItem icon={ShareIcon} label="Shared" count="12 songs" />

          <PlaylistItem name="Chill Vibes" count={8} coverSrc="https://picsum.photos/seed/pl1/96/96" />
          <PlaylistItem name="Workout Mix" count={24} coverSrc="https://picsum.photos/seed/pl2/96/96" />
        </div>
      </div>
    </Sidebar>
  ),
}

/**
 * Compact sidebar — icon-only mode for when messages panel needs more room.
 * Same items as Default, just collapsed to icons/thumbnails.
 */
export const Compact: Story = {
  render: () => (
    <Sidebar compact>
      {/* Logo */}
      <div class="py-3 mb-1">
        <HeavenLogo size={32} />
      </div>

      {/* Main navigation — icon only */}
      <nav class="flex flex-col gap-1 items-center w-full">
        <CompactNavItem icon={HomeIcon} label="Home" active />
        <CompactNavItem icon={CommunityIcon} label="Community" />
        <CompactNavItem icon={ChatCircleIcon} label="Messages" badge={3} />
        <CompactNavItem icon={CalendarIcon} label="Schedule" />
        <CompactNavItem icon={UserIcon} label="Profile" />
      </nav>

      {/* Divider */}
      <div class="w-8 border-t border-[var(--border-subtle)] my-3" />

      {/* Music section — icons and thumbnails */}
      <div class="flex flex-col gap-1.5 items-center w-full">
        <CompactMusicItem icon={CompassIcon} label="Discover" />
        <CompactMusicItem icon={ListIcon} label="Library" />
        <CompactMusicItem icon={ShareIcon} label="Shared" />

        {/* Playlists */}
        <CompactPlaylistItem name="Chill Vibes" coverSrc="https://picsum.photos/seed/pl1/96/96" />
        <CompactPlaylistItem name="Workout Mix" coverSrc="https://picsum.photos/seed/pl2/96/96" />
        <CompactPlaylistItem name="New Playlist" />
      </div>

      {/* Settings at bottom — ghost style, matching full sidebar */}
      <div class="mt-auto pt-3">
        <IconButton variant="ghost" size="md" aria-label="Settings">
          <GearIcon />
        </IconButton>
      </div>
    </Sidebar>
  ),
}

/** Compact — Library active */
export const CompactLibraryActive: Story = {
  render: () => (
    <Sidebar compact>
      <div class="py-3 mb-1">
        <HeavenLogo size={32} />
      </div>

      <nav class="flex flex-col gap-1 items-center w-full">
        <CompactNavItem icon={HomeIcon} label="Home" />
        <CompactNavItem icon={CommunityIcon} label="Community" />
        <CompactNavItem icon={ChatCircleIcon} label="Messages" active badge={3} />
        <CompactNavItem icon={CalendarIcon} label="Schedule" />
        <CompactNavItem icon={UserIcon} label="Profile" />
      </nav>

      <div class="w-8 border-t border-[var(--border-subtle)] my-3" />

      <div class="flex flex-col gap-1.5 items-center w-full">
        <CompactMusicItem icon={CompassIcon} label="Discover" />
        <CompactMusicItem icon={ListIcon} label="Library" active />
        <CompactMusicItem icon={ShareIcon} label="Shared" />

        <CompactPlaylistItem name="Chill Vibes" coverSrc="https://picsum.photos/seed/pl1/96/96" />
        <CompactPlaylistItem name="Workout Mix" coverSrc="https://picsum.photos/seed/pl2/96/96" />
      </div>

      <div class="mt-auto pt-3">
        <IconButton variant="ghost" size="md" aria-label="Settings">
          <GearIcon />
        </IconButton>
      </div>
    </Sidebar>
  ),
}

/** Side-by-side comparison of default vs compact */
export const CompactComparison: Story = {
  decorators: [
    (Story) => (
      <div class="h-[700px] bg-[var(--bg-page)] flex">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <>
      {/* Compact */}
      <Sidebar compact>
        <div class="py-3 mb-1">
          <HeavenLogo size={32} />
        </div>
        <nav class="flex flex-col gap-1 items-center w-full">
          <CompactNavItem icon={HomeIcon} label="Home" />
          <CompactNavItem icon={CommunityIcon} label="Community" />
          <CompactNavItem icon={ChatCircleIcon} label="Messages" active badge={3} />
          <CompactNavItem icon={CalendarIcon} label="Schedule" />
          <CompactNavItem icon={UserIcon} label="Profile" />
        </nav>
        <div class="w-8 border-t border-[var(--border-subtle)] my-3" />
        <div class="flex flex-col gap-1.5 items-center w-full">
          <CompactMusicItem icon={CompassIcon} label="Discover" />
          <CompactMusicItem icon={ListIcon} label="Library" />
          <CompactMusicItem icon={ShareIcon} label="Shared" />
          <CompactPlaylistItem name="Chill Vibes" coverSrc="https://picsum.photos/seed/pl1/96/96" />
          <CompactPlaylistItem name="Workout Mix" coverSrc="https://picsum.photos/seed/pl2/96/96" />
          <CompactPlaylistItem name="New Playlist" />
        </div>
        <div class="mt-auto pt-3">
          <IconButton variant="ghost" size="md" aria-label="Settings">
            <GearIcon />
          </IconButton>
        </div>
      </Sidebar>

      {/* Full */}
      <Sidebar>
        <div class="px-3 py-4 mb-2 flex items-center justify-between">
          <HeavenLogo size={36} />
          <IconButton variant="ghost" size="md" aria-label="Settings">
            <GearIcon />
          </IconButton>
        </div>
        <nav class="flex flex-col gap-1">
          <NavItem icon={HomeIcon} label="Home" />
          <NavItem icon={CommunityIcon} label="Community" />
          <NavItem icon={ChatCircleIcon} label="Messages" active badge={3} />
          <NavItem icon={CalendarIcon} label="Schedule" />
          <NavItem icon={UserIcon} label="Profile" />
        </nav>
        <div class="mt-6 -mx-3 px-3 border-t border-[var(--border-subtle)] pt-4">
          <div class="flex items-center justify-between px-3 mb-2">
            <span class="text-base text-[var(--text-muted)] font-medium">Music</span>
            <IconButton variant="soft" size="md" aria-label="Create playlist"><PlusIcon /></IconButton>
          </div>
          <div class="flex flex-col gap-0.5">
            <MusicCollectionItem icon={CompassIcon} label="Discover" count="" />
            <MusicCollectionItem icon={ListIcon} label="Library" count="" />
            <MusicCollectionItem icon={ShareIcon} label="Shared" count="12 songs" />
            <PlaylistItem name="Chill Vibes" count={8} coverSrc="https://picsum.photos/seed/pl1/96/96" />
            <PlaylistItem name="Workout Mix" count={24} coverSrc="https://picsum.photos/seed/pl2/96/96" />
            <PlaylistItem name="New Playlist" count={0} />
          </div>
        </div>
      </Sidebar>
    </>
  ),
}

/** Empty state — no playlists yet */
export const Empty: Story = {
  render: () => (
    <Sidebar>
      <div class="px-3 py-4 mb-2 flex items-center justify-between">
        <HeavenLogo size={36} />
        <IconButton variant="ghost" size="md" aria-label="Settings">
          <GearIcon />
        </IconButton>
      </div>

      <nav class="flex flex-col gap-1">
        <NavItem icon={HomeIcon} label="Home" active />
        <NavItem icon={CommunityIcon} label="Community" />
        <NavItem icon={ChatCircleIcon} label="Messages" />
        <NavItem icon={CalendarIcon} label="Schedule" />
        <NavItem icon={UserIcon} label="Profile" />
      </nav>

      <div class="mt-6 -mx-3 px-3 border-t border-[var(--border-subtle)] pt-4">
        <div class="flex items-center justify-between px-3 mb-2">
          <span class="text-base text-[var(--text-muted)] font-medium">Music</span>
          <IconButton variant="soft" size="md" aria-label="Create playlist">
            <PlusIcon />
          </IconButton>
        </div>

        <div class="flex flex-col gap-0.5">
          <MusicCollectionItem icon={CompassIcon} label="Discover" count="" />
          <MusicCollectionItem icon={ListIcon} label="Library" count="" />
          <MusicCollectionItem icon={ShareIcon} label="Shared" count="0 songs" />
        </div>
      </div>
    </Sidebar>
  ),
}
