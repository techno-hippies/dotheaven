import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type TurboClientLike = Record<string, unknown>

type TopUpRequest = {
  method?: string
  params?: Record<string, unknown>
}

type SubmitFundRequest = {
  txId?: string
  token?: string
  userAddress?: string
}

function parseDotEnv(path: string) {
  if (!existsSync(path)) return
  const contents = readFileSync(path, 'utf8')
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 1) continue
    const key = line.slice(0, idx).trim()
    if (!key || process.env[key] !== undefined) continue
    const value = line.slice(idx + 1).trim()
    process.env[key] = value
  }
}

parseDotEnv(resolve(process.cwd(), '.env'))

const PORT = Number(process.env.PORT || 8788)
const TURBO_ENV = (process.env.TURBO_ENV || 'development').toLowerCase()
const LOAD_TURBO_UPLOAD_URL =
  process.env.LOAD_TURBO_UPLOAD_URL || 'https://loaded-turbo-api.load.network'
const TURBO_WALLET_JWK_PATH = process.env.TURBO_WALLET_JWK_PATH || './secrets/turbo-wallet.json'

let cachedClient: TurboClientLike | null = null
const clientByToken = new Map<string, TurboClientLike>()
const unauthClientByToken = new Map<string, TurboClientLike>()

async function buildTurboUnauthenticatedClient(token?: string): Promise<TurboClientLike> {
  const key = (token || '__default__').toLowerCase()
  const cached = unauthClientByToken.get(key)
  if (cached) return cached

  const module = await import('@ardrive/turbo-sdk/node')
  const TurboFactory = (module as any).TurboFactory
  const devConfig = (module as any).developmentTurboConfiguration || {}
  const prodConfig = (module as any).productionTurboConfiguration || {}

  if (!TurboFactory) {
    throw new Error('TurboFactory export not found from @ardrive/turbo-sdk/node')
  }

  const baseConfig = TURBO_ENV === 'production' ? prodConfig : devConfig
  const created = TurboFactory.unauthenticated({
    ...baseConfig,
    ...(token ? { token } : {}),
    uploadServiceConfig: {
      ...(baseConfig.uploadServiceConfig || {}),
      url: LOAD_TURBO_UPLOAD_URL,
    },
  })

  unauthClientByToken.set(key, created)
  return created
}

async function buildTurboClient(token?: string): Promise<TurboClientLike> {
  const key = (token || '__default__').toLowerCase()
  const cached = clientByToken.get(key)
  if (cached) return cached

  const module = await import('@ardrive/turbo-sdk/node')
  const TurboFactory = (module as any).TurboFactory
  const devConfig = (module as any).developmentTurboConfiguration || {}
  const prodConfig = (module as any).productionTurboConfiguration || {}

  if (!TurboFactory) {
    throw new Error('TurboFactory export not found from @ardrive/turbo-sdk/node')
  }

  const jwkPath = resolve(process.cwd(), TURBO_WALLET_JWK_PATH)
  if (!existsSync(jwkPath)) {
    throw new Error(`TURBO_WALLET_JWK_PATH not found: ${jwkPath}`)
  }
  const jwk = JSON.parse(readFileSync(jwkPath, 'utf8'))

  const baseConfig = TURBO_ENV === 'production' ? prodConfig : devConfig
  const created = TurboFactory.authenticated({
    privateKey: jwk,
    ...baseConfig,
    ...(token ? { token } : {}),
    uploadServiceConfig: {
      ...(baseConfig.uploadServiceConfig || {}),
      url: LOAD_TURBO_UPLOAD_URL,
    },
  })
  clientByToken.set(key, created)
  if (!token) cachedClient = created
  return created
}

