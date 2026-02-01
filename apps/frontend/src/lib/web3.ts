import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatEther,
  formatUnits,
  parseAbi,
  type Address,
  type Chain,
} from 'viem'
import { sepolia, megaTestnetV2, filecoinCalibration, filecoin } from './chains'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>
      on?: (event: string, handler: (...args: any[]) => void) => void
      removeListener?: (event: string, handler: (...args: any[]) => void) => void
    }
  }
}

export const CHAINS = {
  sepolia,
  mega: megaTestnetV2,
  filCalib: filecoinCalibration,
  fil: filecoin,
} as const

export type ChainKey = keyof typeof CHAINS

export const TOKENS: Record<ChainKey, Array<{ symbol: string; address: Address; name: string }>> = {
  sepolia: [],
  mega: [
    {
      symbol: 'USDm',
      name: 'USDm',
      address: '0x0000000000000000000000000000000000000000', // Replace with actual address
    },
  ],
  filCalib: [
    {
      symbol: 'USDFC',
      name: 'USDFC',
      address: '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0',
    },
  ],
  fil: [
    {
      symbol: 'USDFC',
      name: 'USDFC',
      address: '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045',
    },
  ],
}

export function makePublicClient(chain: Chain) {
  return createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  })
}

export function makeWalletClient(chain: Chain) {
  if (!window.ethereum) throw new Error('No injected wallet found (window.ethereum).')
  return createWalletClient({
    chain,
    transport: custom(window.ethereum),
  })
}

export async function connectWallet(): Promise<Address> {
  if (!window.ethereum) throw new Error('No injected wallet found.')
  const [addr] = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[]
  return addr as Address
}

export async function getCurrentChainId(): Promise<number> {
  if (!window.ethereum) throw new Error('No injected wallet found.')
  const hex = (await window.ethereum.request({ method: 'eth_chainId' })) as string
  return Number.parseInt(hex, 16)
}

export async function switchToChain(chain: Chain) {
  if (!window.ethereum) throw new Error('No injected wallet found.')
  const chainIdHex = `0x${chain.id.toString(16)}`
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
  } catch (err: any) {
    // Not added → add then switch
    if (err?.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainIdHex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls.default.http,
            blockExplorerUrls: chain.blockExplorers?.default
              ? [chain.blockExplorers.default.url]
              : [],
          },
        ],
      })
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      })
      return
    }
    throw err
  }
}

export async function getNativeBalance(chain: Chain, address: Address) {
  const pc = makePublicClient(chain)
  const wei = await pc.getBalance({ address })
  return { wei, formatted: formatEther(wei) }
}

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function transfer(address,uint256) returns (bool)',
])

export async function getErc20Balance(chain: Chain, token: Address, user: Address) {
  const pc = makePublicClient(chain)
  try {
    const [raw, decimals, symbol] = await Promise.all([
      pc.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [user],
      }),
      pc.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
      pc.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    ])
    const formatted = formatUnits(raw as bigint, decimals as number)
    return {
      raw: raw as bigint,
      decimals: decimals as number,
      symbol: symbol as string,
      formatted,
    }
  } catch (error) {
    console.error(`Failed to fetch ERC20 balance for ${token}:`, error)
    return { raw: 0n, decimals: 18, symbol: '???', formatted: '0' }
  }
}

export async function sendNative(chain: Chain, from: Address, to: Address, valueWei: bigint) {
  await switchToChain(chain)
  const wc = makeWalletClient(chain)
  return wc.sendTransaction({ account: from, to, value: valueWei })
}

export async function sendErc20(
  chain: Chain,
  from: Address,
  token: Address,
  to: Address,
  amountRaw: bigint
) {
  await switchToChain(chain)
  const wc = makeWalletClient(chain)
  return wc.writeContract({
    account: from,
    address: token,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amountRaw],
  })
}
