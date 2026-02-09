import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { ComposeBox, ComposeFab, ComposeDrawer, type PublishedSong } from './compose-box'

const meta: Meta = {
  title: 'Feed/ComposeBox',
  parameters: { layout: 'centered' },
}

export default meta

// ── Mock data ─────────────────────────────────────────────────────

const MOCK_SONGS: PublishedSong[] = [
  {
    ipId: '0x1234567890abcdef1234567890abcdef12345678',
    title: 'Midnight in Seoul',
    artist: 'YUNA',
    coverUrl: 'https://placewaifu.com/image/96',
  },
  {
    ipId: '0xabcdef1234567890abcdef1234567890abcdef12',
    title: 'Electric Dreams',
    artist: 'Neon Wave',
    coverUrl: 'https://placewaifu.com/image/97',
  },
  {
    ipId: '0x9876543210fedcba9876543210fedcba98765432',
    title: 'Starlight Serenade',
    artist: 'Luna Park',
    coverUrl: 'https://placewaifu.com/image/98',
  },
  {
    ipId: '0xfedcba9876543210fedcba9876543210fedcba98',
    title: 'Ocean Breeze',
    artist: 'Pacific Drift',
  },
  {
    ipId: '0x1111222233334444555566667777888899990000',
    title: 'Autumn Leaves',
    artist: 'Maple Keys',
    coverUrl: 'https://placewaifu.com/image/99',
  },
]

// ── Desktop stories ──────────────────────────────────────────────

export const Default: StoryObj = {
  render: () => (
    <div style={{ width: '600px', background: 'var(--bg-surface)' }}>
      <ComposeBox
        avatarUrl="https://placewaifu.com/image/200"
        onPost={(text, media, song) => alert(`Posted: ${text}\nMedia: ${media?.length ?? 0} files\nSong: ${song?.title ?? 'none'}`)}
      />
    </div>
  ),
}

export const WithPublishedSongs: StoryObj = {
  name: 'With Published Songs',
  render: () => (
    <div style={{ width: '600px', background: 'var(--bg-surface)' }}>
      <ComposeBox
        avatarUrl="https://placewaifu.com/image/200"
        publishedSongs={MOCK_SONGS}
        onPublishSong={() => alert('Navigate to /music/publish')}
        onPost={(text, media, song) => alert(`Posted: ${text}\nMedia: ${media?.length ?? 0}\nSong: ${song?.title ?? 'none'}`)}
      />
    </div>
  ),
}

export const NoSongsPublished: StoryObj = {
  name: 'No Songs Published (Empty Picker)',
  render: () => (
    <div style={{ width: '600px', background: 'var(--bg-surface)' }}>
      <ComposeBox
        avatarUrl="https://placewaifu.com/image/200"
        publishedSongs={[]}
        onPublishSong={() => alert('Navigate to /music/publish')}
        onPost={(text, media, song) => alert(`Posted: ${text}\nSong: ${song?.title ?? 'none'}`)}
      />
    </div>
  ),
}

export const WithoutAvatar: StoryObj = {
  render: () => (
    <div style={{ width: '600px', background: 'var(--bg-surface)' }}>
      <ComposeBox
        publishedSongs={MOCK_SONGS}
        onPublishSong={() => alert('Navigate to /music/publish')}
        onPost={(text, media, song) => alert(`Posted: ${text}\nMedia: ${media?.length ?? 0}\nSong: ${song?.title ?? 'none'}`)}
      />
    </div>
  ),
}

export const WithSongAttached: StoryObj = {
  name: 'With Song Attached (click music icon)',
  render: () => (
    <div style={{ width: '600px', background: 'var(--bg-surface)' }}>
      <ComposeBox
        avatarUrl="https://placewaifu.com/image/200"
        publishedSongs={MOCK_SONGS}
        onPublishSong={() => alert('Navigate to /music/publish')}
        onPost={(text, media, song) => alert(`Posted: ${text}\nSong: ${song?.title ?? 'none'}`)}
      />
    </div>
  ),
}

// ── Mobile stories ──────────────────────────────────────────────

export const Fab: StoryObj = {
  render: () => (
    <div style={{ width: '375px', height: '400px', background: 'var(--bg-page)', position: 'relative' }}>
      <div class="p-4 text-[var(--text-muted)]">
        FAB in the bottom-right corner
      </div>
      <ComposeFab onClick={() => alert('Compose clicked')} />
    </div>
  ),
}

export const MobileDrawer: StoryObj = {
  render: () => {
    const [open, setOpen] = createSignal(false)
    return (
      <div style={{ width: '375px', height: '600px', background: 'var(--bg-page)', position: 'relative' }}>
        <div class="p-4 text-[var(--text-muted)]">
          Tap the + button to open the compose drawer
        </div>
        <ComposeFab onClick={() => setOpen(true)} />
        <ComposeDrawer
          open={open()}
          onOpenChange={setOpen}
          avatarUrl="https://placewaifu.com/image/200"
          publishedSongs={MOCK_SONGS}
          onPublishSong={() => alert('Navigate to /music/publish')}
          onPost={(text, media, song) => { alert(`Posted: ${text}\nMedia: ${media?.length ?? 0}\nSong: ${song?.title ?? 'none'}`); setOpen(false) }}
        />
      </div>
    )
  },
}

export const MobileDrawerNoSongs: StoryObj = {
  name: 'Mobile Drawer (No Songs)',
  render: () => {
    const [open, setOpen] = createSignal(false)
    return (
      <div style={{ width: '375px', height: '600px', background: 'var(--bg-page)', position: 'relative' }}>
        <div class="p-4 text-[var(--text-muted)]">
          Tap the + button — music picker only shows "Publish new song"
        </div>
        <ComposeFab onClick={() => setOpen(true)} />
        <ComposeDrawer
          open={open()}
          onOpenChange={setOpen}
          avatarUrl="https://placewaifu.com/image/200"
          publishedSongs={[]}
          onPublishSong={() => alert('Navigate to /music/publish')}
          onPost={(text, media, song) => { alert(`Posted: ${text}\nSong: ${song?.title ?? 'none'}`); setOpen(false) }}
        />
      </div>
    )
  },
}
