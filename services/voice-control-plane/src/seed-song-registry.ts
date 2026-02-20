/**
 * Seed a Song Registry entry into the local/remote Session Voice worker.
 *
 * This is a dev helper to create a "published song" entry with a verifiable
 * Story -> Base payout mapping (EIP-712 attestation signed by the controller wallet).
 *
 * Env:
 * - SESSION_VOICE_URL (default http://localhost:3338)
 * - SONG_REGISTRY_ADMIN_TOKEN (required)
 * - SONG_CONTROLLER_PRIVATE_KEY (required; used to sign the attestation)
 *
 * Usage:
 *   bun src/seed-song-registry.ts --title "Song" --artist "Artist" --story-ip-id "ip_..." --bps 1000
 *   bun src/seed-song-registry.ts --title "Song" --artist "Artist" --story-ip-id "ip_..." --payout 0x... --bps 1000
 */

import { privateKeyToAccount } from 'viem/accounts'

const BASE_SEPOLIA_CHAIN_ID = 84532

const DOMAIN = {
  name: 'HeavenSongRegistry',
  version: '1',
  chainId: BASE_SEPOLIA_CHAIN_ID,
} as const

const TYPES = {
  StoryPayoutAttestation: [
    { name: 'storyIpId', type: 'string' },
    { name: 'payoutChainId', type: 'uint256' },
    { name: 'payoutAddress', type: 'address' },
    { name: 'upstreamRoyaltyBps', type: 'uint256' },
  ],
} as const

function readArg(name: string): string | null {
  const needle = `--${name}=`
  for (const raw of process.argv.slice(2)) {
    if (raw.startsWith(needle)) return raw.slice(needle.length)
  }
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1) {
    const next = process.argv[idx + 1]
    if (next && !next.startsWith('--')) return next
  }
  return null
}

function requireString(value: string | null, label: string): string {
  const v = (value || '').trim()
  if (!v) throw new Error(`Missing --${label}`)
  return v
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

async function main() {
  const baseUrl = (process.env.SESSION_VOICE_URL || 'http://localhost:3338').replace(/\/+$/, '')
  const adminToken = (process.env.SONG_REGISTRY_ADMIN_TOKEN || '').trim()
  if (!adminToken) throw new Error('Missing SONG_REGISTRY_ADMIN_TOKEN')

  const controllerPk = (process.env.SONG_CONTROLLER_PRIVATE_KEY || '').trim()
  if (!/^0x[a-fA-F0-9]{64}$/.test(controllerPk)) {
    throw new Error('Missing/invalid SONG_CONTROLLER_PRIVATE_KEY (expected 0x + 64 hex chars)')
  }

  const title = requireString(readArg('title'), 'title').slice(0, 256)
  const artist = requireString(readArg('artist'), 'artist').slice(0, 256)
  const storyIpId = requireString(readArg('story-ip-id') || readArg('story_ip_id'), 'story-ip-id').slice(0, 256)
  const bpsRaw = readArg('bps') || '0'
  const bps = Math.max(0, Math.min(10_000, Math.floor(Number(bpsRaw))))
  if (!Number.isFinite(bps)) throw new Error(`Invalid --bps: ${bpsRaw}`)

  const account = privateKeyToAccount(controllerPk as `0x${string}`)
  const controllerWallet = account.address.toLowerCase()

  const payout = (readArg('payout') || controllerWallet).trim().toLowerCase()
  if (!isAddress(payout)) throw new Error(`Invalid payout address: ${payout}`)

  const message = {
    storyIpId,
    payoutChainId: BigInt(BASE_SEPOLIA_CHAIN_ID),
    payoutAddress: payout as `0x${string}`,
    upstreamRoyaltyBps: BigInt(bps),
  } as const

  const sig = await account.signTypedData({
    domain: DOMAIN,
    types: TYPES,
    primaryType: 'StoryPayoutAttestation',
    message,
  })

  const licensePresetId = readArg('license') || readArg('license-preset-id') || undefined

  const res = await fetch(`${baseUrl}/songs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title,
      artist,
      story_ip_id: storyIpId,
      controller_wallet: controllerWallet,
      payout_chain_id: BASE_SEPOLIA_CHAIN_ID,
      payout_address: payout,
      default_upstream_bps: bps,
      payout_attestation_sig: sig,
      ...(licensePresetId ? { license_preset_id: licensePresetId } : {}),
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`)
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(body, null, 2))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

