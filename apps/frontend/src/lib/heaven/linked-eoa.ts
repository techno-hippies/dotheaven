/**
 * Query PKP -> EOA linkage from ContentAccessMirror on Base Sepolia.
 * When EOA users authenticate, their PKP is linked to their EOA on this contract.
 * This allows resolving ENS names for posts made by PKP addresses.
 */

import { createPublicClient, http, zeroAddress } from 'viem'
import { baseSepolia } from 'viem/chains'

/** ContentAccessMirror address on Base Sepolia */
export const CONTENT_ACCESS_MIRROR = '0xd4D3baB38a11D72e36F49a73D50Dbdc3c1Aa4e9A'

const baseSepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
})

const linkedEoaAbi = [
  {
    name: 'linkedEoa',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'pkp', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

/**
 * Get the EOA address linked to a PKP address.
 * Returns null if no EOA is linked.
 */
export async function getLinkedEoa(pkpAddress: `0x${string}`): Promise<`0x${string}` | null> {
  try {
    const eoa = await baseSepoliaClient.readContract({
      address: CONTENT_ACCESS_MIRROR as `0x${string}`,
      abi: linkedEoaAbi,
      functionName: 'linkedEoa',
      args: [pkpAddress],
    })

    if (eoa === zeroAddress) return null
    return eoa
  } catch (err) {
    console.warn('[getLinkedEoa] Failed to query:', err)
    return null
  }
}
