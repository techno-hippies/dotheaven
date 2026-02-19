/**
 * SessionEscrowV1 Contract Client (CF Worker)
 *
 * Adapted from Bun version: no module-level clients,
 * accepts rpcUrl/escrowAddress/chainId from Env.
 */

import { createPublicClient, createWalletClient, http, type Address, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
const MOCK_HOST = '0x000000000000000000000000000000000000dEaD' as Address
const MOCK_GUEST = '0x0000000000000000000000000000000000000001' as Address

const escrowAbi = [
  {
    name: 'getSlot',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'slotId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'host', type: 'address' },
        { name: 'startTime', type: 'uint48' },
        { name: 'durationMins', type: 'uint32' },
        { name: 'price', type: 'uint256' },
        { name: 'graceMins', type: 'uint32' },
        { name: 'minOverlapMins', type: 'uint32' },
        { name: 'cancelCutoffMins', type: 'uint32' },
        { name: 'status', type: 'uint8' },
      ],
    }],
  },
  {
    name: 'getBooking',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'bookingId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'slotId', type: 'uint256' },
        { name: 'guest', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'oracleOutcome', type: 'uint8' },
        { name: 'metricsHash', type: 'bytes32' },
        { name: 'attestedAt', type: 'uint64' },
        { name: 'finalizableAt', type: 'uint64' },
        { name: 'challenger', type: 'address' },
        { name: 'bondAmount', type: 'uint256' },
        { name: 'disputedAt', type: 'uint64' },
      ],
    }],
  },
  {
    name: 'attest',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bookingId', type: 'uint256' },
      { name: 'outcome', type: 'uint8' },
      { name: 'metricsHash', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

export enum BookingStatus {
  None = 0,
  Booked = 1,
  Cancelled = 2,
  Attested = 3,
  Disputed = 4,
  Resolved = 5,
  Finalized = 6,
}

export enum SlotStatus {
  Open = 0,
  Booked = 1,
  Cancelled = 2,
  Settled = 3,
}

export enum Outcome {
  None = 0,
  Completed = 1,
  NoShowHost = 2,
  NoShowGuest = 3,
  CancelledByHost = 4,
  CancelledByGuest = 5,
}

export interface Slot {
  host: Address
  startTime: number
  durationMins: number
  price: bigint
  graceMins: number
  minOverlapMins: number
  cancelCutoffMins: number
  status: SlotStatus
}

export interface Booking {
  slotId: bigint
  guest: Address
  amount: bigint
  status: BookingStatus
  oracleOutcome: number
  metricsHash: `0x${string}`
  attestedAt: number
  finalizableAt: number
  challenger: Address
  bondAmount: bigint
  disputedAt: number
}

export interface AttestMetrics {
  hostJoinedAt: number
  hostLeftAt: number
  guestJoinedAt: number
  guestLeftAt: number
  overlapSeconds: number
}

function getReadClient(rpcUrl: string) {
  return createPublicClient({ transport: http(rpcUrl) })
}

export async function getSlot(
  rpcUrl: string,
  escrowAddress: string,
  slotId: bigint,
  mock?: boolean,
): Promise<Slot | null> {
  if (mock) {
    const now = Math.floor(Date.now() / 1000)
    return {
      host: MOCK_HOST,
      startTime: now - 60,
      durationMins: 30,
      price: 0n,
      graceMins: 5,
      minOverlapMins: 10,
      cancelCutoffMins: 30,
      status: SlotStatus.Booked,
    }
  }

  try {
    const client = getReadClient(rpcUrl)
    const result = await client.readContract({
      address: escrowAddress as Address,
      abi: escrowAbi,
      functionName: 'getSlot',
      args: [slotId],
    })

    if (result.host.toLowerCase() === ZERO_ADDRESS) return null

    return {
      host: result.host,
      startTime: Number(result.startTime),
      durationMins: Number(result.durationMins),
      price: result.price,
      graceMins: Number(result.graceMins),
      minOverlapMins: Number(result.minOverlapMins),
      cancelCutoffMins: Number(result.cancelCutoffMins),
      status: result.status as SlotStatus,
    }
  } catch {
    return null
  }
}

export async function getBooking(
  rpcUrl: string,
  escrowAddress: string,
  bookingId: bigint,
  mock?: boolean,
): Promise<Booking | null> {
  if (mock) {
    return {
      slotId: 1n,
      guest: MOCK_GUEST,
      amount: 1000000000000000n,
      status: BookingStatus.Booked,
      oracleOutcome: 0,
      metricsHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      attestedAt: 0,
      finalizableAt: 0,
      challenger: ZERO_ADDRESS,
      bondAmount: 0n,
      disputedAt: 0,
    }
  }

  try {
    const client = getReadClient(rpcUrl)
    const result = await client.readContract({
      address: escrowAddress as Address,
      abi: escrowAbi,
      functionName: 'getBooking',
      args: [bookingId],
    })

    if (result.status === BookingStatus.None) return null

    return {
      slotId: result.slotId,
      guest: result.guest,
      amount: result.amount,
      status: result.status as BookingStatus,
      oracleOutcome: result.oracleOutcome,
      metricsHash: result.metricsHash,
      attestedAt: Number(result.attestedAt),
      finalizableAt: Number(result.finalizableAt),
      challenger: result.challenger,
      bondAmount: result.bondAmount,
      disputedAt: Number(result.disputedAt),
    }
  } catch {
    return null
  }
}

export function computeMetricsHash(bookingId: string, metrics: AttestMetrics): `0x${string}` {
  const encoded = toHex(
    JSON.stringify({
      bookingId,
      hostJoinedAt: metrics.hostJoinedAt,
      hostLeftAt: metrics.hostLeftAt,
      guestJoinedAt: metrics.guestJoinedAt,
      guestLeftAt: metrics.guestLeftAt,
      overlapSeconds: metrics.overlapSeconds,
    })
  )
  return keccak256(encoded)
}

export async function attestOutcome(
  rpcUrl: string,
  escrowAddress: string,
  chainId: number,
  oraclePrivateKey: string,
  bookingId: bigint,
  outcome: Outcome,
  metricsHash: `0x${string}`,
  mock?: boolean,
): Promise<{ txHash: `0x${string}` } | { error: string }> {
  if (mock) {
    return { txHash: '0x0000000000000000000000000000000000000000000000000000000000000001' }
  }

  try {
    const account = privateKeyToAccount(oraclePrivateKey as `0x${string}`)
    const wc = createWalletClient({
      account,
      transport: http(rpcUrl),
    })

    const txHash = await wc.writeContract({
      address: escrowAddress as Address,
      abi: escrowAbi,
      functionName: 'attest',
      args: [bookingId, outcome, metricsHash],
      chain: {
        id: chainId,
        name: 'tempo-moderato',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      },
    })

    return { txHash }
  } catch (e: any) {
    return { error: e.message || 'attestation failed' }
  }
}
