import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { Scrubber } from './scrubber'

const meta: Meta<typeof Scrubber> = {
  title: 'Composite/Scrubber',
  component: Scrubber,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Scrubber>

export const Default: Story = {
  render: () => {
    const [value, setValue] = createSignal(58)
    return (
      <div class="w-96 p-8">
        <Scrubber value={value()} onChange={setValue} />
        <div class="mt-4 text-[var(--text-secondary)]">Value: {value()}%</div>
      </div>
    )
  },
}

export const Volume: Story = {
  render: () => {
    const [value, setValue] = createSignal(75)
    return (
      <div class="w-96 p-8">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <Scrubber class="w-32" value={value()} onChange={setValue} />
        </div>
        <div class="mt-4 text-[var(--text-secondary)]">Volume: {value()}%</div>
      </div>
    )
  },
}

export const WithTimestamps: Story = {
  render: () => {
    const [value, setValue] = createSignal(34)
    const currentTime = () => {
      const seconds = Math.floor((value() / 100) * 243)
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return (
      <div class="w-96 p-8">
        <div class="flex items-center gap-2 w-full">
          <span class="text-base text-[var(--text-muted)] w-10 text-right">
            {currentTime()}
          </span>
          <Scrubber class="flex-1" value={value()} onChange={setValue} />
          <span class="text-base text-[var(--text-muted)] w-10">4:03</span>
        </div>
      </div>
    )
  },
}

export const Multiple: Story = {
  render: () => {
    const [progress, setProgress] = createSignal(42)
    const [volume1, setVolume1] = createSignal(80)
    const [volume2, setVolume2] = createSignal(60)
    return (
      <div class="w-96 p-8 space-y-6">
        <div>
          <div class="text-[var(--text-secondary)] mb-2">Music Progress</div>
          <Scrubber value={progress()} onChange={setProgress} />
        </div>
        <div>
          <div class="text-[var(--text-secondary)] mb-2">Volume 1</div>
          <Scrubber class="w-40" value={volume1()} onChange={setVolume1} />
        </div>
        <div>
          <div class="text-[var(--text-secondary)] mb-2">Volume 2</div>
          <Scrubber class="w-40" value={volume2()} onChange={setVolume2} />
        </div>
      </div>
    )
  },
}
