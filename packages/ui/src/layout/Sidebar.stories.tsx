import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { Sidebar } from './Sidebar'
import { AlbumCover } from '../composite'
import { IconButton } from '../primitives'

// ── Icons (Phosphor regular, matching AppSidebar.tsx) ──────────────────

const HomeIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
  </svg>
)

const SearchIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
  </svg>
)

const ChatCircleIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)

const CalendarIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
  </svg>
)

const UserIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)

const GearIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.48l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187,173.11a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.48a73.93,73.93,0,0,1-8.68,0,8,8,0,0,0-5.48,1.74L100.45,215.8a91.57,91.57,0,0,1-15-6.23L82.89,187a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64L46.43,170.6a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.48,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.48L40.2,100.45a91.57,91.57,0,0,1,6.23-15L69,82.89a8,8,0,0,0,5.1-2.64,74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,82.89,69L85.4,46.43a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.48,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.48-1.74L155.55,40.2a91.57,91.57,0,0,1,15,6.23L173.11,69a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z" />
  </svg>
)

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
  </svg>
)

const FolderIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,200H40V88H216Z" />
  </svg>
)

const CloudIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M160,40A88.09,88.09,0,0,0,81.29,88.67,64,64,0,1,0,72,216h88a88,88,0,0,0,0-176Zm0,160H72a48,48,0,0,1,0-96c1.1,0,2.2,0,3.29.11A88,88,0,0,0,72,128a8,8,0,0,0,16,0,72,72,0,1,1,72,72Z" />
  </svg>
)

const ShareIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z" />
  </svg>
)

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
      <span class="text-base text-[var(--text-muted)]">{props.count}</span>
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
        <NavItem icon={SearchIcon} label="Search" />
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
          <MusicCollectionItem icon={CloudIcon} label="Cloud" count="56 songs" />
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

/** With Tauri local library visible */
export const WithLocalLibrary: Story = {
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
        <NavItem icon={SearchIcon} label="Search" />
        <NavItem icon={ChatCircleIcon} label="Messages" />
        <NavItem icon={CalendarIcon} label="Schedule" />
        <NavItem icon={UserIcon} label="Profile" active />
      </nav>

      <div class="mt-6 -mx-3 px-3 border-t border-[var(--border-subtle)] pt-4">
        <div class="flex items-center justify-between px-3 mb-2">
          <span class="text-base text-[var(--text-muted)] font-medium">Music</span>
          <IconButton variant="soft" size="md" aria-label="Create playlist">
            <PlusIcon />
          </IconButton>
        </div>

        <div class="flex flex-col gap-0.5">
          <MusicCollectionItem icon={FolderIcon} label="Local" count="1,234 songs" active />
          <MusicCollectionItem icon={CloudIcon} label="Cloud" count="56 songs" />
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
        <CompactNavItem icon={SearchIcon} label="Search" />
        <CompactNavItem icon={ChatCircleIcon} label="Messages" badge={3} />
        <CompactNavItem icon={CalendarIcon} label="Schedule" />
        <CompactNavItem icon={UserIcon} label="Profile" />
      </nav>

      {/* Divider */}
      <div class="w-8 border-t border-[var(--border-subtle)] my-3" />

      {/* Music section — icons and thumbnails */}
      <div class="flex flex-col gap-1.5 items-center w-full">
        <CompactMusicItem icon={CloudIcon} label="Cloud" />
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

/** Compact with Tauri local library */
export const CompactWithLocal: Story = {
  render: () => (
    <Sidebar compact>
      <div class="py-3 mb-1">
        <HeavenLogo size={32} />
      </div>

      <nav class="flex flex-col gap-1 items-center w-full">
        <CompactNavItem icon={HomeIcon} label="Home" />
        <CompactNavItem icon={SearchIcon} label="Search" />
        <CompactNavItem icon={ChatCircleIcon} label="Messages" active badge={3} />
        <CompactNavItem icon={CalendarIcon} label="Schedule" />
        <CompactNavItem icon={UserIcon} label="Profile" />
      </nav>

      <div class="w-8 border-t border-[var(--border-subtle)] my-3" />

      <div class="flex flex-col gap-1.5 items-center w-full">
        <CompactMusicItem icon={FolderIcon} label="Local" />
        <CompactMusicItem icon={CloudIcon} label="Cloud" />
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
          <CompactNavItem icon={SearchIcon} label="Search" />
          <CompactNavItem icon={ChatCircleIcon} label="Messages" active badge={3} />
          <CompactNavItem icon={CalendarIcon} label="Schedule" />
          <CompactNavItem icon={UserIcon} label="Profile" />
        </nav>
        <div class="w-8 border-t border-[var(--border-subtle)] my-3" />
        <div class="flex flex-col gap-1.5 items-center w-full">
          <CompactMusicItem icon={CloudIcon} label="Cloud" />
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
          <NavItem icon={SearchIcon} label="Search" />
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
            <MusicCollectionItem icon={CloudIcon} label="Cloud" count="56 songs" />
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
        <NavItem icon={SearchIcon} label="Search" />
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
          <MusicCollectionItem icon={CloudIcon} label="Cloud" count="0 songs" />
          <MusicCollectionItem icon={ShareIcon} label="Shared" count="0 songs" />
        </div>
      </div>
    </Sidebar>
  ),
}