async function getTurboClient(): Promise<TurboClientLike> {
  if (cachedClient) return cachedClient
  return buildTurboClient()
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function listMethods(client: TurboClientLike): string[] {
  const proto = Object.getPrototypeOf(client)
  if (!proto) return []
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor' && typeof (client as any)[name] === 'function')
    .sort()
}

function getCallable(client: TurboClientLike, candidates: string[]): { name: string; fn: Function } | null {
  for (const name of candidates) {
    const fn = (client as any)[name]
    if (typeof fn === 'function') {
      return { name, fn: fn.bind(client) }
    }
  }
  return null
}

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text()
  if (!text.trim()) return {} as T
  return JSON.parse(text) as T
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(200, {
      ok: true,
      service: 'turbo-funding-proxy',
      turboEnv: TURBO_ENV,
      uploadService: LOAD_TURBO_UPLOAD_URL,
      ts: new Date().toISOString(),
    })
  }

  if (req.method === 'GET' && url.pathname === '/turbo/methods') {
    let client: TurboClientLike
    try {
      client = await buildTurboUnauthenticatedClient()
    } catch (err) {
      return json(500, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    return json(200, {
      ok: true,
      methods: listMethods(client),
      note: 'Use this to map SDK version-specific method names for top-up/balance.',
    })
  }

  if (req.method === 'POST' && url.pathname === '/turbo/config') {
    let client: TurboClientLike
    try {
      client = await buildTurboUnauthenticatedClient()
    } catch (err) {
      return json(500, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    const callable = getCallable(client, [
      'getPaymentServiceConfig',
      'paymentServiceConfig',
      'getConfig',
    ])
    if (!callable) {
      return json(501, {
        ok: false,
        error: 'No payment config method found on this Turbo client build',
        methods: listMethods(client),
      })
    }
    try {
      const payload = await callable.fn()
      return json(200, { ok: true, called: callable.name, payload })
    } catch (err) {
      return json(500, {
        ok: false,
        called: callable.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (req.method === 'GET' && url.pathname === '/turbo/wallets') {
    let client: TurboClientLike
    try {
      client = await buildTurboUnauthenticatedClient()
    } catch (err) {
      return json(500, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    const callable = getCallable(client, ['getTurboCryptoWallets'])
    if (!callable) {
      return json(501, { ok: false, error: 'getTurboCryptoWallets not available' })
    }
    try {
      const payload = await callable.fn()
      return json(200, { ok: true, called: callable.name, payload })
    } catch (err) {
      return json(500, {
        ok: false,
        called: callable.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (req.method === 'POST' && url.pathname === '/turbo/topup') {
    let client: TurboClientLike
    try {
      client = await getTurboClient()
    } catch (err) {
      return json(500, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    const body = await readJson<TopUpRequest>(req)
    const preferred = body.method ? [body.method] : []
    const callable = getCallable(client, [
      ...preferred,
      'topUpWithTokens',
      'topupWithTokens',
      'topUp',
      'topup',
    ])
    if (!callable) {
      return json(501, {
        ok: false,
        error: 'No top-up method found on this Turbo client build',
        methods: listMethods(client),
      })
    }
    try {
      const payload = await callable.fn(body.params || {})
      return json(200, { ok: true, called: callable.name, payload })
    } catch (err) {
      return json(500, {
        ok: false,
        called: callable.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (req.method === 'POST' && url.pathname === '/turbo/submit-fund') {
    const body = await readJson<SubmitFundRequest>(req)
    const txId = body.txId?.trim()
    if (!txId) {
      return json(400, { ok: false, error: 'txId is required' })
    }
    let tokenClient: TurboClientLike
    try {
      tokenClient = await buildTurboUnauthenticatedClient(body.token?.trim())
    } catch (err) {
      return json(500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        token: body.token,
      })
    }

    const submitCallable = getCallable(tokenClient, ['submitFundTransaction'])
    const balanceCallable = getCallable(tokenClient, [
      'getBalance',
      'getTurboBalance',
      'balance',
      'getCreditBalance',
    ])

    if (!submitCallable) {
      return json(501, {
        ok: false,
        error: 'submitFundTransaction not available',
        methods: listMethods(tokenClient),
      })
    }

    try {
      const submitPayload = await submitCallable.fn({ txId })
      let balancePayload: unknown = null
      if (balanceCallable) {
        if (body.userAddress?.trim()) {
          balancePayload = await balanceCallable.fn(body.userAddress.trim())
        } else {
          try {
            balancePayload = await balanceCallable.fn()
          } catch {
            balancePayload = null
          }
        }
      }
      return json(200, {
        ok: true,
        token: body.token || null,
        called: submitCallable.name,
        submitted: submitPayload,
        balance: balancePayload,
      })
    } catch (err) {
      return json(500, {
        ok: false,
        token: body.token || null,
        called: submitCallable.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (req.method === 'POST' && url.pathname === '/turbo/balance') {
    const body = await readJson<Record<string, unknown> & { token?: string; userAddress?: string }>(req)
    let tokenClient: TurboClientLike
    try {
      tokenClient = await buildTurboUnauthenticatedClient(
        typeof body.token === 'string' ? body.token.trim() : undefined,
      )
    } catch (err) {
      return json(500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        token: body.token,
      })
    }

    const callable = getCallable(tokenClient, [
      'getBalance',
      'getTurboBalance',
      'balance',
      'getCreditBalance',
    ])
    if (!callable) {
      return json(501, {
        ok: false,
        error: 'No balance method found on this Turbo client build',
        methods: listMethods(tokenClient),
      })
    }
    try {
      const address = typeof body.userAddress === 'string' ? body.userAddress.trim() : ''
      const payload = address ? await callable.fn(address) : await callable.fn()
      return json(200, { ok: true, token: body.token || null, called: callable.name, payload })
    } catch (err) {
      return json(500, {
        ok: false,
        token: body.token || null,
        called: callable.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return json(404, { ok: false, error: 'Not found' })
}

Bun.serve({
  port: PORT,
  fetch: handleRequest,
})

console.log(
  `[turbo-funding-proxy] listening on http://localhost:${PORT} (env=${TURBO_ENV}, uploadService=${LOAD_TURBO_UPLOAD_URL})`,
)
