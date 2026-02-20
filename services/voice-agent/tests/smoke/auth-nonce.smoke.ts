const BASE_URL = (process.env.VOICE_AGENT_URL || '').trim().replace(/\/+$/, '')
if (!BASE_URL) throw new Error('VOICE_AGENT_URL is required')
const TEST_WALLET = (process.env.TEST_WALLET || '0x0000000000000000000000000000000000000001').trim().toLowerCase()

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const url = `${BASE_URL}/auth/nonce`
  console.log(`[voice-agent smoke] checking ${url}`)

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: TEST_WALLET }),
    },
    25_000,
  )
  const text = await res.text()
  let payload: Record<string, unknown> | null = null
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    payload = null
  }

  if (!res.ok) {
    throw new Error(`auth nonce failed: status=${res.status} body=${text.slice(0, 220)}`)
  }
  if (!payload || typeof payload.nonce !== 'string' || payload.nonce.length < 8) {
    throw new Error(`auth nonce payload invalid: body=${text.slice(0, 220)}`)
  }

  console.log('[voice-agent smoke] PASS')
}

await main()
