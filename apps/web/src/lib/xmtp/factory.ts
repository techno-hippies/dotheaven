/**
 * Platform-aware XMTP transport factory.
 *
 * Browser transport (browser-sdk with OPFS).
 */

import type { XmtpTransport } from './transport'

let transport: XmtpTransport | null = null

export async function createTransport(): Promise<XmtpTransport> {
  if (transport) return transport

  const { BrowserTransport } = await import('./browser-transport')
  transport = new BrowserTransport()

  return transport
}

export function getTransport(): XmtpTransport | null {
  return transport
}

export function resetTransport(): void {
  if (transport) {
    transport.disconnect()
    transport = null
  }
}
