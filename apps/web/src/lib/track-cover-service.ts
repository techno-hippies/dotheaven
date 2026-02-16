import { type ReadyScrobble, MEGAETH_RPC as MEGAETH_RPC_DEFAULT, SCROBBLE_V4 as SCROBBLE_V4_ADDR } from '@heaven/core'
import { createPublicClient, http, type Hex } from 'viem'
import type { PKPAuthContext, PKPInfo } from './lit'
import { getLitClient } from './lit/client'
import { TRACK_COVER_V4_CID } from './lit/action-cids'
import { readCoverBase64 } from './cover-image'
import { setCoverCidNative } from './local-music'
import { computeTrackIdForScrobble, type ScrobbleTrack } from './aa-client'
import { isOnchainCoverRef } from './heaven/cover-ref'

type EncryptedKey = {
  ciphertext: string
  dataToEncryptHash: string
  accessControlConditions: unknown[]
}

/** Encrypted Filebase covers key — bound to the track-cover-v4 action CID (update after redeploy). */
const FILEBASE_COVERS_ENCRYPTED_KEY: EncryptedKey | null = {
  ciphertext: 'opMNhXZ61OJ8dRKs8zCYQOiK7f5UJlfJPNJaso/2Bky6bku1ixYnrVZYzKZOrzQ1byVbe5HsmVjGyN1OzGvNz+p6rKg/VGYjaKWZ1PB6rAaGAe98dPHRbh+ITU9Eg6FoolrHU064jiaZtG8mmeWI2WU1MsyYQOS5gKqy+7+Zy2VrjqFASSqB4B9gICarqGbGN8khHoFTjirgnZyetJRHz4Iq/K6b8dNriTgL2dSMq2TMKYsl9ghAJRo5iE1olkpLPmdsCteNREtGIiJGZ42ufECUqM9DArkBAg==',
  dataToEncryptHash: '1fb52374f1a4ec4d9f1a263b1355cedecbe3ef9d52425f76c222f2f5d9993d4f',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: TRACK_COVER_V4_CID },
  }],
}

type CoverImage = { base64: string; contentType: string }

const MEGAETH_RPC = import.meta.env.VITE_AA_RPC_URL ?? MEGAETH_RPC_DEFAULT
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
  if (!TRACK_COVER_V4_CID) return

  const coverCid = isOnchainCoverRef(scrobble.coverCid) ? scrobble.coverCid : null
  const track: ScrobbleTrack = {
    artist: scrobble.artist,
    title: scrobble.title,
    album: scrobble.album,
    mbid: scrobble.mbid,
    ipId: scrobble.ipId,
    playedAtSec: scrobble.playedAtSec,
    duration: scrobble.durationMs ? Math.round(scrobble.durationMs / 1000) : 0,
  }
  const trackId = computeTrackIdForScrobble(track)
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

  let coverImage: CoverImage | null = null

  if (!resolvedCoverCid && scrobble.coverPath) {
    coverImage = await readCoverBase64(scrobble.coverPath)
  }

  if (!resolvedCoverCid && !coverImage) return

  if (coverImage && !FILEBASE_COVERS_ENCRYPTED_KEY) {
    console.warn('[Cover] Missing encrypted Filebase key — skipping cover upload')
    return
  }

  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()

  const tracks = [{
    trackId,
    ...(resolvedCoverCid ? { coverCid: resolvedCoverCid } : {}),
    ...(coverImage ? { coverImage } : {}),
  }]

  const jsParams: Record<string, unknown> = {
    userPkpPublicKey: pkpInfo.publicKey,
    tracks,
    timestamp,
    nonce,
  }

  if (coverImage && FILEBASE_COVERS_ENCRYPTED_KEY) {
    jsParams.filebaseEncryptedKey = FILEBASE_COVERS_ENCRYPTED_KEY
  }

  const litClient = await getLitClient()
  const result = await litClient.executeJs({
    ipfsId: TRACK_COVER_V4_CID,
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

  if (returnedCoverCid && isOnchainCoverRef(returnedCoverCid) && scrobble.filePath) {
    try {
      await setCoverCidNative(scrobble.filePath, returnedCoverCid)
    } catch {
      // Best-effort: local cache update failure shouldn't block scrobble
    }
  }
}
