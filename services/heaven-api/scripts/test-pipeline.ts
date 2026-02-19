/**
 * Test the photo pipeline with real images
 *
 * Usage:
 *   # First, start the worker in remote mode
 *   cd workers/api && wrangler dev --remote
 *
 *   # Then run this test
 *   bun run scripts/test-pipeline.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const API_BASE = process.env.API_BASE || 'http://localhost:8787'
const TEST_USER_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
const IMAGES_DIR = '/home/t42/Desktop/test-images'

async function main() {
  console.log('=== Photo Pipeline Test ===')
  console.log(`API: ${API_BASE}`)
  console.log(`User: ${TEST_USER_ADDRESS}`)
  console.log(`Images: ${IMAGES_DIR}`)
  console.log('')

  // Health check
  console.log('1. Health check...')
  const healthRes = await fetch(`${API_BASE}/health`)
  if (!healthRes.ok) {
    console.error('Health check failed! Is the worker running?')
    console.log('Run: cd workers/api && wrangler dev --remote')
    process.exit(1)
  }
  console.log('   ✓ Worker is running')

  // Load test images
  console.log('\n2. Loading test images...')
  const formData = new FormData()

  for (let i = 1; i <= 4; i++) {
    const imagePath = join(IMAGES_DIR, `${i}.png`)
    console.log(`   Loading ${imagePath}`)

    const imageBuffer = readFileSync(imagePath)
    const blob = new Blob([imageBuffer], { type: 'image/png' })
    formData.append(`photo${i}`, blob, `${i}.png`)
  }
  console.log('   ✓ All 4 images loaded')

  // Upload to pipeline
  console.log('\n3. Uploading to /api/photos/pipeline...')
  console.log('   (This may take 30-60 seconds for fal.ai processing)')

  const startTime = Date.now()

  const pipelineRes = await fetch(`${API_BASE}/api/photos/pipeline`, {
    method: 'POST',
    headers: {
      'X-User-Address': TEST_USER_ADDRESS,
    },
    body: formData,
  })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`   Completed in ${elapsed}s`)

  const result = await pipelineRes.json()
  console.log(`   Status: ${pipelineRes.status}`)
  console.log('   Response:', JSON.stringify(result, null, 2))

  if (!pipelineRes.ok) {
    console.error('\n❌ Pipeline failed!')
    process.exit(1)
  }

  // Test fetching anime tiles
  if (result.animeTiles && result.animeTiles.length > 0) {
    console.log('\n4. Testing anime tile endpoints...')

    for (let i = 0; i < result.animeTiles.length; i++) {
      const tileUrl = result.animeTiles[i]
      const fullUrl = tileUrl.startsWith('http') ? tileUrl : `${API_BASE}${tileUrl}`

      const tileRes = await fetch(fullUrl)
      if (tileRes.ok) {
        const contentType = tileRes.headers.get('content-type')
        const blob = await tileRes.blob()
        console.log(`   ✓ Tile ${i + 1}: ${contentType}, ${blob.size} bytes`)
      } else {
        console.log(`   ✗ Tile ${i + 1}: ${tileRes.status} ${tileRes.statusText}`)
      }
    }
  }

  // Check job status
  if (result.jobId) {
    console.log('\n5. Checking job status...')
    const jobRes = await fetch(`${API_BASE}/api/photos/pipeline/${result.jobId}`, {
      headers: { 'X-User-Address': TEST_USER_ADDRESS },
    })
    const jobData = await jobRes.json()
    console.log('   Job:', JSON.stringify(jobData, null, 2))
  }

  console.log('\n=== Test Complete ===')
  console.log(`Photo IDs: ${result.photoIds?.join(', ')}`)
  console.log(`Anime Tiles: ${result.animeTiles?.join('\n              ')}`)
}

main().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
