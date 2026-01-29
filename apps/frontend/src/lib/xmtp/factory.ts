/**
 * Platform-aware XMTP transport factory.
 *
 * - Tauri: SidecarTransport (persistent SQLite via Node sidecar)
 * - Web: BrowserTransport (browser-sdk with OPFS)
 */

import type { XmtpTransport } from './transport'

const IS_TAURI = import.meta.env.VITE_PLATFORM === 'tauri'

let transport: XmtpTransport | null = null

export async function createTransport(): Promise<XmtpTransport> {
  if (transport) return transport

  if (IS_TAURI) {
    const { SidecarTransport } = await import('./sidecar-transport')
    transport = new SidecarTransport()
  } else {
    const { BrowserTransport } = await import('./browser-transport')
    transport = new BrowserTransport()
  }

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
