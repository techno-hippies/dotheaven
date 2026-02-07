import { Hono } from 'hono'
import type { Env, LikeRequest, LikeResponse, ShadowProfileRow } from '../types'

const app = new Hono<{ Bindings: Env }>()

/**
 * POST /api/likes
 *
 * Records a like from viewer to target. Detects mutual likes and creates matches.
 *
 * Mutual match conditions:
 * - Both parties have liked each other
 * - Both parties have PKP addresses (claimed users)
 *
 * If target is a shadow profile that hasn't claimed yet, the like is stored
 * but no match is created until the shadow profile claims.
 */
app.post('/', async (c) => {
  let body: LikeRequest
  try {
    body = await c.req.json<LikeRequest>()
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' } as LikeResponse, 400)
  }

  const { viewerAddress, targetType, targetId } = body

  // Validate viewer address
  if (!viewerAddress || !/^0x[a-f0-9]{40}$/i.test(viewerAddress)) {
    return c.json({ success: false, error: 'Invalid viewer address' } as LikeResponse, 400)
  }

  // Validate target type
  if (!['shadow', 'user'].includes(targetType)) {
    return c.json({ success: false, error: 'Invalid target type' } as LikeResponse, 400)
  }

  // Validate target ID
  if (!targetId) {
    return c.json({ success: false, error: 'Missing target ID' } as LikeResponse, 400)
  }

  if (targetType === 'user' && !/^0x[a-f0-9]{40}$/i.test(targetId)) {
    return c.json({ success: false, error: 'Invalid target address' } as LikeResponse, 400)
  }

  const db = c.env.DB
  const viewerLower = viewerAddress.toLowerCase()
  const now = Date.now()

  // Ensure viewer exists in users table
  await db
    .prepare(`
      INSERT INTO users (address, created_at, last_active_at)
      VALUES (?, ?, ?)
      ON CONFLICT(address) DO UPDATE SET last_active_at = ?
    `)
    .bind(viewerLower, now, now, now)
    .run()

  // Insert like (ignore if duplicate)
  try {
    await db
      .prepare(`
        INSERT INTO likes (liker_address, target_type, target_id, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .bind(viewerLower, targetType, targetId, now)
      .run()
  } catch (e: unknown) {
    // Check if it's a unique constraint violation (already liked)
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
      return c.json({
        success: true,
        mutual: false,
        error: 'Already liked',
      } as LikeResponse)
    }
    throw e
  }

  // Resolve target to address (for match detection)
  let targetAddress: string | null = null

  if (targetType === 'user') {
    targetAddress = targetId.toLowerCase()
  } else {
    // Shadow profile: check if claimed
    const shadowResult = await db
      .prepare(`SELECT claimed_address FROM shadow_profiles WHERE id = ?`)
      .bind(targetId)
      .first<{ claimed_address: string | null }>()

    targetAddress = shadowResult?.claimed_address?.toLowerCase() || null
  }

  // If target doesn't have an address yet (unclaimed shadow), no match possible
  if (!targetAddress) {
    return c.json({
      success: true,
      mutual: false,
    } as LikeResponse)
  }

  // Check for reciprocal like
  // Target must have liked viewer (either by address or by viewer's shadow profile)
  const reciprocalResult = await db
    .prepare(`
      SELECT 1 FROM likes
      WHERE liker_address = ?
        AND (
          (target_type = 'user' AND LOWER(target_id) = ?)
          OR (target_type = 'shadow' AND target_id IN (
            SELECT id FROM shadow_profiles WHERE LOWER(claimed_address) = ?
          ))
        )
      LIMIT 1
    `)
    .bind(targetAddress, viewerLower, viewerLower)
    .first()

  if (!reciprocalResult) {
    return c.json({
      success: true,
      mutual: false,
    } as LikeResponse)
  }

  // Mutual like detected! Create match if not exists
  // Sort addresses for consistent key
  const [user1, user2] =
    viewerLower < targetAddress
      ? [viewerLower, targetAddress]
      : [targetAddress, viewerLower]

  let matchId: number | undefined

  try {
    const matchResult = await db
      .prepare(`
        INSERT INTO matches (user1, user2, created_at)
        VALUES (?, ?, ?)
        RETURNING id
      `)
      .bind(user1, user2, now)
      .first<{ id: number }>()

    matchId = matchResult?.id
  } catch (e: unknown) {
    // Match already exists (shouldn't happen but handle gracefully)
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
      const existingMatch = await db
        .prepare(`SELECT id FROM matches WHERE user1 = ? AND user2 = ?`)
        .bind(user1, user2)
        .first<{ id: number }>()

      matchId = existingMatch?.id
    } else {
      throw e
    }
  }

  return c.json({
    success: true,
    mutual: true,
    peerAddress: targetAddress,
    matchId,
  } as LikeResponse)
})

/**
 * GET /api/likes/received
 *
 * Returns profiles that have liked the viewer (for "Likes You" feature).
 * Only shows likes where the liker has opted to reveal (V0: show all).
 */
app.get('/received', async (c) => {
  const viewer = c.req.query('viewer')?.toLowerCase()

  if (!viewer || !/^0x[a-f0-9]{40}$/i.test(viewer)) {
    return c.json({ error: 'Invalid viewer address' }, 400)
  }

  const db = c.env.DB

  // Get viewer's shadow profile ID (if they have one)
  const viewerShadowResult = await db
    .prepare(`SELECT id FROM shadow_profiles WHERE LOWER(claimed_address) = ?`)
    .bind(viewer)
    .first<{ id: string }>()

  const viewerShadowId = viewerShadowResult?.id

  // Find all likes targeting viewer (by address or shadow ID)
  const likesResult = await db
    .prepare(`
      SELECT l.liker_address, l.created_at,
             sp.display_name, sp.anime_cid
      FROM likes l
      LEFT JOIN shadow_profiles sp ON LOWER(sp.claimed_address) = l.liker_address
      WHERE (l.target_type = 'user' AND LOWER(l.target_id) = ?)
         OR (l.target_type = 'shadow' AND l.target_id = ?)
      ORDER BY l.created_at DESC
      LIMIT 50
    `)
    .bind(viewer, viewerShadowId || '')
    .all<{
      liker_address: string
      created_at: number
      display_name: string | null
      anime_cid: string | null
    }>()

  const likes = (likesResult.results || []).map((row) => ({
    likerAddress: row.liker_address,
    displayName: row.display_name || 'Anonymous',
    avatarUrl: row.anime_cid
      ? `https://ipfs.io/ipfs/${row.anime_cid}`
      : `https://api.dicebear.com/9.x/adventurer/svg?seed=${row.liker_address}`,
    likedAt: row.created_at,
  }))

  return c.json({ likes })
})

export default app
