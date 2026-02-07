import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { ComposeBox, ComposeFab, ComposeDrawer } from './compose-box'

const meta: Meta = {
  title: 'Feed/ComposeBox',
  parameters: { layout: 'centered' },
}

export default meta

export const Default: StoryObj = {
  render: () => (
    <div style={{ width: '600px', background: 'var(--bg-surface)' }}>
      <ComposeBox
        avatarUrl="https://placewaifu.com/image/200"
        onPost={(text) => alert(`Posted: ${text}`)}
        onAddMedia={() => alert('Add media clicked')}
      />
    </div>
  ),
}

export const WithoutAvatar: StoryObj = {
  render: () => (
    <div style={{ width: '600px', background: 'var(--bg-surface)' }}>
      <ComposeBox
        onPost={(text) => alert(`Posted: ${text}`)}
      />
    </div>
  ),
}

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
          onPost={(text) => { alert(`Posted: ${text}`); setOpen(false) }}
          onAddMedia={() => alert('Add media')}
        />
      </div>
    )
  },
}
