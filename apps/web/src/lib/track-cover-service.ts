import { type ReadyScrobble, MEGAETH_RPC as MEGAETH_RPC_DEFAULT, SCROBBLE_V4 as SCROBBLE_V4_ADDR } from '@heaven/core'
import { createPublicClient, http, type Hex } from 'viem'
import type { PKPAuthContext, PKPInfo } from './lit'
import { getLitClient } from './lit/client'
import { TRACK_COVER_V5_CID } from './lit/action-cids'
import { readCoverBase64 } from './cover-image'
import { uploadCoverToArweave } from './arweave-upload'
import { setCoverCidNative } from './local-music'
import { computeTrackIdFromMeta } from './track-id'
import { isOnchainCoverRef } from './heaven/cover-ref'

const MEGAETH_RPC = import.meta.env.VITE_MEGAETH_RPC_URL ?? MEGAETH_RPC_DEFAULT
const SCROBBLE_V4 = SCROBBLE_V4_ADDR

const scrobbleAbi = [{
  name: 'getTrack',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'trackId', type: 'bytes32' }],
  outputs: [
    { name: 'title', type: 'string' },
    { name: 'artist', type: 'string' },
    { name: 'album', type: 'string' },
    { name: 'kind', type: 'uint8' },
    { name: 'payload', type: 'bytes32' },
    { name: 'registeredAt', type: 'uint64' },
    { name: 'coverCid', type: 'string' },
    { name: 'durationSec', type: 'uint32' },
  ],
}] as const

const rpcClient = createPublicClient({ transport: http(MEGAETH_RPC) })

async function getOnchainCoverCid(trackId: Hex): Promise<string | null> {
  try {
    const result = await rpcClient.readContract({
      address: SCROBBLE_V4,
      abi: scrobbleAbi,
      functionName: 'getTrack',
      args: [trackId],
    }) as readonly [string, string, string, number, Hex, bigint, string, number]
    const coverCid = result[6]
    return isOnchainCoverRef(coverCid) ? coverCid : null
  } catch {
    return null
  }
}

export async function submitTrackCoverViaLit(
  scrobble: ReadyScrobble,
  pkpInfo: PKPInfo,
  authContext: PKPAuthContext,
): Promise<void> {
  if (!TRACK_COVER_V5_CID) return

  const coverCid = isOnchainCoverRef(scrobble.coverCid) ? scrobble.coverCid : null
  const trackId = computeTrackIdFromMeta({
    artist: scrobble.artist,
    title: scrobble.title,
    album: scrobble.album,
    mbid: scrobble.mbid,
    ipId: scrobble.ipId,
  })
  if (!trackId) return
  const trackIdKey = trackId.toLowerCase()

  let resolvedCoverCid = coverCid
  if (!resolvedCoverCid) {
    const onchainCoverCid = await getOnchainCoverCid(trackId)
    if (onchainCoverCid) {
      if (scrobble.filePath) {
        try {
          await setCoverCidNative(scrobble.filePath, onchainCoverCid)
        } catch {
          // Best-effort: local cache update failure shouldn't block scrobble
        }
      }
      return
    }
  }

  // v5 write policy: new writes should use ar:// refs.
  // If local ref is missing or non-ar://, try pre-uploading local cover bytes to Arweave.
  if (!resolvedCoverCid?.startsWith('ar://') && scrobble.coverPath) {
    const coverImage = await readCoverBase64(scrobble.coverPath)
    if (coverImage) {
      try {
        const uploaded = await uploadCoverToArweave(coverImage)
        resolvedCoverCid = uploaded.ref
      } catch (err) {
        console.warn('[Cover] Arweave pre-upload failed:', err)
      }
    }
  }

  if (!resolvedCoverCid?.startsWith('ar://')) {
    if (scrobble.coverPath || resolvedCoverCid) {
      console.warn('[Cover] Missing ar:// cover ref for v5 write — skipping cover write')
    }
    return
  }

  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()

  const tracks = [{
    trackId,
    coverCid: resolvedCoverCid,
  }]

  const jsParams: Record<string, unknown> = {
    userPkpPublicKey: pkpInfo.publicKey,
    tracks,
    timestamp,
    nonce,
  }

  const litClient = await getLitClient()
  const result = await litClient.executeJs({
    ipfsId: TRACK_COVER_V5_CID,
    authContext,
    jsParams,
  })

  const response = JSON.parse(result.response as string)
  if (!response?.success) {
    throw new Error(response?.error || 'Cover action failed')
  }

  const returnedCoverCid: string | undefined =
    response?.coverCid ||
    (trackIdKey && response?.coverCids ? response.coverCids[trackIdKey] : undefined)

  const effectiveCoverCid = returnedCoverCid || resolvedCoverCid || undefined

  if (effectiveCoverCid && isOnchainCoverRef(effectiveCoverCid) && scrobble.filePath) {
    try {
      await setCoverCidNative(scrobble.filePath, effectiveCoverCid)
    } catch {
      // Best-effort: local cache update failure shouldn't block scrobble
    }
  }
}
