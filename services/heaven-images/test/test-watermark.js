#!/usr/bin/env node
/**
 * Test the /watermark endpoint with a real image
 */
const fs = require('fs')
const path = require('path')

const OUTPUT_DIR = path.join(__dirname, 'fixtures')

// Use production URL (local mock doesn't support .draw() compositing)
const ENDPOINT = process.env.LOCAL
  ? 'http://localhost:8787/watermark'
  : 'https://heaven-images.deletion-backup782.workers.dev/watermark'

async function main() {
  // Load test image from local fixtures
  const imagePath = path.join(OUTPUT_DIR, 'thispersondoesnotexist.jpeg')
  const imageBuffer = fs.readFileSync(imagePath)
  const imageBase64 = imageBuffer.toString('base64')

  console.log(`Loaded image: ${imagePath} (${imageBuffer.length} bytes)`)
  console.log(`Using endpoint: ${ENDPOINT}`)

  // Call watermark endpoint
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      imageContentType: 'image/jpeg',
      viewerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      heavenName: 'alice',
      watermarkCode: 'DEADBEEF',
      outputWidth: 500,
      outputHeight: 500,
      layers: ['overlay', 'corner']
    })
  })

  const result = await response.json()

  if (!result.success) {
    console.error('Error:', result.error)
    process.exit(1)
  }

  console.log('Success!')
  console.log('  viewerLabel:', result.viewerLabel)
  console.log('  watermarkCode:', result.watermarkCode)
  console.log('  contentType:', result.contentType)

  // Save watermarked image
  const outputBuffer = Buffer.from(result.imageBase64, 'base64')
  const outputPath = path.join(OUTPUT_DIR, 'watermarked-real-photo.webp')
  fs.writeFileSync(outputPath, outputBuffer)
  console.log(`\nSaved watermarked image: ${outputPath} (${outputBuffer.length} bytes)`)
}

main().catch(console.error)
