/**
 * Query PKP -> EOA linkage from ContentAccessMirror on Base Sepolia.
 * When EOA users authenticate, their PKP is linked to their EOA on this contract.
 * This allows resolving ENS names for posts made by PKP addresses.
 */

import { createPublicClient, http, zeroAddress } from 'viem'
import { baseSepolia } from 'viem/chains'
import { CONTENT_ACCESS_MIRROR } from '@heaven/core'

// Re-export for backward compatibility
export { CONTENT_ACCESS_MIRROR }

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
