/**
 * Session Voice — CF Worker entrypoint
 *
 * Routes:
 *   /auth/*      — nonce-based JWT auth
 *   /credits/*   — credit ledger
 *   /rooms/*     — free voice rooms
 *   /session/*   — booked sessions (backward-compatible)
 *   /duet/*      — paid duet rooms (x402-ready control plane)
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { authRoutes } from './routes/auth'
import { creditRoutes } from './routes/credits'
import { roomRoutes } from './routes/rooms'
import { sessionRoutes } from './routes/sessions'
import { duetRoutes } from './routes/duet'
import { songRoutes } from './routes/songs'

export { RoomDO } from './room-do'
export { DuetRoomDO } from './duet-room-do'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({
  allowHeaders: ['Content-Type', 'Authorization', 'PAYMENT-SIGNATURE'],
  exposeHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE'],
}))

app.get('/health', (c) => c.json({ ok: true }))

app.route('/auth', authRoutes)
app.route('/credits', creditRoutes)
app.route('/rooms', roomRoutes)
app.route('/session', sessionRoutes)
app.route('/duet', duetRoutes)
app.route('/songs', songRoutes)

export default app
