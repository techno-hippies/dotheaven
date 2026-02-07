/**
 * Image Cache - Automatic rehosting of external images to IPFS
 *
 * Detects Wikipedia/external URLs and rehosts them to Filebase via heaven-resolver.
 * Uses in-memory cache to avoid duplicate rehost requests.
 */

const RESOLVER_URL = import.meta.env.VITE_RESOLVER_URL || 'https://heaven-resolver-production.deletion-backup782.workers.dev'

// In-memory cache: externalUrl → ipfsUrl
const cache = new Map<string, string>()

// In-flight requests: externalUrl → Promise
const pending = new Map<string, Promise<string | null>>()

/**
 * Resolve an image URL. If it's an external URL (Wikipedia, coverartarchive, etc.),
 * automatically rehost it to IPFS via heaven-resolver.
 *
 * Returns the IPFS URL if rehosted, otherwise returns the original URL.
 */
export async function resolveImageUrl(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined

  // Already IPFS or Filebase - pass through
  if (url.startsWith('ipfs://') || url.includes('myfilebase.com')) {
    return url.startsWith('ipfs://')
      ? `https://heaven.myfilebase.com/ipfs/${url.slice(7)}`
      : url
  }

  // Not an external URL - pass through
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return url
  }

  // Check in-memory cache first
  const cached = cache.get(url)
  if (cached) return cached

  // Check if already pending
  const inflight = pending.get(url)
  if (inflight) return (await inflight) ?? undefined

  // Start rehost request
  const promise = rehostImage(url)
  pending.set(url, promise)

  try {
    const ipfsUrl = await promise
    if (ipfsUrl) {
      cache.set(url, ipfsUrl)
      return ipfsUrl
    }
    // Rehost failed - use original URL
    return url
  } catch (err) {
    console.warn('[ImageCache] Rehost failed:', err)
    return url
  } finally {
    pending.delete(url)
  }
}

async function rehostImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(`${RESOLVER_URL}/rehost/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url] }),
    })

    if (!response.ok) {
      console.error('[ImageCache] Rehost request failed:', response.status)
      return null
    }

    const data = await response.json() as { results: Array<{ url: string; ipfsUrl: string | null; error: string | null }> }
    const result = data.results[0]

    if (result?.ipfsUrl) {
      // Convert ipfs:// to gateway URL
      return `https://heaven.myfilebase.com/ipfs/${result.ipfsUrl.slice(7)}`
    }

    if (result?.error) {
      console.error('[ImageCache] Rehost failed:', result.error)
    }

    return null
  } catch (err) {
    console.error('[ImageCache] Rehost exception:', err)
    return null
  }
}
