export type CoverUrlOptions = {
  width?: number
  height?: number
  format?: 'webp' | 'jpeg'
  quality?: number
}

// Existing coverCid values are IPFS CIDs rendered through our dedicated Filebase gateway.
const FILEBASE_IPFS_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

// When we store Arweave data item IDs on-chain, we keep only the ID and resolve via gateway.
const ARWEAVE_GATEWAY = 'https://arweave.net'

// Optional: LS3 resolution for `ls3://` refs (offchain). Keep as fallback only.
const LOAD_LS3_GATEWAY = 'https://gateway.s3-node-1.load.network'

export function isIpfsCid(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return !!v && (v.startsWith('Qm') || v.startsWith('bafy'))
}

export function isArweaveRef(value: string | null | undefined): boolean {
  return ((value ?? '').trim()).startsWith('ar://')
}

export function isLs3Ref(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return v.startsWith('ls3://') || v.startsWith('load-s3://')
}

export function isOnchainCoverRef(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return isIpfsCid(v) || isArweaveRef(v) || isLs3Ref(v)
}

function buildFilebaseTransformQuery(opts?: CoverUrlOptions): string {
  if (!opts) return ''
  const width = opts.width
  const height = opts.height
  const format = opts.format
  const quality = opts.quality

  const parts: string[] = []
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) parts.push(`img-width=${Math.round(width)}`)
  if (typeof height === 'number' && Number.isFinite(height) && height > 0) parts.push(`img-height=${Math.round(height)}`)
  if (format) parts.push(`img-format=${format}`)
  if (typeof quality === 'number' && Number.isFinite(quality) && quality > 0) parts.push(`img-quality=${Math.round(quality)}`)
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

/**
 * Resolve a cover ref (legacy IPFS CID, `ipfs://`, `ar://`, or `ls3://`) to a fetchable URL.
 *
 * For legacy IPFS, we keep using Filebase gateway transforms.
 * For Arweave/LS3, we return a plain gateway URL (no transforms).
 */
export function resolveCoverUrl(
  ref: string | null | undefined,
  opts?: CoverUrlOptions,
): string | undefined {
  const raw = (ref ?? '').trim()
  if (!raw) return undefined

  if (raw.startsWith('ipfs://')) {
    const cid = raw.slice('ipfs://'.length).trim()
    if (!cid) return undefined
    return `${FILEBASE_IPFS_GATEWAY}/${cid}${buildFilebaseTransformQuery(opts)}`
  }

  if (raw.startsWith('ar://')) {
    const id = raw.slice('ar://'.length).trim()
    if (!id) return undefined
    return `${ARWEAVE_GATEWAY}/${id}`
  }

  if (raw.startsWith('ls3://')) {
    const id = raw.slice('ls3://'.length).trim()
    if (!id) return undefined
    return `${LOAD_LS3_GATEWAY}/resolve/${id}`
  }

  if (raw.startsWith('load-s3://')) {
    const id = raw.slice('load-s3://'.length).trim()
    if (!id) return undefined
    return `${LOAD_LS3_GATEWAY}/resolve/${id}`
  }

  if (isIpfsCid(raw)) {
    return `${FILEBASE_IPFS_GATEWAY}/${raw}${buildFilebaseTransformQuery(opts)}`
  }

  if (raw.startsWith('https://') || raw.startsWith('http://')) {
    return raw
  }

  return undefined
}
