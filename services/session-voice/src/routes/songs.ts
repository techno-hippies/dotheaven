/**
 * Songs Registry (Story mapping + payout attestation)
 *
 * GET  /search?q=... → search published songs
 * GET  /:id          → fetch a song entry
 * POST /             → admin create (requires Bearer SONG_REGISTRY_ADMIN_TOKEN)
 *
 * Notes:
 * - This registry exists to support "pick song -> rights + payout recipe" for segments.
 * - We store a verifiable mapping from Story IP id -> Base payout address via an EIP-712 attestation signature.
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { verifyTypedData, type Address } from 'viem'

export const songRoutes = new Hono<{ Bindings: Env }>()

const MAX_SEARCH_RESULTS = 25
const MAX_QUERY_LEN = 128
const MAX_TITLE_LEN = 256
const MAX_ARTIST_LEN = 256
const MAX_STORY_IP_ID_LEN = 256
const MAX_LICENSE_PRESET_LEN = 128

const BASE_SEPOLIA_CHAIN_ID = 84532

const ATTESTATION_DOMAIN = {
  name: 'HeavenSongRegistry',
  version: '1',
} as const

const ATTESTATION_TYPES = {
  StoryPayoutAttestation: [
    { name: 'storyIpId', type: 'string' },
    { name: 'payoutChainId', type: 'uint256' },
    { name: 'payoutAddress', type: 'address' },
    { name: 'upstreamRoyaltyBps', type: 'uint256' },
  ],
} as const

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function isHexSignature(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{130}$/.test(value)
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function requireAdmin(c: any): Response | null {
  const token = (c.env.SONG_REGISTRY_ADMIN_TOKEN || '').trim()
  if (!token) return c.json({ error: 'song_registry_admin_not_configured' }, 500)

  const auth = (c.req.header('authorization') || '').trim()
  if (auth !== `Bearer ${token}`) return c.json({ error: 'unauthorized' }, 401)
  return null
}

songRoutes.get('/search', async (c) => {
  const qRaw = (c.req.query('q') || '').slice(0, MAX_QUERY_LEN)
  const q = normalizeText(qRaw)

  if (!q || q.length < 2) {
    return c.json({ songs: [] })
  }

  const like = `%${q}%`
  const result = await c.env.DB.prepare(`
    SELECT
      song_id,
      title,
      artist,
      story_ip_id,
      payout_chain_id,
      payout_address,
      default_upstream_bps,
      license_preset_id,
      updated_at
    FROM song_registry
    WHERE title_norm LIKE ?1 OR artist_norm LIKE ?1 OR story_ip_id LIKE ?1
    ORDER BY updated_at DESC
    LIMIT ${MAX_SEARCH_RESULTS}
  `).bind(like).all<{
    song_id: string
    title: string
    artist: string
    story_ip_id: string
    payout_chain_id: number
    payout_address: string
    default_upstream_bps: number
    license_preset_id: string | null
    updated_at: number
  }>()

  return c.json({ songs: result.results ?? [] })
})

songRoutes.get('/:id', async (c) => {
  const songId = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT * FROM song_registry WHERE song_id = ?1')
    .bind(songId)
    .first<Record<string, unknown>>()

  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(row)
})

songRoutes.post('/', async (c) => {
  const denied = requireAdmin(c)
  if (denied) return denied

  const body = await c.req.json<{
    title?: string
    artist?: string
    story_ip_id?: string
    controller_wallet?: string
    payout_chain_id?: number
    payout_address?: string
    default_upstream_bps?: number
    payout_attestation_sig?: `0x${string}`
    license_preset_id?: string
  }>().catch(() => ({} as any))

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE_LEN) : ''
  const artist = typeof body.artist === 'string' ? body.artist.trim().slice(0, MAX_ARTIST_LEN) : ''
  const storyIpId = typeof body.story_ip_id === 'string' ? body.story_ip_id.trim().slice(0, MAX_STORY_IP_ID_LEN) : ''
  const controllerWallet = typeof body.controller_wallet === 'string' ? body.controller_wallet.trim().toLowerCase() : ''
  const payoutChainId = Number.isFinite(body.payout_chain_id) ? Math.floor(body.payout_chain_id as number) : BASE_SEPOLIA_CHAIN_ID
  const payoutAddress = typeof body.payout_address === 'string' ? body.payout_address.trim().toLowerCase() : ''
  const upstreamBps = Number.isFinite(body.default_upstream_bps) ? Math.floor(body.default_upstream_bps as number) : 0
  const attSig = body.payout_attestation_sig
  const licensePresetId = typeof body.license_preset_id === 'string'
    ? body.license_preset_id.trim().slice(0, MAX_LICENSE_PRESET_LEN)
    : null

  if (!title) return c.json({ error: 'missing_title' }, 400)
  if (!artist) return c.json({ error: 'missing_artist' }, 400)
  if (!storyIpId) return c.json({ error: 'missing_story_ip_id' }, 400)
  if (!isAddress(controllerWallet)) return c.json({ error: 'invalid_controller_wallet' }, 400)
  if (!isAddress(payoutAddress)) return c.json({ error: 'invalid_payout_address' }, 400)
  if (payoutChainId !== BASE_SEPOLIA_CHAIN_ID) return c.json({ error: 'payout_chain_not_allowed' }, 400)
  if (!Number.isFinite(upstreamBps) || upstreamBps < 0 || upstreamBps > 10_000) return c.json({ error: 'invalid_default_upstream_bps' }, 400)
  if (!isHexSignature(attSig)) return c.json({ error: 'invalid_payout_attestation_sig' }, 400)

  // Reject duplicate Story IP ids.
  const existing = await c.env.DB.prepare('SELECT song_id FROM song_registry WHERE story_ip_id = ?1')
    .bind(storyIpId)
    .first<{ song_id: string }>()
  if (existing?.song_id) return c.json({ error: 'story_ip_id_already_registered', song_id: existing.song_id }, 409)

  const domain = {
    ...ATTESTATION_DOMAIN,
    chainId: payoutChainId,
  } as const

  const message = {
    storyIpId,
    payoutChainId: BigInt(payoutChainId),
    payoutAddress: payoutAddress as Address,
    upstreamRoyaltyBps: BigInt(upstreamBps),
  } as const

  let ok = false
  try {
    ok = await verifyTypedData({
      address: controllerWallet as Address,
      domain,
      types: ATTESTATION_TYPES,
      primaryType: 'StoryPayoutAttestation',
      message,
      signature: attSig,
    })
  } catch {
    ok = false
  }
  if (!ok) return c.json({ error: 'invalid_attestation_signature' }, 400)

  const songId = crypto.randomUUID()
  const createdAt = nowSeconds()

  await c.env.DB.prepare(`
    INSERT INTO song_registry (
      song_id,
      title, artist, title_norm, artist_norm,
      story_ip_id,
      controller_wallet,
      payout_chain_id, payout_address,
      default_upstream_bps,
      payout_attestation_sig,
      license_preset_id,
      created_at, updated_at
    ) VALUES (
      ?1,
      ?2, ?3, ?4, ?5,
      ?6,
      ?7,
      ?8, ?9,
      ?10,
      ?11,
      ?12,
      ?13, ?14
    )
  `).bind(
    songId,
    title,
    artist,
    normalizeText(title),
    normalizeText(artist),
    storyIpId,
    controllerWallet,
    payoutChainId,
    payoutAddress,
    upstreamBps,
    attSig,
    licensePresetId,
    createdAt,
    createdAt,
  ).run()

  return c.json({
    ok: true,
    song_id: songId,
  })
})
