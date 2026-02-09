/**
 * Credit Routes
 *
 * GET  /          → current balance
 * POST /verify-celo → grant Celo bonus if verified on-chain
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { verifyJWT } from '../auth'
import { getBalance, grantCeloBonus } from '../credits'
import { isVerified } from '../registry'

export const creditRoutes = new Hono<{ Bindings: Env; Variables: { wallet: string } }>()

/** Auth middleware */
creditRoutes.use('*', async (c, next) => {
  const auth = c.req.header('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const payload = await verifyJWT(auth.slice(7), c.env.JWT_SECRET)
  if (!payload) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  c.set('wallet', payload.sub)
  await next()
})

/** GET / — current credit balance */
creditRoutes.get('/', async (c) => {
  const wallet = c.get('wallet') as string
  const balance = await getBalance(c.env.DB, wallet)
  return c.json(balance)
})

/** POST /verify-celo — grant Celo bonus if verified on-chain */
creditRoutes.post('/verify-celo', async (c) => {
  const wallet = c.get('wallet') as string

  // Query VerificationMirror on MegaETH
  const verified = await isVerified(
    c.env.RPC_URL,
    c.env.VERIFICATION_MIRROR_ADDRESS,
    wallet,
  )

  if (!verified) {
    return c.json({ error: 'not_verified', granted: false }, 403)
  }

  const result = await grantCeloBonus(c.env.DB, wallet)
  return c.json(result)
})
