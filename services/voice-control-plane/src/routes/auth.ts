/**
 * Auth Routes — nonce-based JWT
 *
 * POST /nonce  → { nonce }
 * POST /verify → { token }
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { generateNonce, storeNonce, consumeNonce, verifySignature, createJWT } from '../auth'

export const authRoutes = new Hono<{ Bindings: Env }>()

/** Step 1: Request a nonce */
authRoutes.post('/nonce', async (c) => {
  const body = await c.req.json<{ wallet?: string }>()
  if (!body.wallet) {
    return c.json({ error: 'missing wallet' }, 400)
  }

  const nonce = generateNonce()
  await storeNonce(c.env.DB, body.wallet, nonce)

  return c.json({ nonce })
})

/** Step 2: Sign nonce, get JWT */
authRoutes.post('/verify', async (c) => {
  const body = await c.req.json<{
    wallet?: string
    signature?: `0x${string}`
    nonce?: string
  }>()

  if (!body.wallet || !body.signature || !body.nonce) {
    return c.json({ error: 'missing wallet, signature, or nonce' }, 400)
  }

  // Verify signature first (don't burn nonce on bad sig)
  const sigValid = await verifySignature(body.wallet, body.nonce, body.signature)
  if (!sigValid) {
    return c.json({ error: 'invalid signature' }, 401)
  }

  // Consume nonce (one-time use, 5-min TTL)
  const valid = await consumeNonce(c.env.DB, body.wallet, body.nonce)
  if (!valid) {
    return c.json({ error: 'invalid or expired nonce' }, 401)
  }

  const token = await createJWT(body.wallet, c.env.JWT_SECRET)
  return c.json({ token })
})
