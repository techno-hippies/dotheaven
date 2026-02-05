import { type Hex, encodeAbiParameters, keccak256, pad } from 'viem'

type TrackIdInput = {
  artist: string
  title: string
  album?: string | null
  mbid?: string | null
  ipId?: string | null
}

function normalizeString(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Compute trackId using the same rules as ScrobbleV3/V4:
 * - Kind 1: MBID → bytes32(bytes16(mbid)) (left-aligned)
 * - Kind 2: ipId → bytes32(uint256(uint160(ipId)))
 * - Kind 3: keccak256(title, artist, album)
 */
export function computeTrackIdFromMeta(input: TrackIdInput): Hex | null {
  if (!input.artist || !input.title) return null

  if (input.mbid) {
    const mbidHex = input.mbid.replace(/-/g, '')
    const payload = pad(`0x${mbidHex}` as Hex, { size: 32, dir: 'right' })
    return keccak256(
      encodeAbiParameters(
        [{ type: 'uint8' }, { type: 'bytes32' }],
        [1, payload],
      ),
    )
  }

  if (input.ipId) {
    const payload = pad(input.ipId as Hex, { size: 32 })
    return keccak256(
      encodeAbiParameters(
        [{ type: 'uint8' }, { type: 'bytes32' }],
        [2, payload],
      ),
    )
  }

  const payload = keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'string' }, { type: 'string' }],
      [
        normalizeString(input.title),
        normalizeString(input.artist),
        normalizeString(input.album ?? ''),
      ],
    ),
  )

  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'bytes32' }],
      [3, payload],
    ),
  )
}
