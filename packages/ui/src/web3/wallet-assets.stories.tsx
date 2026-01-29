import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { WalletAssets } from './wallet-assets'

const meta: Meta<typeof WalletAssets> = {
  title: 'Web3/WalletAssets',
  component: WalletAssets,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
    },
  },
  decorators: [
    (Story) => (
      <div class="min-h-screen bg-[var(--bg-page)] p-8">
        <div class="max-w-2xl mx-auto">
          <Story />
        </div>
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof WalletAssets>

// Ethereum logo SVG
const EthereumIcon = () => (
  <svg viewBox="0 0 32 32" class="w-12 h-12">
    <g fill="none" fill-rule="evenodd">
      <circle cx="16" cy="16" r="16" fill="#627EEA"/>
      <g fill="#FFF" fill-rule="nonzero">
        <path fill-opacity=".602" d="M16.498 4v8.87l7.497 3.35z"/>
        <path d="M16.498 4L9 16.22l7.498-3.35z"/>
        <path fill-opacity=".602" d="M16.498 21.968v6.027L24 17.616z"/>
        <path d="M16.498 27.995v-6.028L9 17.616z"/>
        <path fill-opacity=".2" d="M16.498 20.573l7.497-4.353-7.497-3.348z"/>
        <path fill-opacity=".602" d="M9 16.22l7.498 4.353v-7.701z"/>
      </g>
    </g>
  </svg>
)

// MegaETH logo - using the provided icon path
// For the story, we'll use a placeholder. In production, import from the actual path
const MegaETHIcon = () => (
  <svg viewBox="0 0 100 100" class="w-12 h-12">
    <circle cx="50" cy="50" r="50" fill="#000"/>
    <circle cx="50" cy="50" r="45" fill="transparent" stroke="#fff" stroke-width="3"/>
    <text x="50" y="65" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#fff" text-anchor="middle">M</text>
    <circle cx="40" cy="75" r="3" fill="#fff"/>
    <circle cx="60" cy="75" r="3" fill="#fff"/>
  </svg>
)

// USDFC icon - using actual image from public/images
const USDFCIcon = () => (
  <img src="/images/usdfc.png" alt="USDFC" class="w-12 h-12 object-contain" />
)

// Filecoin icon - using actual image from public/images
const FilecoinIcon = () => (
  <img src="/images/filecoin.png" alt="Filecoin" class="w-12 h-12 object-contain" />
)

export const Default: Story = {
  args: {
    address: '0x7a2F8b1234567890abcdef1234567890abcd8c4E',
    totalBalance: '$53,795.12',
    assets: [
      {
        id: 'eth-ethereum',
        name: 'Ethereum',
        symbol: 'Ethereum',
        icon: <EthereumIcon />,
        chainBadge: <EthereumIcon />, // Ethereum chain badge
        balance: '10.5',
        balanceUSD: '$32,450.00',
        amount: '10.5 ETH',
      },
      {
        id: 'eth-megaeth',
        name: 'Ethereum',
        symbol: 'MegaETH',
        icon: <EthereumIcon />, // ETH coin as main icon
        chainBadge: <MegaETHIcon />, // MegaETH chain as badge
        balance: '4.12',
        balanceUSD: '$12,340.20',
        amount: '4.12 ETH',
      },
      {
        id: 'usdfc',
        name: 'USDFC',
        symbol: 'Filecoin',
        icon: <USDFCIcon />,
        chainBadge: <FilecoinIcon />, // Filecoin chain badge
        balance: '5250.00',
        balanceUSD: '$5,250.00',
        amount: '5,250.00 USDFC',
      },
      {
        id: 'fil',
        name: 'Filecoin',
        symbol: 'Filecoin',
        icon: <FilecoinIcon />,
        chainBadge: <FilecoinIcon />, // Filecoin chain badge
        balance: '142.8',
        balanceUSD: '$712.56',
        amount: '142.8 FIL',
      },
    ],
    onSend: () => console.log('Send clicked'),
    onReceive: () => console.log('Receive clicked'),
  },
}

export const SingleAsset: Story = {
  args: {
    address: '0x7a2F8b1234567890abcdef1234567890abcd8c4E',
    totalBalance: '$32,450.00',
    assets: [
      {
        id: 'eth-ethereum',
        name: 'Ethereum',
        symbol: 'ETH',
        icon: <EthereumIcon />,
        balance: '10.5',
        balanceUSD: '$32,450.00',
        amount: '10.5 ETH',
      },
    ],
    onSend: () => console.log('Send clicked'),
    onReceive: () => console.log('Receive clicked'),
  },
}

export const EmptyWallet: Story = {
  args: {
    address: '0x7a2F8b1234567890abcdef1234567890abcd8c4E',
    totalBalance: '$0.00',
    assets: [],
    onSend: () => console.log('Send clicked'),
    onReceive: () => console.log('Receive clicked'),
  },
}
