/**
 * Heaven x402 facilitator (Base Sepolia only, USDC only).
 *
 * Implements a CDP-style `/settle` endpoint compatible with session-voice's
 * `X402_FACILITATOR_MODE=cdp|self`.
 *
 * This facilitator:
 * - verifies x402 Exact scheme payments (EIP-3009 TransferWithAuthorization)
 * - settles them on-chain as a relayer (pays gas)
 * - does not custody user funds (payer -> payTo directly)
 */

import { x402Facilitator } from '@x402/core/facilitator'
import { toFacilitatorEvmSigner } from '@x402/evm'
import { registerExactEvmScheme } from '@x402/evm/exact/facilitator'
import { createWalletClient, http, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const BASE_SEPOLIA_NETWORK = 'eip155:84532'
const BASE_SEPOLIA_USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const USDC_EIP712 = { name: 'USDC', version: '2', assetTransferMethod: 'eip3009' } as const

const HOST = (process.env.FACILITATOR_HOST || process.env.HOST || '0.0.0.0').trim()
const PORT = Number((process.env.FACILITATOR_PORT || process.env.PORT || '3340').trim())
if (!Number.isFinite(PORT) || PORT <= 0) {
  throw new Error(`Invalid FACILITATOR_PORT/PORT: ${String(process.env.FACILITATOR_PORT || process.env.PORT || '')}`)
}

const AUTH_TOKEN = (
  process.env.FACILITATOR_AUTH_TOKEN
  || process.env.X402_FACILITATOR_AUTH_TOKEN
  || ''
).trim()
if (!AUTH_TOKEN) {
  throw new Error('Missing FACILITATOR_AUTH_TOKEN (or X402_FACILITATOR_AUTH_TOKEN)')
}

const rpcUrl = (
  process.env.FACILITATOR_RPC_URL
  || process.env.RPC_URL
  || process.env.HEAVEN_BASE_SEPOLIA_RPC_URL
  || 'https://sepolia.base.org'
).trim()

const facilitatorPrivateKey = (
  process.env.FACILITATOR_PRIVATE_KEY
  || process.env.X402_EVM_PRIVATE_KEY
  || process.env.EVM_PRIVATE_KEY
  || process.env.PRIVATE_KEY
  || ''
).trim()

if (!/^0x[a-fA-F0-9]{64}$/.test(facilitatorPrivateKey)) {
  throw new Error('Missing or invalid facilitator private key. Set FACILITATOR_PRIVATE_KEY.')
}

function jsonError(status: number, message: string, code?: string): Response {
  return Response.json(
    { success: false, error: { code: code || message, message } },
    { status },
  )
}

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function isUsdcBaseUnits(value: unknown): value is string {
  // USDC has 6 decimals but this is "base units" (uint256); just require digits here.
  return typeof value === 'string' && /^\d+$/.test(value)
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
      return Response.json({
        ok: true,
        network: BASE_SEPOLIA_NETWORK,
        usdc: BASE_SEPOLIA_USDC,
        rpcUrl,
        signer: account.address.toLowerCase(),
      })
    }

    if (req.method === 'GET' && url.pathname === '/supported') {
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

      if (!isAddress(asset) || !isAddress(payTo) || !isUsdcBaseUnits(amount)) {
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

console.log(`[x402-facilitator] listening on http://${server.hostname}:${server.port}`)
console.log(`[x402-facilitator] network=${BASE_SEPOLIA_NETWORK} usdc=${BASE_SEPOLIA_USDC} rpc=${rpcUrl}`)
console.log(`[x402-facilitator] signer=${account.address.toLowerCase()}`)

