/**
 * Session Participation Tracking
 *
 * Tracks when users join/leave sessions for oracle attestation.
 * In-memory for now — could be persisted to KV/DB for production.
 */

import type { Address } from 'viem'

interface Participant {
  address: Address
  joinedAt: number   // unix seconds
  leftAt?: number    // unix seconds
}

interface SessionData {
  bookingId: string
  host: Address
  guest: Address
  startTime: number
  endTime: number
  participants: Map<Address, Participant>
}

// In-memory session store
const sessions = new Map<string, SessionData>()

export function initSession(
  bookingId: string,
  host: Address,
  guest: Address,
  startTime: number,
  durationMins: number
): void {
  if (sessions.has(bookingId)) return

  sessions.set(bookingId, {
    bookingId,
    host: host.toLowerCase() as Address,
    guest: guest.toLowerCase() as Address,
    startTime,
    endTime: startTime + durationMins * 60,
    participants: new Map(),
  })
}

export function recordJoin(bookingId: string, address: Address): void {
  const session = sessions.get(bookingId)
  if (!session) return

  const addr = address.toLowerCase() as Address
  if (!session.participants.has(addr)) {
    session.participants.set(addr, {
      address: addr,
      joinedAt: Math.floor(Date.now() / 1000),
    })
  }
}

export function recordLeave(bookingId: string, address: Address): number | null {
  const session = sessions.get(bookingId)
  if (!session) return null

  const addr = address.toLowerCase() as Address
  const participant = session.participants.get(addr)
  if (!participant) return null

  participant.leftAt = Math.floor(Date.now() / 1000)
  const durationMs = (participant.leftAt - participant.joinedAt) * 1000
  return durationMs
}

export function getSession(bookingId: string): SessionData | null {
  return sessions.get(bookingId) || null
}

/**
 * Calculate session outcome based on participation
 * Returns: 'completed' | 'no-show-host' | 'no-show-guest' | null (not ready)
 */
export function calculateOutcome(bookingId: string): string | null {
  const session = sessions.get(bookingId)
  if (!session) return null

  const now = Math.floor(Date.now() / 1000)

  // Can only determine outcome after grace period
  // (In production, would check Agora channel events)
  if (now < session.startTime) return null

  const hostJoined = session.participants.has(session.host)
  const guestJoined = session.participants.has(session.guest)

  // After end time, determine outcome
  if (now > session.endTime) {
    if (hostJoined && guestJoined) return 'completed'
    if (!hostJoined) return 'no-show-host'
    if (!guestJoined) return 'no-show-guest'
  }

  return null // Still in progress or in grace period
}

/**
 * Get participation stats for a session
 */
export function getParticipationStats(bookingId: string): {
  hostJoinedAt?: number
  hostLeftAt?: number
  guestJoinedAt?: number
  guestLeftAt?: number
  overlapSeconds: number
} | null {
  const session = sessions.get(bookingId)
  if (!session) return null

  const hostP = session.participants.get(session.host)
  const guestP = session.participants.get(session.guest)

  // Calculate overlap
  let overlapSeconds = 0
  if (hostP && guestP) {
    const hostEnd = hostP.leftAt || Math.floor(Date.now() / 1000)
    const guestEnd = guestP.leftAt || Math.floor(Date.now() / 1000)
    const overlapStart = Math.max(hostP.joinedAt, guestP.joinedAt)
    const overlapEnd = Math.min(hostEnd, guestEnd)
    overlapSeconds = Math.max(0, overlapEnd - overlapStart)
  }

  return {
    hostJoinedAt: hostP?.joinedAt,
    hostLeftAt: hostP?.leftAt,
    guestJoinedAt: guestP?.joinedAt,
    guestLeftAt: guestP?.leftAt,
    overlapSeconds,
  }
}
