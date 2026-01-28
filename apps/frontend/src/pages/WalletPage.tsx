import type { Component } from 'solid-js'
import {
  AppShell,
  Header,
  RightPanel,
  Avatar,
  IconButton,
  MusicPlayer,
  WalletAssets,
} from '@heaven/ui'
import { AppSidebar } from '../components/shell'
import { useAuth } from '../providers'
import { useNavigate } from '@solidjs/router'

const BellIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
  </svg>
)

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

const MegaETHIcon = () => (
  <svg viewBox="0 0 100 100" class="w-12 h-12">
    <circle cx="50" cy="50" r="50" fill="#000"/>
    <circle cx="50" cy="50" r="45" fill="transparent" stroke="#fff" stroke-width="3"/>
    <text x="50" y="65" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#fff" text-anchor="middle">M</text>
    <circle cx="40" cy="75" r="3" fill="#fff"/>
    <circle cx="60" cy="75" r="3" fill="#fff"/>
  </svg>
)

const USDmIcon = () => (
  <svg viewBox="0 0 32 32" class="w-12 h-12">
    <circle cx="16" cy="16" r="16" fill="#3B82F6"/>
    <text x="16" y="21" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#FFF" text-anchor="middle">$</text>
  </svg>
)

// Sample wallet data
const walletAssets = [
  {
    id: 'eth-ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    icon: <EthereumIcon />,
    chainBadge: <EthereumIcon />,
    balance: '10.5',
    balanceUSD: '$32,450.00',
    amount: '10.5 ETH',
  },
  {
    id: 'eth-megaeth',
    name: 'Ethereum',
    symbol: 'MegaETH',
    icon: <EthereumIcon />,
    chainBadge: <MegaETHIcon />,
    balance: '4.12',
    balanceUSD: '$12,340.20',
    amount: '4.12 ETH',
  },
  {
    id: 'usdm',
    name: 'USDm',
    symbol: 'MegaETH',
    icon: <USDmIcon />,
    chainBadge: <MegaETHIcon />,
    balance: '3042.36',
    balanceUSD: '$3,042.36',
    amount: '3,042.36 USDm',
  },
]

export const WalletPage: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()

  return (
    <AppShell
      header={
        <Header
          rightSlot={
            <div class="flex items-center gap-3">
              <IconButton variant="ghost" size="md" aria-label="Notifications">
                <BellIcon />
              </IconButton>
              <IconButton
                variant="ghost"
                size="md"
                aria-label="Wallet"
                class="text-[var(--accent-blue)]"
              >
                <WalletIcon />
              </IconButton>
              <button
                onClick={() => navigate('/profile')}
                class="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title={`Signed in as ${auth.pkpAddress()?.slice(0, 6)}...${auth.pkpAddress()?.slice(-4)}`}
              >
                <Avatar size="sm" class="cursor-pointer" />
              </button>
            </div>
          }
        />
      }
      sidebar={<AppSidebar />}
      rightPanel={
        <RightPanel>
          <div class="p-4">
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Now Playing</h3>
            <div class="aspect-square bg-[var(--bg-highlight)] rounded-lg mb-4" />
            <p class="text-lg font-semibold text-[var(--text-primary)]">Neon Dreams</p>
            <p class="text-base text-[var(--text-secondary)]">Synthwave Collective</p>
          </div>
        </RightPanel>
      }
      footer={
        <MusicPlayer
          title="Neon Dreams"
          artist="Synthwave Collective"
          currentTime="2:47"
          duration="4:39"
          progress={58}
          isPlaying
        />
      }
    >
      <div class="h-full overflow-y-auto">
        <WalletAssets
          address={auth.pkpAddress() || '0x0000000000000000000000000000000000000000'}
          totalBalance="$47,832.56"
          assets={walletAssets}
          onSend={() => console.log('Send clicked')}
          onReceive={() => console.log('Receive clicked')}
        />
      </div>
    </AppShell>
  )
}
