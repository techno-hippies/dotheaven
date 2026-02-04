/**
 * Watermark Generation for Photo Reveals
 *
 * Generates per-viewer watermark overlays using SVG → PNG conversion.
 * Uses opentype.js to convert text to paths (no font rendering needed at runtime).
 *
 * Watermark format: "@alice.heaven • ABC12XYZ" or "@0x1234...5678 • ABC12XYZ"
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
 * Convert text to SVG path data using opentype.js
 */
function textToPath(text: string, x: number, y: number, fontSize: number): string {
  if (!font) throw new Error('Font not loaded')
  const path = font.getPath(text, x, y, fontSize)
  return path.toPathData(2) // 2 decimal places
}

/**
 * Generate a full watermark overlay PNG
 * Horizontal rows alternating position, spans full width
 *
 * @param viewerLabel - Viewer identifier (@alice.heaven or @0x1234...5678)
 * @param watermarkCode - 8-char truncated HMAC code
 * @param width - Output width (default 500)
 * @param height - Output height (default 500)
 */
export async function generateFullOverlay(
  viewerLabel: string,
  watermarkCode: string,
  width = 500,
  height = 500
): Promise<Uint8Array> {
  await ensureReady()
  if (!font) throw new Error('Font not loaded')

  // Format: "@alice.heaven • ABC12XYZ" or "ABC12XYZ • @alice.heaven"
  const labelBefore = `${viewerLabel} • ${watermarkCode}`
  const labelAfter = `${watermarkCode} • ${viewerLabel}`

  // Find font size that fits width
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

    if (Math.max(wBefore, wAfter) <= width) {
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

  // 7 horizontal rows
  const rowCount = 7
  const startY = 35
  const endY = height - 35
  const yStep = (endY - startY) / (rowCount - 1)

  const rows: string[] = []
  for (let i = 0; i < rowCount; i++) {
    const y = startY + i * yStep
    // Alternate: even rows = label before code, odd rows = code before label
    const isEven = i % 2 === 0
    const pathData = isEven ? pathDataBefore : pathDataAfter
    const w = isEven ? wBefore : wAfter
    // Center each row
    const x = (width - w) / 2

    rows.push(`
      <g transform="translate(${x},${y})">
        <path d="${pathData}" fill="none" stroke="#000" stroke-width="3" stroke-opacity="0.2"/>
        <path d="${pathData}" fill="#FFF" fill-opacity="0.45"/>
      </g>
    `)
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${rows.join('\n')}
</svg>
`.trim()

  return svg2png(svg, { width, height, backgroundColor: 'transparent' })
}

/**
 * Generate a corner stamp PNG for additional attribution
 *
 * @param viewerLabel - Viewer identifier
 * @param watermarkCode - Fingerprint code
 * @param revealDate - Date string (YYYY-MM-DD)
 */
export async function generateCornerStamp(
  viewerLabel: string,
  watermarkCode: string,
  revealDate?: string
): Promise<Uint8Array> {
  await ensureReady()

  const line1 = 'Revealed to:'
  const line2 = viewerLabel
  const line3 = watermarkCode
  const line4 = revealDate || new Date().toISOString().split('T')[0]

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

  return svg2png(svg, {
    width: 240,
    height: 78,
    backgroundColor: 'transparent',
  })
}

/**
 * Generate tiled microtext overlay (faint pattern across entire image)
 *
 * @param viewerLabel - Viewer identifier
 * @param watermarkCode - Code for tracing
 * @param width - Output width
 * @param height - Output height
 */
export async function generateTiledMicrotext(
  viewerLabel: string,
  watermarkCode: string,
  width = 500,
  height = 500
): Promise<Uint8Array> {
  await ensureReady()
  if (!font) throw new Error('Font not loaded')

  const microText = `${viewerLabel} ${watermarkCode}`
  const fontSize = 6

  // Get text dimensions
  const tmpPath = font.getPath(microText, 0, 0, fontSize)
  const bb = tmpPath.getBoundingBox()
  const textWidth = bb.x2 - bb.x1
  const textHeight = bb.y2 - bb.y1

  // Create normalized path
  const normPath = font.getPath(microText, -bb.x1, -bb.y1, fontSize)
  const pathData = normPath.toPathData(2)

  // Tile across image with spacing
  const spacingX = textWidth + 20
  const spacingY = textHeight + 15
  const tiles: string[] = []

  for (let y = 10; y < height; y += spacingY) {
    // Offset alternate rows
    const offsetX = (Math.floor(y / spacingY) % 2) * (spacingX / 2)
    for (let x = -spacingX + offsetX; x < width; x += spacingX) {
      tiles.push(`
        <g transform="translate(${x},${y})">
          <path d="${pathData}" fill="#FFF" fill-opacity="0.08"/>
        </g>
      `)
    }
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${tiles.join('\n')}
</svg>
`.trim()

  return svg2png(svg, { width, height, backgroundColor: 'transparent' })
}

/**
 * Format viewer label from heaven name or wallet address
 *
 * @param heavenName - Heaven name (e.g., "alice") or null
 * @param walletAddress - Full wallet address
 * @returns Formatted label (e.g., "@alice.heaven" or "@0x1234...5678")
 */
export function formatViewerLabel(heavenName: string | null, walletAddress: string): string {
  const truncatedWallet = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
  if (heavenName) {
    // Include both name and wallet for wider span
    return `@${heavenName}.heaven (${truncatedWallet})`
  }
  return `@${truncatedWallet}`
}

/**
 * Generate watermark code from HMAC
 * Takes first 8 chars, uppercase
 */
export function formatWatermarkCode(hmacHex: string): string {
  return hmacHex.slice(0, 8).toUpperCase()
}
