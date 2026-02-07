/**
 * Test script for the photo pipeline
 *
 * Usage:
 *   # Start the worker first (use --remote for full Images API support)
 *   cd workers/api && wrangler dev --remote
 *
 *   # In another terminal, run tests
 *   bun run scripts/test-photos.ts
 *
 * Prerequisites:
 *   - Run db:init and db:migrate first
 *   - Set FAL_KEY via `wrangler secret put FAL_KEY`
 *   - Create R2 buckets (see CLAUDE.md)
 *
 * NOTE: Local mode (without --remote) only supports basic image transforms.
 * trim/draw require --remote mode for full fidelity.
 */

const API_BASE = 'http://localhost:8787'
const TEST_USER_PKP = '0x1234567890abcdef1234567890abcdef12345678'

// Create a simple test image (1x1 red pixel PNG)
function createTestImage(): Blob {
  // Minimal valid PNG (1x1 red pixel)
  const pngData = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe,
    0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, // IEND chunk
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ])
  return new Blob([pngData], { type: 'image/png' })
}

async function testHealthCheck() {
  console.log('\n=== Testing Health Check ===')
  const res = await fetch(`${API_BASE}/health`)
  const data = await res.json()
  console.log('Status:', res.status)
  console.log('Response:', data)
  return res.ok
}

async function testPhotoPipeline() {
  console.log('\n=== Testing Photo Pipeline ===')

  // Create form data with 4 test images
  const formData = new FormData()
  for (let i = 1; i <= 4; i++) {
    formData.append(`photo${i}`, createTestImage(), `test${i}.png`)
  }

  console.log('Uploading 4 test images...')

  const res = await fetch(`${API_BASE}/api/photos/pipeline`, {
    method: 'POST',
    headers: {
      'X-User-Pkp': TEST_USER_PKP,
    },
    body: formData,
  })

  const data = await res.json()
  console.log('Status:', res.status)
  console.log('Response:', JSON.stringify(data, null, 2))

  return { ok: res.ok, data }
}

async function testJobStatus(jobId: string) {
  console.log('\n=== Testing Job Status ===')

  const res = await fetch(`${API_BASE}/api/photos/pipeline/${jobId}`, {
    headers: {
      'X-User-Pkp': TEST_USER_PKP,
    },
  })

  const data = await res.json()
  console.log('Status:', res.status)
  console.log('Response:', JSON.stringify(data, null, 2))

  return { ok: res.ok, data }
}

async function testAnimeTile(userId: string, slot: number) {
  console.log(`\n=== Testing Anime Tile ${slot} ===`)

  const res = await fetch(`${API_BASE}/api/photos/anime/${userId}/${slot}`)

  console.log('Status:', res.status)
  console.log('Content-Type:', res.headers.get('content-type'))
  console.log('Content-Length:', res.headers.get('content-length'))

  if (res.ok) {
    const blob = await res.blob()
    console.log('Blob size:', blob.size)
  } else {
    const data = await res.json()
    console.log('Error:', data)
  }

  return res.ok
}

async function testPhotoAccess() {
  console.log('\n=== Testing Photo Access Creation ===')

  // First, we need a photo ID from the pipeline
  // This would normally come from a real pipeline run

  const res = await fetch(`${API_BASE}/api/photos/access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Pkp': TEST_USER_PKP,
    },
    body: JSON.stringify({
      matchId: 'test-match-123',
      ownerUserId: TEST_USER_PKP,
      viewerUserId: '0xabcdef1234567890abcdef1234567890abcdef12',
      viewerWallet: '0xabcdef1234567890abcdef1234567890abcdef12',
    }),
  })

  const data = await res.json()
  console.log('Status:', res.status)
  console.log('Response:', JSON.stringify(data, null, 2))

  return { ok: res.ok, data }
}

async function main() {
  console.log('Photo Pipeline Test Script')
  console.log('==========================')
  console.log(`API Base: ${API_BASE}`)
  console.log(`Test User: ${TEST_USER_PKP}`)

  // Health check
  const healthOk = await testHealthCheck()
  if (!healthOk) {
    console.error('\nHealth check failed! Is the worker running?')
    console.log('Run: cd workers/api && bun run dev')
    process.exit(1)
  }

  // Pipeline test
  // Note: This will likely fail without FAL_KEY set and R2 buckets created
  console.log('\n⚠️  Note: Full pipeline test requires:')
  console.log('   - FAL_KEY secret set')
  console.log('   - R2 buckets created')
  console.log('   - Images binding enabled')
  console.log('')

  try {
    const pipelineResult = await testPhotoPipeline()

    if (pipelineResult.ok && pipelineResult.data.jobId) {
      // Check job status
      await testJobStatus(pipelineResult.data.jobId)

      // Try to fetch anime tiles
      if (pipelineResult.data.animeTiles?.length > 0) {
        await testAnimeTile(TEST_USER_PKP, 1)
      }
    }

    // Test access creation (should work in dev mode)
    await testPhotoAccess()

  } catch (err) {
    console.error('\nTest error:', err)
  }

  console.log('\n=== Tests Complete ===')
}

main()
