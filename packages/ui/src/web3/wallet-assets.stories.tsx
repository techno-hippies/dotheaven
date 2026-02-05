import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { WalletAssets } from './wallet-assets'

const meta: Meta<typeof WalletAssets> = {
  title: 'Wallet/WalletAssets',
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

const MegaETHIcon = () => (
  <svg viewBox="0 0 100 100" class="w-12 h-12">
    <circle cx="50" cy="50" r="50" fill="#000"/>
    <circle cx="50" cy="50" r="45" fill="transparent" stroke="#fff" stroke-width="3"/>
    <text x="50" y="65" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#fff" text-anchor="middle">M</text>
    <circle cx="40" cy="75" r="3" fill="#fff"/>
    <circle cx="60" cy="75" r="3" fill="#fff"/>
  </svg>
)

const USDFCIcon = () => (
  <img src="/images/usdfc.png" alt="USDFC" class="w-12 h-12 object-contain" />
)

const USDMIcon = () => (
  <img src="/images/usdm.png" alt="USDM" class="w-12 h-12 object-contain" />
)

const FilecoinIcon = () => (
  <img src="/images/filecoin.png" alt="Filecoin" class="w-12 h-12 object-contain" />
)

/** Passkey user — no tabs, single wallet view */
export const PasskeyUser: Story = {
  args: {
    address: '0x80CBBBeD05396BfA69bC43Cb97655AB7EC18c0aA',
    totalBalance: '$6,253.56',
    assets: [
      {
        id: 'fil-mainnet',
        name: 'FIL',
        symbol: 'Filecoin',
        icon: <FilecoinIcon />,
        chainBadge: <FilecoinIcon />,
        balance: '142.8',
        balanceUSD: '$712.56',
        amount: '142.8 FIL',
      },
      {
        id: 'usdfc-filecoin',
        name: 'USDFC',
        symbol: 'Filecoin',
        icon: <USDFCIcon />,
        chainBadge: <FilecoinIcon />,
        balance: '5250.00',
        balanceUSD: '$5,250.00',
        amount: '5,250.00 USDFC',
      },
      {
        id: 'eth-sepolia',
        name: 'ETH',
        symbol: 'Ethereum',
        icon: <EthereumIcon />,
        chainBadge: <EthereumIcon />,
        balance: '0.5000',
        balanceUSD: '$1,545.00',
        amount: '0.5000 ETH',
      },
      {
        id: 'eth-megaeth',
        name: 'ETH',
        symbol: 'MegaETH',
        icon: <EthereumIcon />,
        chainBadge: <MegaETHIcon />,
        balance: '0.0940',
        balanceUSD: '$291.00',
        amount: '0.0940 ETH',
      },
      {
        id: 'usdm-megaeth',
        name: 'USDM',
        symbol: 'MegaETH',
        icon: <USDMIcon />,
        chainBadge: <MegaETHIcon />,
        balance: '1000.00',
        balanceUSD: '$1,000.00',
        amount: '1,000.00 USDM',
      },
    ],
    onSend: () => console.log('Send'),
    onReceive: () => console.log('Receive'),
  },
}

/** EOA user with ENS — tabs visible, Heaven tab default. Click "Wallet" to see EOA. */
export const EOAUserWithENS: Story = {
  args: {
    address: '0x80CBBBeD05396BfA69bC43Cb97655AB7EC18c0aA',
    totalBalance: '$2,261.27',
    assets: [
      {
        id: 'fil-mainnet',
        name: 'FIL',
        symbol: 'Filecoin',
        icon: <FilecoinIcon />,
        chainBadge: <FilecoinIcon />,
        balance: '142.8',
        balanceUSD: '$712.56',
        amount: '142.8 FIL',
      },
      {
        id: 'usdfc-filecoin',
        name: 'USDFC',
        symbol: 'Filecoin',
        icon: <USDFCIcon />,
        chainBadge: <FilecoinIcon />,
        balance: '500.00',
        balanceUSD: '$500.00',
        amount: '500.00 USDFC',
      },
      {
        id: 'eth-sepolia',
        name: 'ETH',
        symbol: 'Ethereum',
        icon: <EthereumIcon />,
        chainBadge: <EthereumIcon />,
        balance: '0.3200',
        balanceUSD: '$988.80',
        amount: '0.3200 ETH',
      },
      {
        id: 'eth-megaeth',
        name: 'ETH',
        symbol: 'MegaETH',
        icon: <EthereumIcon />,
        chainBadge: <MegaETHIcon />,
        balance: '0.0012',
        balanceUSD: '$3.71',
        amount: '0.0012 ETH',
      },
      {
        id: 'usdm-megaeth',
        name: 'USDM',
        symbol: 'MegaETH',
        icon: <USDMIcon />,
        chainBadge: <MegaETHIcon />,
        balance: '56.20',
        balanceUSD: '$56.20',
        amount: '56.20 USDM',
      },
    ],
    connectedWallet: {
      address: '0x25B4048c3B3c58973571db2dbbF87103f7406966',
      ensName: 'vitalik.eth',
      ensAvatar: 'https://euc.li/vitalik.eth',
      totalBalance: '$49,862.56',
      assets: [
        {
          id: 'fil-mainnet',
          name: 'FIL',
          symbol: 'Filecoin',
          icon: <FilecoinIcon />,
          chainBadge: <FilecoinIcon />,
          balance: '25.0000',
          balanceUSD: '$125.00',
          amount: '25.0000 FIL',
        },
        {
          id: 'usdfc-filecoin',
          name: 'USDFC',
          symbol: 'Filecoin',
          icon: <USDFCIcon />,
          chainBadge: <FilecoinIcon />,
          balance: '1200.00',
          balanceUSD: '$1,200.00',
          amount: '1,200.00 USDFC',
        },
        {
          id: 'eth-sepolia',
          name: 'ETH',
          symbol: 'Ethereum',
          icon: <EthereumIcon />,
          chainBadge: <EthereumIcon />,
          balance: '15.6129',
          balanceUSD: '$48,244.00',
          amount: '15.6129 ETH',
        },
        {
          id: 'eth-megaeth',
          name: 'ETH',
          symbol: 'MegaETH',
          icon: <EthereumIcon />,
          chainBadge: <MegaETHIcon />,
          balance: '0.0250',
          balanceUSD: '$77.25',
          amount: '0.0250 ETH',
        },
        {
          id: 'usdm-megaeth',
          name: 'USDM',
          symbol: 'MegaETH',
          icon: <USDMIcon />,
          chainBadge: <MegaETHIcon />,
          balance: '216.31',
          balanceUSD: '$216.31',
          amount: '216.31 USDM',
        },
      ],
    },
    onSend: () => console.log('Send'),
    onReceive: () => console.log('Receive'),
  },
}

/** EOA user without ENS */
export const EOAUserNoENS: Story = {
  args: {
    address: '0x80CBBBeD05396BfA69bC43Cb97655AB7EC18c0aA',
    totalBalance: '$1,548.71',
    assets: [
      {
        id: 'fil-mainnet',
        name: 'FIL',
        symbol: 'Filecoin',
        icon: <FilecoinIcon />,
        chainBadge: <FilecoinIcon />,
        balance: '0.0000',
        balanceUSD: '$0.00',
        amount: '0.0000 FIL',
      },
      {
        id: 'usdfc-filecoin',
        name: 'USDFC',
        symbol: 'Filecoin',
        icon: <USDFCIcon />,
        chainBadge: <FilecoinIcon />,
        balance: '0.00',
        balanceUSD: '$0.00',
        amount: '0.00 USDFC',
      },
      {
        id: 'eth-sepolia',
        name: 'ETH',
        symbol: 'Ethereum',
        icon: <EthereumIcon />,
        chainBadge: <EthereumIcon />,
        balance: '0.5000',
        balanceUSD: '$1,545.00',
        amount: '0.5000 ETH',
      },
      {
        id: 'eth-megaeth',
        name: 'ETH',
        symbol: 'MegaETH',
        icon: <EthereumIcon />,
        chainBadge: <MegaETHIcon />,
        balance: '0.0012',
        balanceUSD: '$3.71',
        amount: '0.0012 ETH',
      },
      {
        id: 'usdm-megaeth',
        name: 'USDM',
        symbol: 'MegaETH',
        icon: <USDMIcon />,
        chainBadge: <MegaETHIcon />,
        balance: '0.00',
        balanceUSD: '$0.00',
        amount: '0.00 USDM',
      },
    ],
    connectedWallet: {
      address: '0x25B4048c3B3c58973571db2dbbF87103f7406966',
      totalBalance: '$32,953.71',
      assets: [
        {
          id: 'fil-mainnet',
          name: 'FIL',
          symbol: 'Filecoin',
          icon: <FilecoinIcon />,
          chainBadge: <FilecoinIcon />,
          balance: '0.0000',
          balanceUSD: '$0.00',
          amount: '0.0000 FIL',
        },
        {
          id: 'usdfc-filecoin',
          name: 'USDFC',
          symbol: 'Filecoin',
          icon: <USDFCIcon />,
          chainBadge: <FilecoinIcon />,
          balance: '500.00',
          balanceUSD: '$500.00',
          amount: '500.00 USDFC',
        },
        {
          id: 'eth-sepolia',
          name: 'ETH',
          symbol: 'Ethereum',
          icon: <EthereumIcon />,
          chainBadge: <EthereumIcon />,
          balance: '10.5000',
          balanceUSD: '$32,450.00',
          amount: '10.5000 ETH',
        },
        {
          id: 'eth-megaeth',
          name: 'ETH',
          symbol: 'MegaETH',
          icon: <EthereumIcon />,
          chainBadge: <MegaETHIcon />,
          balance: '0.0012',
          balanceUSD: '$3.71',
          amount: '0.0012 ETH',
        },
        {
          id: 'usdm-megaeth',
          name: 'USDM',
          symbol: 'MegaETH',
          icon: <USDMIcon />,
          chainBadge: <MegaETHIcon />,
          balance: '0.00',
          balanceUSD: '$0.00',
          amount: '0.00 USDM',
        },
      ],
    },
    onSend: () => console.log('Send'),
    onReceive: () => console.log('Receive'),
  },
}

/** Empty wallet */
export const EmptyWallet: Story = {
  args: {
    address: '0x7a2F8b1234567890abcdef1234567890abcd8c4E',
    totalBalance: '$0.00',
    assets: [],
    onSend: () => console.log('Send'),
    onReceive: () => console.log('Receive'),
  },
}
