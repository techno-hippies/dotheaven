import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { WalletAddress } from './wallet-address'

const meta: Meta<typeof WalletAddress> = {
  title: 'Shared/WalletAddress',
  component: WalletAddress,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
    },
  },
  decorators: [
    (Story) => (
      <div class="min-h-screen bg-[var(--bg-page)] p-8">
        <div class="max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof WalletAddress>

export const Default: Story = {
  args: {
    address: '0x7a2F8b1234567890abcdef1234567890abcd8c4E',
  },
}

export const WithLabel: Story = {
  args: {
    address: '0x7a2F8b1234567890abcdef1234567890abcd8c4E',
    showLabel: true,
  },
}

export const Compact: Story = {
  args: {
    address: '0x7a2F8b1234567890abcdef1234567890abcd8c4E',
    variant: 'compact',
  },
}

export const CompactWithLabel: Story = {
  args: {
    address: '0x7a2F8b1234567890abcdef1234567890abcd8c4E',
    showLabel: true,
    variant: 'compact',
  },
}

export const ShortAddress: Story = {
  args: {
    address: '0x7a2F...8c4E',
    showLabel: true,
  },
}
