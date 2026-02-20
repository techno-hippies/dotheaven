const BASE_URL = (
  process.env.METADATA_RESOLVER_URL
  || process.env.API_BASE
  || 'http://localhost:8787'
).trim().replace(/\/+$/, '')

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const url = `${BASE_URL}/health`
  console.log(`[metadata-resolver smoke] checking ${url}`)

  const res = await fetchWithTimeout(url, 25_000)
  const text = await res.text()
  let payload: Record<string, unknown> | null = null
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    payload = null
  }

  if (!res.ok) {
    throw new Error(`health failed: status=${res.status} body=${text.slice(0, 220)}`)
  }
  if (!payload || payload.ok !== true) {
    throw new Error(`health payload missing { ok: true }: body=${text.slice(0, 220)}`)
  }

  console.log('[metadata-resolver smoke] PASS')
}

await main()
