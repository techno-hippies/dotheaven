import { describe, expect, test } from 'bun:test'
import type { Env } from './types'
import { settlePaymentWithFacilitator, type PaymentRequirement } from './x402-facilitator'

function toBase64Json(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function makeRequirement(resource = '/duet/demo/enter'): PaymentRequirement {
  return {
    scheme: 'exact',
    network: 'eip155:8453',
    asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    amount: '100000',
    payTo: '0x1111111111111111111111111111111111111111',
    resource,
  }
}

function makeMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...overrides,
    X402_FACILITATOR_MODE: 'mock',
  } as Env
}

describe('x402 facilitator adapter', () => {
  test('mock mode settles valid payment claims', async () => {
    const env = makeMockEnv()
    const requirement = makeRequirement()
    const signature = toBase64Json({
      network: requirement.network,
      asset: requirement.asset,
      amount: requirement.amount,
      payTo: requirement.payTo,
      wallet: '0x2222222222222222222222222222222222222222',
      resource: requirement.resource,
    })

    const result = await settlePaymentWithFacilitator(env, signature, requirement)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.facilitator).toBe('mock')
    expect(result.payer).toBe('0x2222222222222222222222222222222222222222')
  })

  test('mock mode rejects amount mismatch', async () => {
    const env = makeMockEnv()
    const requirement = makeRequirement()
    const signature = toBase64Json({
      network: requirement.network,
      asset: requirement.asset,
      amount: '200000',
      payTo: requirement.payTo,
      wallet: '0x2222222222222222222222222222222222222222',
      resource: requirement.resource,
    })

    const result = await settlePaymentWithFacilitator(env, signature, requirement)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('payment_amount_mismatch')
  })

  test('cdp mode posts settle request with mapped network and returns payer', async () => {
    const requestBodies: any[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = init?.body
      requestBodies.push(raw ? JSON.parse(String(raw)) : null)
      return Response.json({
        success: true,
        payer: '0x3333333333333333333333333333333333333333',
        transactionHash: '0xabc',
      })
    }) as typeof fetch

    try {
      const env = {
        X402_FACILITATOR_MODE: 'cdp',
        X402_FACILITATOR_BASE_URL: 'http://localhost:8789',
        X402_FACILITATOR_AUTH_TOKEN: 'test-token',
      } as Env

      const requirement = makeRequirement('/duet/demo/replay')
      const signature = toBase64Json({
        any: 'payload',
      })

      const result = await settlePaymentWithFacilitator(env, signature, requirement)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.facilitator).toBe('cdp')
      expect(result.payer).toBe('0x3333333333333333333333333333333333333333')
      expect(result.transactionHash).toBe('0xabc')

      expect(requestBodies.length).toBe(1)
      expect(requestBodies[0].x402Version).toBe(2)
      expect(requestBodies[0].paymentRequirements.network).toBe('base')
      expect(requestBodies[0].paymentRequirements.maxAmountRequired).toBe(requirement.amount)
      expect(requestBodies[0].paymentRequirements.payTo).toBe(requirement.payTo)
      expect(requestBodies[0].paymentRequirements.resource).toBe(requirement.resource)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('cdp mode surfaces settlement failure', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      return Response.json(
        { success: false, error: { code: 'PAYMENT_REJECTED' } },
        { status: 402 },
      )
    }) as typeof fetch

    try {
      const env = {
        X402_FACILITATOR_MODE: 'cdp',
        X402_FACILITATOR_BASE_URL: 'http://localhost:8789',
        X402_FACILITATOR_AUTH_TOKEN: 'test-token',
      } as Env

      const requirement = makeRequirement()
      const signature = toBase64Json({ any: 'payload' })

      const result = await settlePaymentWithFacilitator(env, signature, requirement)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('PAYMENT_REJECTED')
      expect(result.status).toBe(402)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('cdp mode rejects ambiguous success payloads', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      return Response.json(
        { transactionHash: '0xabc' },
        { status: 200 },
      )
    }) as typeof fetch

    try {
      const env = {
        X402_FACILITATOR_MODE: 'cdp',
        X402_FACILITATOR_BASE_URL: 'http://localhost:8789',
        X402_FACILITATOR_AUTH_TOKEN: 'test-token',
      } as Env

      const requirement = makeRequirement()
      const signature = toBase64Json({ any: 'payload' })

      const result = await settlePaymentWithFacilitator(env, signature, requirement)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('payment_settlement_not_explicitly_confirmed')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
