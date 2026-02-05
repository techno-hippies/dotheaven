/**
 * Posts — fetches posts from the activity subgraph and resolves metadata from IPFS.
 */

const GOLDSKY_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/8.0.0/gn'

const IPFS_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

// ── Types ──────────────────────────────────────────────────────────

/** Raw post from the subgraph */
interface PostGQL {
  id: string
  creator: string
  contentType: number   // 0=text, 1=photo
  metadataUri: string
  isAdult: boolean
  blockTimestamp: string
  transactionHash: string
}

/** Resolved IPA metadata from IPFS */
interface IPAMetadata {
  title?: string
  description?: string
  mediaUrl?: string
  mediaType?: string
  text?: string
  contentType?: string
  creator?: string
  createdAt?: string
  mode?: string
  isAdult?: boolean
}

/** Feed-ready post */
export interface FeedPostEntry {
  id: string
  creator: string
  contentType: number
  isAdult: boolean
  timestamp: number       // unix seconds
  // Resolved from metadata
  title: string
  text: string
  imageUrl?: string
  // Provenance (on-chain data)
  provenance: {
    postId: string        // ipId from contract
    ipfsHash?: string     // CID extracted from metadataUri
    txHash: string        // transactionHash
    chainId: number       // MegaETH testnet = 6343
    registeredAt: string  // ISO timestamp
  }
}

// ── Subgraph query ─────────────────────────────────────────────────

export async function fetchPosts(
  first = 50,
  skip = 0,
): Promise<FeedPostEntry[]> {
  const query = `{
    posts(
      first: ${first}
      skip: ${skip}
      orderBy: blockTimestamp
      orderDirection: desc
    ) {
      id
      creator
      contentType
      metadataUri
      isAdult
      blockTimestamp
      transactionHash
    }
  }`

  const res = await fetch(GOLDSKY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) throw new Error(`Subgraph error: ${res.status}`)
  const json = await res.json()
  const posts: PostGQL[] = json.data?.posts ?? []

  // Resolve metadata in parallel
  const entries = await Promise.all(posts.map(resolvePost))
  return entries.filter((e): e is FeedPostEntry => e !== null)
}

/** Extract IPFS CID from ipfs:// URI */
function extractIpfsCid(uri: string): string | undefined {
  if (uri.startsWith('ipfs://')) return uri.slice(7)
  // Handle gateway URLs like https://gateway/ipfs/CID
  const match = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/)
  return match?.[1]
}

/** Build provenance object from raw post data */
function buildProvenance(post: PostGQL) {
  return {
    postId: post.id,
    ipfsHash: extractIpfsCid(post.metadataUri),
    txHash: post.transactionHash,
    chainId: 6343, // MegaETH testnet
    registeredAt: new Date(Number(post.blockTimestamp) * 1000).toISOString(),
  }
}

async function resolvePost(post: PostGQL): Promise<FeedPostEntry | null> {
  try {
    const meta = await fetchMetadata(post.metadataUri)
    if (!meta) return fallbackPost(post)

    let text = ''
    let imageUrl: string | undefined

    if (post.contentType === 1) {
      // Photo post
      text = meta.title || meta.description || ''
      imageUrl = meta.mediaUrl
    } else {
      // Text post — description has first 200 chars of text
      text = meta.description || meta.title || ''
    }

    return {
      id: post.id,
      creator: post.creator,
      contentType: post.contentType,
      isAdult: post.isAdult,
      timestamp: Number(post.blockTimestamp),
      title: meta.title || '',
      text,
      imageUrl,
      provenance: buildProvenance(post),
    }
  } catch {
    return fallbackPost(post)
  }
}

function fallbackPost(post: PostGQL): FeedPostEntry {
  return {
    id: post.id,
    creator: post.creator,
    contentType: post.contentType,
    isAdult: post.isAdult,
    timestamp: Number(post.blockTimestamp),
    title: '',
    text: post.contentType === 1 ? 'Photo post' : 'Text post',
    provenance: buildProvenance(post),
  }
}

async function fetchMetadata(uri: string): Promise<IPAMetadata | null> {
  try {
    const url = uri.startsWith('ipfs://') ? `${IPFS_GATEWAY}/${uri.slice(7)}` : uri
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── Time formatting ────────────────────────────────────────────────

export function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(unixSeconds * 1000).toLocaleDateString()
}
