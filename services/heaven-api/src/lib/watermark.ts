/**
 * Watermark Generation
 *
 * Generates per-viewer watermark overlays using SVG → PNG conversion.
 * Uses opentype.js to convert text to paths (no font rendering needed).
 */

import { svg2png, initialize } from 'svg2png-wasm'
import opentype from 'opentype.js'
// @ts-ignore - WASM import
import wasmModule from 'svg2png-wasm/svg2png_wasm_bg.wasm'
// @ts-ignore - Font import (binary data)
import robotoMonoTtf from '../assets/RobotoMono-Bold.ttf'

// Track initialization state
let wasmReady = false
let font: opentype.Font | null = null

/**
 * Initialize WASM and load font
 */
async function ensureReady(): Promise<void> {
  if (!wasmReady) {
    await initialize(wasmModule)
    wasmReady = true
  }

  if (!font) {
    // Load font from bundled bytes
    const fontBuffer = robotoMonoTtf as ArrayBuffer
    font = opentype.parse(fontBuffer)
    console.log(`[Watermark] Font loaded: ${font.names.fullName?.en || 'unknown'}`)
  }
}

/**
 * Properly slice Uint8Array to ArrayBuffer (avoids extra bytes issue)
 */
export function u8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Convert text to SVG path data using opentype.js
 */
function textToPath(text: string, x: number, y: number, fontSize: number): string {
  if (!font) throw new Error('Font not loaded')
  const path = font.getPath(text, x, y, fontSize)
  return path.toPathData(2) // 2 decimal places
}

/**
 * Get path data with bounding box for centering
 */
function getPathWithBounds(text: string, fontSize: number): { pathData: string; width: number; height: number } {
  if (!font) throw new Error('Font not loaded')
  const path = font.getPath(text, 0, 0, fontSize)
  const bb = path.getBoundingBox()
  const norm = font.getPath(text, -bb.x1, -bb.y1, fontSize)
  return {
    pathData: norm.toPathData(2),
    width: bb.x2 - bb.x1,
    height: bb.y2 - bb.y1,
  }
}

/**
 * Generate a full 500x500 watermark overlay PNG
 * Horizontal rows alternating branding position, spans full width
 *
 * @param walletFull - FULL wallet address (no truncation)
 * @param fingerprintCode - Fingerprint code (stored in metadata)
 */
export async function generateFullOverlay(
  walletFull: string,
  fingerprintCode: string
): Promise<Uint8Array> {
  await ensureReady()
  if (!font) throw new Error('Font not loaded')

  // Two label variants for alternating
  const labelBefore = `Heaven Dating • ${walletFull}`
  const labelAfter = `${walletFull} • Heaven Dating`

  // Find font size that fits full 500px width
  let fontSize = 11
  let wBefore = 0, wAfter = 0, h = 0
  let pathDataBefore = '', pathDataAfter = ''

  while (fontSize >= 6) {
    const tmpBefore = font.getPath(labelBefore, 0, 0, fontSize)
    const bbBefore = tmpBefore.getBoundingBox()
    wBefore = bbBefore.x2 - bbBefore.x1

    const tmpAfter = font.getPath(labelAfter, 0, 0, fontSize)
    const bbAfter = tmpAfter.getBoundingBox()
    wAfter = bbAfter.x2 - bbAfter.x1
    h = bbAfter.y2 - bbAfter.y1

    // Use full width (500px)
    if (Math.max(wBefore, wAfter) <= 500) {
      const normBefore = font.getPath(labelBefore, -bbBefore.x1, -bbBefore.y1, fontSize)
      pathDataBefore = normBefore.toPathData(2)
      const normAfter = font.getPath(labelAfter, -bbAfter.x1, -bbAfter.y1, fontSize)
      pathDataAfter = normAfter.toPathData(2)
      break
    }
    fontSize--
  }

  if (!pathDataBefore) {
    throw new Error('Could not fit watermark text')
  }

  // 7 horizontal rows, span full width (x=0)
  const rowCount = 7
  const startY = 35
  const endY = 465
  const yStep = (endY - startY) / (rowCount - 1)

  const rows: string[] = []
  for (let i = 0; i < rowCount; i++) {
    const y = startY + i * yStep
    // Alternate: even rows = branding before, odd rows = branding after
    const isEven = i % 2 === 0
    const pathData = isEven ? pathDataBefore : pathDataAfter
    const w = isEven ? wBefore : wAfter
    // Center each row
    const x = (500 - w) / 2

    rows.push(`
      <g transform="translate(${x},${y})">
        <path d="${pathData}" fill="none" stroke="#000" stroke-width="3" stroke-opacity="0.2"/>
        <path d="${pathData}" fill="#FFF" fill-opacity="0.45"/>
      </g>
    `)
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  ${rows.join('\n')}
</svg>
`.trim()

  return svg2png(svg, { width: 500, height: 500, backgroundColor: 'transparent' })
}

/**
 * Generate a tiled watermark PNG (legacy, redirects to full overlay)
 */
export async function generateTileWatermark(
  walletShort: string,
  fingerprintCode: string
): Promise<Uint8Array> {
  return generateFullOverlay(walletShort, fingerprintCode)
}

/**
 * Generate a corner stamp PNG
 * Text converted to paths
 */
export async function generateCornerStamp(
  walletShort: string,
  fingerprintCode: string,
  matchDate?: string
): Promise<Uint8Array> {
  await ensureReady()

  const line1 = 'Revealed to:'
  const line2 = walletShort
  const line3 = `fp:${fingerprintCode}`
  const line4 = matchDate || new Date().toISOString().split('T')[0]

  // Convert text to paths
  const path1 = textToPath(line1, 12, 18, 10)
  const path2 = textToPath(line2, 12, 38, 13)
  const path3 = textToPath(line3, 12, 54, 11)
  const path4 = textToPath(line4, 12, 70, 9)

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="78" viewBox="0 0 240 78">
  <rect x="0" y="0" width="240" height="78" rx="10" fill="#000" fill-opacity="0.75"/>
  <path d="${path1}" fill="#FFF" fill-opacity="0.7"/>
  <path d="${path2}" fill="#FFF" fill-opacity="0.95"/>
  <path d="${path3}" fill="#FFF" fill-opacity="0.95"/>
  <path d="${path4}" fill="#FFF" fill-opacity="0.6"/>
</svg>
`.trim()

  const png = await svg2png(svg, {
    width: 240,
    height: 78,
    backgroundColor: 'transparent',
  })

  return png
}

/**
 * Format wallet address - returns full address (no truncation for watermarks)
 */
export function formatWalletShort(wallet: string): string {
  // Return full address - we want it visible in watermarks
  return wallet
}
