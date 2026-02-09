import type { JSX } from 'solid-js'
import type { ChainKey } from './web3'

// ── Icons (w-full h-full so they fill their Avatar/badge container) ──

export const EthereumIcon = () => (
  <svg viewBox="0 0 32 32" class="w-full h-full">
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

export const MegaETHIcon = () => (
  <svg viewBox="0 0 100 100" class="w-full h-full">
    <circle cx="50" cy="50" r="50" fill="#000"/>
    <circle cx="50" cy="50" r="45" fill="transparent" stroke="#fff" stroke-width="3"/>
    <text x="50" y="65" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#fff" text-anchor="middle">M</text>
    <circle cx="40" cy="75" r="3" fill="#fff"/>
    <circle cx="60" cy="75" r="3" fill="#fff"/>
  </svg>
)

export const USDFCIcon = () => (
  <img src={`${import.meta.env.BASE_URL}images/usdfc.png`} alt="USDFC" class="w-full h-full object-contain" />
)

export const USDMIcon = () => (
  <img src={`${import.meta.env.BASE_URL}images/usdm.png`} alt="USDM" class="w-full h-full object-contain" />
)

export const FilecoinIcon = () => (
  <img src={`${import.meta.env.BASE_URL}images/filecoin.png`} alt="Filecoin" class="w-full h-full object-contain" />
)

// ── Asset config ──

export interface AssetConfig {
  id: string
  key: string
  name: string
  symbol: string
  chainKey: ChainKey
  icon: () => JSX.Element
  chainBadge: () => JSX.Element
  isNative: boolean
  tokenAddress?: string
  priceUsd: number
}

export const ASSET_CONFIGS: AssetConfig[] = [
  {
    id: 'fil-mainnet',
    key: 'fil:native',
    name: 'FIL',
    symbol: 'Filecoin',
    chainKey: 'fil',
    icon: FilecoinIcon,
    chainBadge: FilecoinIcon,
    isNative: true,

    priceUsd: 5,
  },
  {
    id: 'usdfc-filecoin',
    key: 'fil:erc20:0x80B98d3aa09ffff255c3ba4A241111Ff1262F045',
    name: 'USDFC',
    symbol: 'Filecoin',
    chainKey: 'fil',
    icon: USDFCIcon,
    chainBadge: FilecoinIcon,
    isNative: false,
    tokenAddress: '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045',

    priceUsd: 1,
  },
  {
    id: 'eth-sepolia',
    key: 'sepolia:native',
    name: 'ETH',
    symbol: 'Ethereum',
    chainKey: 'sepolia',
    icon: EthereumIcon,
    chainBadge: EthereumIcon,
    isNative: true,

    priceUsd: 3090,
  },
  {
    id: 'eth-megaeth',
    key: 'mega:native',
    name: 'ETH',
    symbol: 'MegaETH',
    chainKey: 'mega',
    icon: EthereumIcon,
    chainBadge: MegaETHIcon,
    isNative: true,

    priceUsd: 3090,
  },
  {
    id: 'usdm-megaeth',
    key: 'megaMainnet:erc20:0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7',
    name: 'USDM',
    symbol: 'MegaETH',
    chainKey: 'megaMainnet',
    icon: USDMIcon,
    chainBadge: MegaETHIcon,
    isNative: false,
    tokenAddress: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7',

    priceUsd: 1,
  },
]
