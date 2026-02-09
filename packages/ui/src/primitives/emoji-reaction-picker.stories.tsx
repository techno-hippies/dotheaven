import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { EmojiReactionPicker } from './emoji-reaction-picker'

const meta: Meta = {
  title: 'Primitives/EmojiReactionPicker',
  parameters: { layout: 'centered' },
}

export default meta

export const Default: StoryObj = {
  name: 'Default',
  render: () => (
    <div style={{ 'padding-top': '80px' }}>
      <EmojiReactionPicker
        onReact={(e) => console.log('React:', e)}
      />
    </div>
  ),
}

export const CustomEmoji: StoryObj = {
  name: 'Custom Emoji Set',
  render: () => (
    <div style={{ 'padding-top': '80px' }}>
      <EmojiReactionPicker
        emoji={['🎵', '🎤', '🔥', '💜']}
        onReact={(e) => console.log('React:', e)}
      />
    </div>
  ),
}

export const InContext: StoryObj = {
  name: 'In Dark Surface',
  render: () => (
    <div style={{ padding: '6rem 2rem 2rem', background: 'var(--bg-surface)', 'border-radius': '12px' }}>
      <div class="flex flex-col items-center gap-4">
        <p class="text-base text-[var(--text-secondary)]">Tap the smiley to open picker</p>
        <EmojiReactionPicker
          onReact={(e) => console.log('React:', e)}
        />
      </div>
    </div>
  ),
}
