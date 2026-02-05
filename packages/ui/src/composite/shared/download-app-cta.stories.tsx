import type { Meta, StoryObj } from 'storybook-solidjs'
import { DownloadAppCta } from './download-app-cta'

const meta: Meta<typeof DownloadAppCta> = {
  title: 'Shared/DownloadAppCta',
  component: DownloadAppCta,
  decorators: [
    (Story) => (
      <div class="min-h-[480px] flex items-center justify-center bg-[var(--bg-page)] p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

export const AutoDetected: Story = {}

export const Windows: Story = {
  args: { platform: 'windows' },
}

export const MacOS: Story = {
  args: { platform: 'macos' },
}

export const Linux: Story = {
  args: { platform: 'linux' },
}

export const IOS: Story = {
  args: { platform: 'ios' },
}

export const Android: Story = {
  args: { platform: 'android' },
}
