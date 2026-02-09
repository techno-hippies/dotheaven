/**
 * Session Voice — CF Worker entrypoint
 *
 * Routes:
 *   /auth/*      — nonce-based JWT auth
 *   /credits/*   — credit ledger
 *   /rooms/*     — free voice rooms
 *   /session/*   — booked sessions (backward-compatible)
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { authRoutes } from './routes/auth'
import { creditRoutes } from './routes/credits'
import { roomRoutes } from './routes/rooms'
import { sessionRoutes } from './routes/sessions'

export { RoomDO } from './room-do'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

app.get('/health', (c) => c.json({ ok: true }))

app.route('/auth', authRoutes)
app.route('/credits', creditRoutes)
app.route('/rooms', roomRoutes)
app.route('/session', sessionRoutes)

export default app
