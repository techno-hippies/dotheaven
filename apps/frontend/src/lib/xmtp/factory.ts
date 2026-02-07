/**
 * Platform-aware XMTP transport factory.
 *
 * - Tauri: RustTransport (native libxmtp via Tauri commands)
 * - Web: BrowserTransport (browser-sdk with OPFS)
 */

import type { XmtpTransport } from './transport'

const IS_TAURI = import.meta.env.VITE_PLATFORM === 'tauri'

let transport: XmtpTransport | null = null

export async function createTransport(): Promise<XmtpTransport> {
  if (transport) return transport

  if (IS_TAURI) {
    const { RustTransport } = await import('./tauri-transport')
    transport = new RustTransport()
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
