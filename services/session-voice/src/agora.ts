/**
 * Agora Token Generation
 */

import { RtcTokenBuilder, RtcRole } from 'agora-token'
import { config } from './config.js'

/**
 * Generate deterministic UID from wallet address
 * Uses last 4 bytes of address as uint32
 */
export function addressToUid(address: string): number {
  // Take last 8 hex chars (4 bytes) and convert to number
  const hex = address.slice(-8)
  return parseInt(hex, 16) % 0xFFFFFFFF // uint32 range
}

/**
 * Generate channel name from booking ID
 */
export function getChannel(bookingId: string | bigint): string {
  return `heaven-${config.chainId}-${bookingId}`
}

/**
 * Generate Agora RTC token for a user joining a session
 */
export function generateToken(
  bookingId: string | bigint,
  userAddress: string
): { channel: string; token: string; uid: number } {
  const channel = getChannel(bookingId)
  const uid = addressToUid(userAddress)
  const expirationTime = Math.floor(Date.now() / 1000) + config.tokenExpirySeconds

  const token = RtcTokenBuilder.buildTokenWithUid(
    config.agoraAppId,
    config.agoraAppCertificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    expirationTime,
    expirationTime // privilege expiration
  )

  return { channel, token, uid }
}
