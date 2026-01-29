import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { SongUploadCard } from './song-upload-card'
import { Button } from '../primitives/button'

const meta = {
  title: 'Composite/SongUploadCard',
  component: SongUploadCard,
  tags: ['autodocs'],
} satisfies Meta<typeof SongUploadCard>

export default meta
type Story = StoryObj<typeof meta>

// Standalone button story to verify hover works
export const ButtonTest: Story = {
  render: () => (
    <div class="flex flex-col gap-4 p-8">
      <h3 class="text-[var(--text-primary)]">Button Hover Test</h3>
      <div class="flex gap-4">
        <Button>Default Button</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button size="lg">Large Primary</Button>
      </div>
      <p class="text-sm text-[var(--text-secondary)]">
        Hover over these buttons - cursor should change to pointer and background should lighten
      </p>
    </div>
  ),
}

export const Default: Story = {
  args: {
    value: {
      title: 'Test Song',
      artist: 'Test Artist',
      lyrics: 'Test lyrics line 1\nTest lyrics line 2',
      sourceLanguage: 'en',
      targetLanguages: ['zh'],
    },
    onSubmit: async (data) => {
      console.log('Submit:', data)
      // Simulate upload delay
      await new Promise((resolve) => setTimeout(resolve, 2000))
      alert('Song published!')
    },
  },
}

export const Loading: Story = {
  args: {
    loading: true,
    value: {
      title: 'My Song',
      artist: 'Artist Name',
      lyrics: 'Sample lyrics\nLine 2\nLine 3',
      sourceLanguage: 'en',
      targetLanguages: ['zh', 'ja'],
    },
    onSubmit: async () => {
      console.log('Publishing...')
    },
  },
}

export const PrefilledForm: Story = {
  args: {
    value: {
      title: 'Neon Dreams',
      artist: 'Synthwave Records',
      lyrics: '[Verse 1]\nNeon lights in the night\nCity glows so bright\n\n[Chorus]\nDreaming in colors\nLost in the glow',
      sourceLanguage: 'en',
      targetLanguages: ['zh', 'ja', 'ko'],
      commercialRevShare: 15,
      defaultMintingFee: '0',
    },
    onSubmit: async (data) => {
      console.log('Submit:', data)
      await new Promise((resolve) => setTimeout(resolve, 2000))
    },
  },
}

export const WithCustomLicense: Story = {
  args: {
    value: {
      commercialRevShare: 20,
      defaultMintingFee: '1000000000000000000', // 1 WIP
    },
    onSubmit: async (data) => {
      console.log('Submit:', data)
    },
  },
}
