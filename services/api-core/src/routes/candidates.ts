import { Hono } from 'hono'
import type { Env, ShadowProfileRow, CandidatesResponse, CandidateProfile } from '../types'

const app = new Hono<{ Bindings: Env }>()

/**
 * GET /api/candidates
 *
 * Returns curated candidate profiles for the viewer's feed.
 * V0: Returns top 5 featured profiles, excluding already-liked.
 * V0.5: Will include Merkle root for on-chain like authorization.
 */
app.get('/', async (c) => {
  const viewer = c.req.query('viewer')?.toLowerCase()

  if (!viewer || !/^0x[a-f0-9]{40}$/i.test(viewer)) {
    return c.json({ error: 'Invalid viewer address' }, 400)
  }

  const db = c.env.DB

  // Get viewer's existing likes to exclude from results
  const likedResult = await db
    .prepare(`
      SELECT target_type, target_id FROM likes WHERE liker_address = ?
    `)
    .bind(viewer)
    .all<{ target_type: string; target_id: string }>()

  const likedShadowIds = new Set<string>()
  const likedUserAddresses = new Set<string>()

  for (const like of likedResult.results || []) {
    if (like.target_type === 'shadow') {
      likedShadowIds.add(like.target_id)
    } else {
      likedUserAddresses.add(like.target_id.toLowerCase())
    }
  }

  // Get viewer's own shadow profile (if they claimed one)
  const viewerShadowResult = await db
    .prepare(`SELECT id FROM shadow_profiles WHERE claimed_address = ?`)
    .bind(viewer)
    .first<{ id: string }>()

  const viewerShadowId = viewerShadowResult?.id

  // Query featured shadow profiles
  // V0: Return top 5 by featured_rank (lower = more featured)
  // Exclude: already liked, viewer's own profile, already claimed by others
  const profilesResult = await db
    .prepare(`
      SELECT
        id, source, display_name, bio, age_bucket, gender_identity,
        location, photos_json, anime_cid, claimed_address
      FROM shadow_profiles
      WHERE featured_rank > 0
      ORDER BY featured_rank ASC
      LIMIT 20
    `)
    .all<ShadowProfileRow>()

  const candidates: CandidateProfile[] = []

  for (const row of profilesResult.results || []) {
    // Skip if viewer already liked this profile
    if (likedShadowIds.has(row.id)) continue

    // Skip if this is the viewer's own profile
    if (row.id === viewerShadowId) continue

    // Skip if claimed by someone the viewer already liked
    if (row.claimed_address && likedUserAddresses.has(row.claimed_address.toLowerCase())) continue

    // Build avatar URL from anime CID or fallback
    const avatarUrl = row.anime_cid
      ? `https://ipfs.io/ipfs/${row.anime_cid}`
      : `https://api.dicebear.com/9.x/adventurer/svg?seed=${row.id}`

    candidates.push({
      targetType: 'shadow',
      targetId: row.id,
      displayName: row.display_name || 'Anonymous',
      bio: row.bio,
      ageBucket: row.age_bucket,
      genderIdentity: row.gender_identity,
      location: row.location,
      avatarUrl,
      claimedAddress: row.claimed_address,
    })

    // V0: Limit to 5 candidates
    if (candidates.length >= 5) break
  }

  // V0.5 preparation: placeholder Merkle root
  // In V0.5, this will be a real Merkle root over candidate addresses
  const candidateAddresses = candidates
    .map((c) => c.claimedAddress || c.targetId)
    .sort()

  const response: CandidatesResponse = {
    candidates,
    meta: {
      // Placeholder: In V0.5, compute real Merkle root
      candidateSetRoot: '0x' + '0'.repeat(64),
      nonce: Date.now(),
      expiry: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      maxLikes: 5,
    },
  }

  return c.json(response)
})

export default app
