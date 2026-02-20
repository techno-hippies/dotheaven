/**
 * Agora Token Generation
 *
 * Supports two TTL modes:
 * - Booked sessions: 3600s (1 hour, no renewal needed)
 * - Free rooms: 90s (short-lived, requires renewal every 45s)
 */

import { RtcTokenBuilder, RtcRole } from 'agora-token'
import { TOKEN_TTL_SECONDS } from './config'

/** Deterministic UID from wallet address (last 4 bytes as uint32) */
export function addressToUid(address: string): number {
  const hex = address.slice(-8)
  return parseInt(hex, 16) % 0xFFFFFFFF
}

/** Channel name for booked sessions */
export function getBookedChannel(chainId: string, bookingId: string | bigint): string {
  return `heaven-${chainId}-${bookingId}`
}

/** Channel name for free rooms */
export function getFreeChannel(roomId: string): string {
  return `heaven-free-${roomId}`
}

/** Generate Agora RTC token with custom TTL */
export function generateToken(
  appId: string,
  appCertificate: string,
  channel: string,
  uid: number,
  ttlSeconds: number,
  role: RtcRole = RtcRole.PUBLISHER,
): { token: string; expiresInSeconds: number } {
  const now = Math.floor(Date.now() / 1000)
  const expirationTime = now + ttlSeconds

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channel,
    uid,
    role,
    expirationTime,
    expirationTime,
  )

  return { token, expiresInSeconds: ttlSeconds }
}

/** Generate short-lived token for free rooms (90s TTL) */
export function generateShortToken(
  appId: string,
  appCertificate: string,
  channel: string,
  uid: number,
): { token: string; expiresInSeconds: number } {
  return generateToken(appId, appCertificate, channel, uid, TOKEN_TTL_SECONDS)
}

/** Generate long-lived token for booked sessions (1h TTL) */
export function generateBookedToken(
  appId: string,
  appCertificate: string,
  channel: string,
  uid: number,
): { token: string; expiresInSeconds: number } {
  return generateToken(appId, appCertificate, channel, uid, 3600)
}

/** Generate short-lived viewer token for audience/read-only clients. */
export function generateViewerToken(
  appId: string,
  appCertificate: string,
  channel: string,
  uid: number,
): { token: string; expiresInSeconds: number } {
  return generateToken(appId, appCertificate, channel, uid, TOKEN_TTL_SECONDS, RtcRole.SUBSCRIBER)
}
