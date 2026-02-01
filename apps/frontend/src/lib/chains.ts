import { defineChain } from 'viem'
import { celo, sepolia } from 'viem/chains'

export { celo, sepolia }

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
