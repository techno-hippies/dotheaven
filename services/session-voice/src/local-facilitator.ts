/**
 * Local x402 facilitator (Base Sepolia only).
 *
 * This is a tiny HTTP server that implements the subset of the CDP-style
 * `/settle` API that session-voice calls in `X402_FACILITATOR_MODE=cdp`.
 *
 * Why this exists:
 * - To run "real" (on-chain) x402 Exact payments in local e2e without needing
 *   a CDP facilitator auth token.
 * - Locked to Base Sepolia USDC only (no mainnet).
 *
 * Usage:
 *   LOCAL_FACILITATOR_AUTH_TOKEN=local \
 *   DUET_TEST_PAYER_PRIVATE_KEY=0x... \
 *   bun src/local-facilitator.ts
 */

import { x402Facilitator } from '@x402/core/facilitator'
import { registerExactEvmScheme } from '@x402/evm/exact/facilitator'
import { toFacilitatorEvmSigner } from '@x402/evm'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { createWalletClient, http, publicActions } from 'viem'

const BASE_SEPOLIA_NETWORK = 'eip155:84532'
const BASE_SEPOLIA_USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const USDC_EIP712 = { name: 'USDC', version: '2', assetTransferMethod: 'eip3009' } as const

const HOST = (process.env.LOCAL_FACILITATOR_HOST || '127.0.0.1').trim()
const PORT = Number((process.env.LOCAL_FACILITATOR_PORT || '3340').trim())
if (!Number.isFinite(PORT) || PORT <= 0) {
  throw new Error(`Invalid LOCAL_FACILITATOR_PORT: ${String(process.env.LOCAL_FACILITATOR_PORT || '')}`)
}

const AUTH_TOKEN = (
  process.env.LOCAL_FACILITATOR_AUTH_TOKEN
  || process.env.X402_FACILITATOR_AUTH_TOKEN
  || ''
).trim()
if (!AUTH_TOKEN) {
  throw new Error('Missing LOCAL_FACILITATOR_AUTH_TOKEN (or X402_FACILITATOR_AUTH_TOKEN)')
}

const rpcUrl = (
  process.env.DUET_TEST_RPC_URL
  || process.env.HEAVEN_BASE_SEPOLIA_RPC_URL
  || 'https://sepolia.base.org'
).trim()

const facilitatorPrivateKey = (
  process.env.DUET_TEST_FACILITATOR_PRIVATE_KEY
  || process.env.DUET_TEST_PAYER_PRIVATE_KEY
  || process.env.X402_EVM_PRIVATE_KEY
  || process.env.EVM_PRIVATE_KEY
  || process.env.PRIVATE_KEY
  || ''
).trim()

if (!/^0x[a-fA-F0-9]{64}$/.test(facilitatorPrivateKey)) {
  throw new Error('Missing or invalid facilitator private key. Set DUET_TEST_FACILITATOR_PRIVATE_KEY (or DUET_TEST_PAYER_PRIVATE_KEY).')
}

function jsonError(status: number, message: string, code?: string): Response {
  return Response.json(
    { success: false, error: { code: code || message, message } },
    { status },
  )
}

function toCaipNetwork(network: unknown): string | null {
  if (typeof network !== 'string') return null
  if (network.startsWith('eip155:')) return network
  if (network === 'base-sepolia') return 'eip155:84532'
  if (network === 'base') return 'eip155:8453'
  return null
}

const account = privateKeyToAccount(facilitatorPrivateKey as `0x${string}`)
const wallet = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(rpcUrl),
}).extend(publicActions)

const facilitator = new x402Facilitator()
registerExactEvmScheme(facilitator, {
  signer: toFacilitatorEvmSigner(wallet),
  networks: BASE_SEPOLIA_NETWORK,
})

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch: async (req) => {
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true })
    }

    if (req.method === 'GET' && url.pathname === '/supported') {
      // Useful when debugging; not required by session-voice.
      return Response.json(facilitator.getSupported())
    }

    if (req.method === 'POST' && url.pathname === '/settle') {
      const auth = (req.headers.get('Authorization') || '').trim()
      if (auth !== `Bearer ${AUTH_TOKEN}`) {
        return jsonError(401, 'unauthorized')
      }

      let body: any = null
      try {
        body = await req.json()
      } catch {
        return jsonError(400, 'invalid_json')
      }

      if (body?.x402Version !== 2) return jsonError(400, 'unsupported_x402_version')
      const paymentPayload = body?.paymentPayload
      const pr = body?.paymentRequirements
      if (!paymentPayload || typeof paymentPayload !== 'object') return jsonError(400, 'missing_paymentPayload')
      if (!pr || typeof pr !== 'object') return jsonError(400, 'missing_paymentRequirements')

      if (pr.scheme !== 'exact') return jsonError(400, 'unsupported_scheme')

      const asset = pr.asset
      const payTo = pr.payTo
      const amount = pr.maxAmountRequired ?? pr.amount
      const resource = pr.resource

      if (typeof asset !== 'string' || typeof payTo !== 'string' || typeof amount !== 'string') {
        return jsonError(400, 'invalid_paymentRequirements')
      }

      // Safety: USDC-only, Base Sepolia-only.
      if (asset.toLowerCase() !== BASE_SEPOLIA_USDC) return jsonError(400, 'asset_not_allowed')

      const acceptedNetwork = toCaipNetwork(paymentPayload?.accepted?.network)
      const requestedNetwork = toCaipNetwork(pr.network)
      const network = acceptedNetwork || requestedNetwork
      if (network !== BASE_SEPOLIA_NETWORK) return jsonError(400, 'network_not_allowed')

      const requirements = {
        scheme: 'exact' as const,
        network,
        asset,
        amount,
        payTo,
        resource: typeof resource === 'string' ? resource : '/',
        maxTimeoutSeconds: 60 * 60,
        extra: USDC_EIP712,
      }

      let verify: any = null
      try {
        verify = await facilitator.verify(paymentPayload, requirements as any)
      } catch (err: any) {
        return jsonError(400, `verify_failed: ${String(err?.message || err)}`.slice(0, 500), 'verify_failed')
      }

      if (!verify?.isValid) {
        const reason = String(verify?.invalidReason || 'invalid_payment')
        const msg = String(verify?.invalidMessage || reason)
        return jsonError(400, msg.slice(0, 500), reason.slice(0, 200))
      }

      let settle: any = null
      try {
        settle = await facilitator.settle(paymentPayload, requirements as any)
      } catch (err: any) {
        return jsonError(400, `settle_failed: ${String(err?.message || err)}`.slice(0, 500), 'settle_failed')
      }

      if (!settle?.success) {
        const reason = String(settle?.errorReason || 'settlement_failed')
        return jsonError(400, reason.slice(0, 500), reason.slice(0, 200))
      }

      return Response.json({
        success: true,
        settled: true,
        status: 'settled',
        network,
        payer: settle?.payer,
        transactionHash: settle?.transaction,
      })
    }

    return jsonError(404, 'not_found')
  },
})

console.log(`[local-facilitator] listening on http://${server.hostname}:${server.port}`)
console.log(`[local-facilitator] network=${BASE_SEPOLIA_NETWORK} usdc=${BASE_SEPOLIA_USDC} rpc=${rpcUrl}`)
console.log(`[local-facilitator] signer=${account.address.toLowerCase()}`)

