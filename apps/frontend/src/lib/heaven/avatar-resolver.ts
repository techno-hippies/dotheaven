/**
 * Avatar Resolver - Resolves avatar URIs from RecordsV1 and ENS
 *
 * Supports:
 * - ipfs:// → IPFS gateway URL
 * - https:// → direct URL
 * - eip155:{chainId}/{type}:{contract}/{tokenId} → on-chain NFT metadata resolution
 * - ENS name → avatar text record resolution via viem
 *
 * Follows ENSIP-12 spec for NFT avatar references.
 */

import { createPublicClient, http, parseAbi, type PublicClient } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'

export const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

// Mainnet client for ENS + NFT resolution
let mainnetClient: PublicClient | null = null
function getMainnetClient(): PublicClient {
  if (!mainnetClient) {
    mainnetClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    }) as PublicClient
  }
  return mainnetClient
}

// ERC-721 ABI (tokenURI + ownerOf)
const erc721Abi = parseAbi([
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
])

// ERC-1155 ABI (uri + balanceOf)
const erc1155Abi = parseAbi([
  'function uri(uint256 id) external view returns (string)',
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
])

/**
 * Resolve an IPFS URI to a gateway URL.
 */
export function resolveIpfsUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    return `${FILEBASE_GATEWAY}/${uri.slice('ipfs://'.length)}`
  }
  return uri
}

/**
 * Resolve any avatar URI string to a displayable URL.
 *
 * Handles:
 * - ipfs://Qm... → gateway
 * - https://... → pass-through
 * - eip155:1/erc721:0x.../123 → fetch tokenURI, extract image
 * - eip155:1/erc1155:0x.../123 → fetch uri, extract image
 */
export async function resolveAvatarUri(uri: string): Promise<string | null> {
  if (!uri) return null

  // Direct URLs
  if (uri.startsWith('https://') || uri.startsWith('http://')) return uri

  // IPFS
  if (uri.startsWith('ipfs://')) return resolveIpfsUri(uri)

  // Arweave
  if (uri.startsWith('ar://')) return `https://arweave.net/${uri.slice(5)}`

  // ENSIP-12 NFT reference: eip155:{chainId}/{type}:{contract}/{tokenId}
  const nftMatch = uri.match(/^eip155:(\d+)\/(erc721|erc1155):([^/]+)\/(.+)$/)
  if (nftMatch) {
    const [, chainIdStr, tokenType, contract, tokenId] = nftMatch
    return resolveNftImage(
      Number(chainIdStr),
      tokenType as 'erc721' | 'erc1155',
      contract as `0x${string}`,
      tokenId,
    )
  }

  // Unknown scheme
  return null
}

/**
 * Resolve an NFT to its image URL by reading tokenURI/uri on-chain,
 * fetching the metadata JSON, and extracting the image field.
 */
async function resolveNftImage(
  chainId: number,
  tokenType: 'erc721' | 'erc1155',
  contract: `0x${string}`,
  tokenId: string,
): Promise<string | null> {
  // Only support mainnet for now
  if (chainId !== 1) return null

  const client = getMainnetClient()

  try {
    let metadataUri: string

    if (tokenType === 'erc721') {
      metadataUri = await client.readContract({
        address: contract,
        abi: erc721Abi,
        functionName: 'tokenURI',
        args: [BigInt(tokenId)],
      })
    } else {
      metadataUri = await client.readContract({
        address: contract,
        abi: erc1155Abi,
        functionName: 'uri',
        args: [BigInt(tokenId)],
      })
      // ERC-1155 uri may have {id} placeholder
      metadataUri = metadataUri.replace(
        '{id}',
        BigInt(tokenId).toString(16).padStart(64, '0'),
      )
    }

    // Resolve the metadata URI
    const metadataUrl = resolveIpfsUri(metadataUri)
    const response = await fetch(metadataUrl)
    if (!response.ok) return null

    const metadata = await response.json()
    const image = metadata.image || metadata.image_url || metadata.image_data
    if (!image) return null

    return resolveIpfsUri(image)
  } catch (err) {
    console.warn('[AvatarResolver] Failed to resolve NFT image:', err)
    return null
  }
}

/**
 * Check if an EOA still owns a specific NFT (for ownership validation).
 */
export async function verifyNftOwnership(
  ownerAddress: `0x${string}`,
  chainId: number,
  tokenType: 'erc721' | 'erc1155',
  contract: `0x${string}`,
  tokenId: string,
): Promise<boolean> {
  if (chainId !== 1) return false

  const client = getMainnetClient()

  try {
    if (tokenType === 'erc721') {
      const owner = await client.readContract({
        address: contract,
        abi: erc721Abi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      })
      return owner.toLowerCase() === ownerAddress.toLowerCase()
    } else {
      const balance = await client.readContract({
        address: contract,
        abi: erc1155Abi,
        functionName: 'balanceOf',
        args: [ownerAddress, BigInt(tokenId)],
      })
      return balance > 0n
    }
  } catch (err) {
    console.warn('[AvatarResolver] Ownership check failed:', err)
    return false
  }
}

/**
 * Fetch ENS profile (name + avatar) for an EOA address.
 * Returns null fields if no ENS name or avatar is set.
 */
export async function getEnsProfile(address: `0x${string}`): Promise<{
  name: string | null
  avatar: string | null
  /** Raw avatar text record (ENSIP-12 string, e.g. eip155:1/erc721:0x…/123) */
  avatarRecord: string | null
  /** Resolved header/banner image URL */
  header: string | null
}> {
  const client = getMainnetClient()

  try {
    const name = await client.getEnsName({ address })
    if (!name) return { name: null, avatar: null, avatarRecord: null, header: null }

    const normalizedName = normalize(name)

    // Read avatar and header text records in parallel
    const [avatarRecord, headerRecord] = await Promise.all([
      client.getEnsText({ name: normalizedName, key: 'avatar' }).catch(() => null),
      client.getEnsText({ name: normalizedName, key: 'header' }).catch(() => null),
    ])

    // Resolve avatar
    let avatar: string | null = null
    if (avatarRecord) {
      avatar = await resolveAvatarUri(avatarRecord)
    }

    // Resolve header (same logic as avatar — can be ipfs://, https://, etc.)
    let header: string | null = null
    if (headerRecord) {
      header = await resolveAvatarUri(headerRecord)
    }

    return { name, avatar, avatarRecord: avatarRecord ?? null, header }
  } catch (err) {
    console.warn('[AvatarResolver] ENS lookup failed:', err)
    return { name: null, avatar: null, avatarRecord: null, header: null }
  }
}

/**
 * Resolve an ENS name to an address.
 */
export async function resolveEnsName(name: string): Promise<`0x${string}` | null> {
  const client = getMainnetClient()
  try {
    const normalizedName = normalize(name)
    const address = await client.getEnsAddress({ name: normalizedName })
    return address ?? null
  } catch (err) {
    console.warn('[AvatarResolver] ENS name resolution failed:', err)
    return null
  }
}

/**
 * Parse an ENSIP-12 NFT reference string.
 * Returns null if not an NFT reference.
 */
export function parseNftRef(uri: string): {
  chainId: number
  tokenType: 'erc721' | 'erc1155'
  contract: `0x${string}`
  tokenId: string
} | null {
  const match = uri.match(/^eip155:(\d+)\/(erc721|erc1155):([^/]+)\/(.+)$/)
  if (!match) return null
  return {
    chainId: Number(match[1]),
    tokenType: match[2] as 'erc721' | 'erc1155',
    contract: match[3] as `0x${string}`,
    tokenId: match[4],
  }
}
