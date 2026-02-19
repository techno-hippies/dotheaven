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
import { runSessionAttestationSweep } from './routes/sessions'

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

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.ORACLE_PRIVATE_KEY) {
      console.log(`[session/attest-sweep] skip cron=${controller.cron} reason=oracle_not_configured`)
      return
    }

    ctx.waitUntil((async () => {
      try {
        const summary = await runSessionAttestationSweep(env)
        console.log(
          `[session/attest-sweep] cron=${controller.cron} scanned=${summary.scanned} submitted=${summary.submitted} noop=${summary.noop} failed=${summary.failed} noop_reasons=${JSON.stringify(summary.noopReasons)} failures=${summary.failures.length}`,
        )
        for (const failure of summary.failures) {
          console.error(
            `[session/attest-sweep] booking=${failure.bookingId} error=${failure.error}`,
          )
        }
      } catch (error: any) {
        console.error(`[session/attest-sweep] fatal=${error?.message ?? String(error)}`)
      }
    })())
  },
}
