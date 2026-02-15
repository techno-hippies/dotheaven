/**
 * Heaven API Worker
 *
 * Cloudflare Worker handling:
 * - /api/candidates - Get candidate profiles for swiping
 * - /api/likes - Submit likes, detect matches
 * - /api/claim/* - Profile claim flow
 * - /api/self/* - Self.xyz identity verification
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'

import candidates from './routes/candidates'
import likes from './routes/likes'
import claim from './routes/claim'
import names from './routes/names'
import scrobble from './routes/scrobble'
import sleep from './routes/sleep'
import photos from './routes/photos'
import meal from './routes/meal'
import self from './routes/self'
import wallet from './routes/wallet'
import upload from './routes/upload'
import load from './routes/load'
import arweave from './routes/arweave'

const app = new Hono<{ Bindings: Env }>()

// CORS for frontend + mobile
app.use('/*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173', 'https://heaven.computer', 'https://heaven.xyz'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-Pkp', 'X-Claim-Start-Secret'],
}))

// Health check
app.get('/health', (c) => c.json({ ok: true }))

// Mount routes
app.route('/api/candidates', candidates)
app.route('/api/likes', likes)
app.route('/api/claim', claim)
app.route('/api/names', names)
app.route('/api/scrobble', scrobble)
app.route('/api/sleep', sleep)
app.route('/api/photos', photos)
app.route('/api/meal', meal)
app.route('/api/self', self)
app.route('/api/wallet', wallet)
app.route('/api/upload', upload)
app.route('/api/load', load)
app.route('/api/arweave', arweave)

// 404 fallback
app.notFound((c) => c.json({ error: 'Not found' }, 404))

// Error handler
app.onError((err, c) => {
  console.error('[API Error]', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
