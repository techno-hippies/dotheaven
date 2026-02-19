import { defineChain } from 'viem'
import { celo, tempoModerato } from 'viem/chains'

export { celo }
export { tempoModerato }

// Lavanet decentralized RPC gateway
const LAVANET_KEY = '69b66aca774b0ee62a86d26675365f07'

// Ethereum Mainnet with Lavanet RPC
export const mainnet = defineChain({
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [`https://g.w.lavanet.xyz:443/gateway/eth/rpc-http/${LAVANET_KEY}`] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://etherscan.io' },
  },
})

// Ethereum Sepolia with Lavanet RPC
export const sepolia = defineChain({
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [`https://g.w.lavanet.xyz:443/gateway/sep1/rpc-http/${LAVANET_KEY}`] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' },
  },
  testnet: true,
})

// Base Mainnet with Lavanet RPC
export const base = defineChain({
  id: 8453,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [`https://g.w.lavanet.xyz:443/gateway/base/rpc-http/${LAVANET_KEY}`] },
  },
  blockExplorers: {
    default: { name: 'Basescan', url: 'https://basescan.org' },
  },
})

// Base Sepolia with Lavanet RPC
export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [`https://g.w.lavanet.xyz:443/gateway/bases/rpc-http/${LAVANET_KEY}`] },
  },
  blockExplorers: {
    default: { name: 'Basescan', url: 'https://sepolia.basescan.org' },
  },
  testnet: true,
})

// Celo Sepolia (Self.xyz hub is deployed here, chain 11142220)
export const celoSepolia = defineChain({
  id: 11142220,
  name: 'Celo Sepolia',
  nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://forno.celo-sepolia.celo-testnet.org'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://celo-sepolia.blockscout.com' },
  },
  testnet: true,
})

export const megaTestnetV2 = defineChain({
  id: 6343,
  name: 'Mega Testnet V2',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://carrot.megaeth.com/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://megaeth-testnet-v2.blockscout.com' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
})

export const megaMainnet = defineChain({
  id: 6342,
  name: 'MegaETH',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mainnet.megaeth.com/rpc'] },
  },
})

export const filecoinCalibration = defineChain({
  id: 314159,
  name: 'Filecoin Calibration',
  nativeCurrency: { name: 'Test Filecoin', symbol: 'tFIL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.calibration.node.glif.io/rpc/v1'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://filecoin-testnet.blockscout.com' },
  },
})

export const filecoin = defineChain({
  id: 314,
  name: 'Filecoin',
  nativeCurrency: { name: 'Filecoin', symbol: 'FIL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.node.glif.io/rpc/v1'] },
  },
  blockExplorers: {
    default: { name: 'Filfox', url: 'https://filfox.info' },
  },
})
