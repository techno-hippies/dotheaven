/**
 * On-chain queries for Heaven name + Celo verification
 *
 * - RegistryV1: primaryName(address) → check if wallet has a .heaven name
 * - VerificationMirror: verifiedAt(address) → check if wallet is Celo-verified
 */

import { createPublicClient, http, parseAbi, type Address } from 'viem'

const registryAbi = parseAbi([
  'function primaryName(address) external view returns (string label, bytes32 parentNode)',
])

const mirrorAbi = parseAbi([
  'function verifiedAt(address user) external view returns (uint64)',
])

function getClient(rpcUrl: string) {
  return createPublicClient({ transport: http(rpcUrl) })
}

/** Check if wallet has a .heaven name (for credit gating on free rooms) */
export async function hasPrimaryName(
  rpcUrl: string,
  registryAddress: string,
  wallet: string,
): Promise<boolean> {
  try {
    const client = getClient(rpcUrl)
    const [label] = await client.readContract({
      address: registryAddress as Address,
      abi: registryAbi,
      functionName: 'primaryName',
      args: [wallet as Address],
    })
    return label !== ''
  } catch {
    return false
  }
}

/** Check if wallet is Celo-verified via VerificationMirror on MegaETH */
export async function isVerified(
  rpcUrl: string,
  mirrorAddress: string,
  wallet: string,
): Promise<boolean> {
  try {
    const client = getClient(rpcUrl)
    const verifiedAt = await client.readContract({
      address: mirrorAddress as Address,
      abi: mirrorAbi,
      functionName: 'verifiedAt',
      args: [wallet as Address],
    })
    return verifiedAt > 0n
  } catch {
    return false
  }
}
