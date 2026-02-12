import type { Env } from './types'

export type NetworkId = 'eip155:8453' | 'eip155:84532'

export interface PaymentRequirement {
  scheme: 'exact'
  network: NetworkId
  asset: string
  amount: string
  payTo: string
  resource: string
}

export type SettleResult =
  | {
      ok: true
      facilitator: 'mock' | 'cdp'
      payer?: string
      transactionHash?: string
      raw?: unknown
    }
  | {
      ok: false
      reason: string
      status?: number
      raw?: unknown
    }

interface PaymentSignatureClaims {
  network: string
  asset: string
  amount: string
  payTo: string
  wallet?: string
  resource?: string
}

const DEFAULT_CDP_BASE_URL = 'https://api.cdp.coinbase.com/platform/v2/x402'

export async function settlePaymentWithFacilitator(
  env: Env,
  paymentSignatureRaw: string,
  requirement: PaymentRequirement,
): Promise<SettleResult> {
  const mode = env.X402_FACILITATOR_MODE ?? 'mock'
  if (mode === 'mock') {
    return settleMock(paymentSignatureRaw, requirement)
  }
  if (mode === 'cdp') {
    return settleWithCdp(env, paymentSignatureRaw, requirement)
  }
  return { ok: false, reason: 'unsupported_facilitator_mode' }
}

function settleMock(paymentSignatureRaw: string, requirement: PaymentRequirement): SettleResult {
  const claims = parsePaymentSignatureClaims(paymentSignatureRaw)
  if (!claims) return { ok: false, reason: 'invalid_payment_signature_format' }

  if (claims.network !== requirement.network) return { ok: false, reason: 'payment_network_mismatch' }
  if (claims.asset.toLowerCase() !== requirement.asset.toLowerCase()) return { ok: false, reason: 'payment_asset_mismatch' }
  if (claims.amount !== requirement.amount) return { ok: false, reason: 'payment_amount_mismatch' }
  if (claims.payTo.toLowerCase() !== requirement.payTo.toLowerCase()) return { ok: false, reason: 'payment_payto_mismatch' }

  if (claims.resource) {
    const claimed = normalizeResource(claims.resource)
    const expected = normalizeResource(requirement.resource)
    if (claimed !== expected) return { ok: false, reason: 'payment_resource_mismatch' }
  }

  return {
    ok: true,
    facilitator: 'mock',
    payer: claims.wallet?.toLowerCase(),
    raw: { mock: true },
  }
}

async function settleWithCdp(env: Env, paymentSignatureRaw: string, requirement: PaymentRequirement): Promise<SettleResult> {
  const paymentPayload = tryParseBase64Json(paymentSignatureRaw) ?? tryParseJson(paymentSignatureRaw)
  if (!paymentPayload) return { ok: false, reason: 'invalid_payment_signature_format' }

  const baseUrl = (env.X402_FACILITATOR_BASE_URL || DEFAULT_CDP_BASE_URL).replace(/\/+$/, '')
  const authToken = env.X402_FACILITATOR_AUTH_TOKEN
  if (!authToken) return { ok: false, reason: 'facilitator_auth_not_configured' }

  const paymentRequirements = {
    scheme: requirement.scheme,
    network: toFacilitatorNetwork(requirement.network),
    asset: requirement.asset,
    payTo: requirement.payTo,
    maxAmountRequired: requirement.amount,
    resource: requirement.resource,
  }

  const reqBody = {
    x402Version: 2,
    paymentPayload,
    paymentRequirements,
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(reqBody),
    })
  } catch {
    return { ok: false, reason: 'facilitator_unreachable' }
  }

  let payload: any = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  if (!res.ok) {
    return {
      ok: false,
      reason: readFacilitatorError(payload) || `facilitator_http_${res.status}`,
      status: res.status,
      raw: payload,
    }
  }

  const success = isExplicitSettlementSuccess(payload)
  if (!success) {
    return {
      ok: false,
      reason: readFacilitatorError(payload) || 'payment_settlement_not_explicitly_confirmed',
      raw: payload,
    }
  }

  const payer = firstString(
    payload?.payer,
    payload?.from,
    payload?.paymentPayload?.payer,
    payload?.paymentPayload?.from,
    payload?.paymentPayload?.wallet,
  )

  const transactionHash = firstString(
    payload?.transactionHash,
    payload?.transaction_hash,
    payload?.txHash,
    payload?.tx_hash,
    payload?.receipt?.transactionHash,
  )

  return {
    ok: true,
    facilitator: 'cdp',
    payer: payer?.toLowerCase(),
    transactionHash,
    raw: payload,
  }
}

function toFacilitatorNetwork(network: NetworkId): string {
  if (network === 'eip155:8453') return 'base'
  if (network === 'eip155:84532') return 'base-sepolia'
  return network
}

function readFacilitatorError(payload: any): string | null {
  return firstString(
    payload?.error?.code,
    payload?.error?.message,
    payload?.error,
    payload?.message,
    payload?.reason,
  ) ?? null
}

function isExplicitSettlementSuccess(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false

  if (payload.success === true) return true
  if (payload.settled === true) return true

  const status = firstString(payload.status, payload.result, payload.state)?.toLowerCase()
  if (!status) return false

  return status === 'settled' || status === 'success' || status === 'paid'
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function parsePaymentSignatureClaims(rawHeader: string): PaymentSignatureClaims | null {
  const decoded = tryParseBase64Json(rawHeader) ?? tryParseJson(rawHeader)
  if (!decoded || typeof decoded !== 'object') return null

  const maybeClaims = (decoded as any).claims
  const source = (maybeClaims && typeof maybeClaims === 'object') ? maybeClaims : decoded as any

  const network = source.network
  const asset = source.asset
  const amount = source.amount
  const payTo = source.payTo ?? source.pay_to ?? source.recipient
  const wallet = source.wallet ?? source.payer ?? source.from
  const resource = source.resource

  if (typeof network !== 'string') return null
  if (typeof asset !== 'string') return null
  if (typeof amount !== 'string') return null
  if (typeof payTo !== 'string') return null

  return {
    network,
    asset,
    amount,
    payTo,
    wallet: typeof wallet === 'string' ? wallet : undefined,
    resource: typeof resource === 'string' ? resource : undefined,
  }
}

function tryParseJson(input: string): any | null {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

function tryParseBase64Json(input: string): any | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4
    const padded = normalized + (pad ? '='.repeat(4 - pad) : '')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function normalizeResource(resource: string): string {
  try {
    if (resource.includes('://')) {
      return new URL(resource).pathname
    }
  } catch {
    // fall through
  }
  return resource.startsWith('/') ? resource : `/${resource}`
}
