/**
 * Session Service — sends escrow transactions from the user's PKP via PKPEthersSigner.
 *
 * Pattern follows filecoin-upload-service.ts: lazy-init a signer, encode calldata
 * via the escrow module, and send legacy type-0 transactions to MegaETH.
 */

import { ethers } from 'ethers'
import { PKPEthersSigner } from './lit/pkp-ethers-signer'
import type { PKPInfo, PKPAuthContext } from './lit/types'
import {
  encodeSetBasePrice,
  encodeCreateSlot,
  encodeCreateSlots,
  encodeCancelSlot,
  encodeBook,
  encodeCancelBookingAsGuest,
  encodeCancelBookingAsHost,
  encodeCreateRequest,
  SESSION_ESCROW_V1,
  type SlotInput,
} from './heaven/escrow'
import { megaTestnetV2 } from './chains'

// ── MegaETH gas defaults ────────────────────────────────────────
const GAS_PRICE = 1_000_000n
const GAS_LIMIT = 3_000_000n

// ── Module state ────────────────────────────────────────────────

let _getAuthContext: (() => Promise<PKPAuthContext>) | null = null
let _getPkp: (() => PKPInfo | null) | null = null
let _signer: PKPEthersSigner | null = null
let _signerAddress: string | null = null

const provider = new ethers.JsonRpcProvider(megaTestnetV2.rpcUrls.default.http[0])

export function initSessionService(deps: {
  getAuthContext: () => Promise<PKPAuthContext>
  getPkp: () => PKPInfo | null
}) {
  _getAuthContext = deps.getAuthContext
  _getPkp = deps.getPkp
  _signer = null
  _signerAddress = null
}

async function getSigner(): Promise<PKPEthersSigner> {
  if (!_getAuthContext || !_getPkp) throw new Error('Session service not initialized')
  const pkp = _getPkp()
  if (!pkp) throw new Error('No PKP available — sign in first')

  // Cache signer if same PKP address
  if (_signer && _signerAddress === pkp.ethAddress) return _signer

  const authContext = await _getAuthContext()
  _signer = new PKPEthersSigner(pkp, authContext, provider)
  _signerAddress = pkp.ethAddress
  return _signer
}

async function sendTx(data: string, value?: bigint): Promise<{ txHash: string }> {
  const signer = await getSigner()
  const tx = await signer.sendTransaction({
    to: SESSION_ESCROW_V1,
    data,
    value: value ?? 0n,
    gasPrice: GAS_PRICE,
    gasLimit: GAS_LIMIT,
  })
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) throw new Error('Transaction reverted')
  return { txHash: tx.hash }
}

// ── Host operations ─────────────────────────────────────────────

export async function setBasePrice(priceEth: string): Promise<{ txHash: string }> {
  return sendTx(encodeSetBasePrice(priceEth))
}

export async function createSlot(input: SlotInput): Promise<{ txHash: string }> {
  return sendTx(encodeCreateSlot(input))
}

export async function createSlots(inputs: SlotInput[]): Promise<{ txHash: string }> {
  return sendTx(encodeCreateSlots(inputs))
}

export async function cancelSlot(slotId: number): Promise<{ txHash: string }> {
  return sendTx(encodeCancelSlot(slotId))
}

// ── Guest operations ────────────────────────────────────────────

export async function bookSlot(slotId: number, priceWei: bigint): Promise<{ txHash: string }> {
  return sendTx(encodeBook(slotId), priceWei)
}

export async function createRequest(params: {
  hostTarget: `0x${string}`
  windowStart: number
  windowEnd: number
  durationMins: number
  expiry: number
  amountWei: bigint
}): Promise<{ txHash: string }> {
  return sendTx(
    encodeCreateRequest({
      hostTarget: params.hostTarget,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      durationMins: params.durationMins,
      expiry: params.expiry,
    }),
    params.amountWei,
  )
}

// ── Either party ────────────────────────────────────────────────

export async function cancelBooking(bookingId: number, isHost: boolean): Promise<{ txHash: string }> {
  const data = isHost
    ? encodeCancelBookingAsHost(bookingId)
    : encodeCancelBookingAsGuest(bookingId)
  return sendTx(data)
}
