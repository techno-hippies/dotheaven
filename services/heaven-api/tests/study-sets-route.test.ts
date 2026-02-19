import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

type StudySetRead = {
  studySetRef: string
  studySetHash: string
  submitter: string
  createdAt: number
  exists: boolean
}

type MockChainState = {
  calls: Array<{ fn: string; args: unknown[] }>
  fetchCalls: Array<{ method: string; url: string }>
  studySetReads: StudySetRead[]
  studySetReadIndex: number
  credits: bigint
  creditsPerFulfill: bigint
  fulfillError: string | null
  fulfillTxHash: string
  lyricsRef: string
  lyricsHash: string
  lyricsVersion: number
  lyricsSubmitter: string
  lyricsTimestamp: number
  lyricsText: string
  trackRegistered: boolean
  trackTitle: string
  trackArtist: string
  trackAlbum: string
  cachedPack: Record<string, unknown>
}

const chainState: MockChainState = {
  calls: [],
  fetchCalls: [],
  studySetReads: [],
  studySetReadIndex: 0,
  credits: 0n,
  creditsPerFulfill: 1n,
  fulfillError: null,
  fulfillTxHash: `0x${'3'.repeat(64)}`,
  lyricsRef: 'ar://lyrics-id',
  lyricsHash: `0x${'0'.repeat(64)}`,
  lyricsVersion: 1,
  lyricsSubmitter: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  lyricsTimestamp: 1_739_980_800,
  lyricsText: '',
  trackRegistered: true,
  trackTitle: 'Toxic',
  trackArtist: 'Britney Spears',
  trackAlbum: 'In the Zone',
  cachedPack: {},
}

mock.module('ethers', () => {
  class MockProvider {
    constructor(_url: string, _chainId?: number) {}
  }

  class MockWallet {
    constructor(_pk: string, _provider: MockProvider) {}
  }

  class MockContract {
    private kind: 'lyrics' | 'study' | 'scrobble' | 'unknown'

    constructor(_address: string, abi: string[], _runner: MockProvider | MockWallet) {
      const sigs = abi.join(' ')
      if (sigs.includes('getLyrics(')) this.kind = 'lyrics'
      else if (sigs.includes('getStudySet(')) this.kind = 'study'
      else if (sigs.includes('isRegistered(')) this.kind = 'scrobble'
      else this.kind = 'unknown'
    }

    async getLyrics(trackId: string): Promise<[string, string, bigint, string, bigint]> {
      if (this.kind !== 'lyrics') throw new Error('wrong_contract_kind:getLyrics')
      chainState.calls.push({ fn: 'getLyrics', args: [trackId] })
      return [
        chainState.lyricsRef,
        chainState.lyricsHash,
        BigInt(chainState.lyricsVersion),
        chainState.lyricsSubmitter,
        BigInt(chainState.lyricsTimestamp),
      ]
    }

    async getStudySet(trackId: string, lang: string, version: number): Promise<[string, string, string, bigint, boolean]> {
      if (this.kind !== 'study') throw new Error('wrong_contract_kind:getStudySet')
      chainState.calls.push({ fn: 'getStudySet', args: [trackId, lang, version] })
      const idx = chainState.studySetReadIndex
      chainState.studySetReadIndex += 1
      const item = chainState.studySetReads[idx] ?? chainState.studySetReads[chainState.studySetReads.length - 1]
      if (!item) {
        return ['', `0x${'0'.repeat(64)}`, '0x0000000000000000000000000000000000000000', 0n, false]
      }
      return [
        item.studySetRef,
        item.studySetHash,
        item.submitter,
        BigInt(item.createdAt),
        item.exists,
      ]
    }

    async credits(user: string): Promise<bigint> {
      if (this.kind !== 'study') throw new Error('wrong_contract_kind:credits')
      chainState.calls.push({ fn: 'credits', args: [user] })
      return chainState.credits
    }

    async CREDITS_PER_FULFILL(): Promise<bigint> {
      if (this.kind !== 'study') throw new Error('wrong_contract_kind:CREDITS_PER_FULFILL')
      chainState.calls.push({ fn: 'CREDITS_PER_FULFILL', args: [] })
      return chainState.creditsPerFulfill
    }

    async fulfillFromCredit(...args: unknown[]): Promise<{ hash: string; wait: () => Promise<{ blockNumber: bigint }> }> {
      if (this.kind !== 'study') throw new Error('wrong_contract_kind:fulfillFromCredit')
      chainState.calls.push({ fn: 'fulfillFromCredit', args })
      if (chainState.fulfillError) {
        throw new Error(chainState.fulfillError)
      }
      return {
        hash: chainState.fulfillTxHash,
        wait: async () => ({ blockNumber: 123456n }),
      }
    }

    async isRegistered(trackId: string): Promise<boolean> {
      if (this.kind !== 'scrobble') throw new Error('wrong_contract_kind:isRegistered')
      chainState.calls.push({ fn: 'isRegistered', args: [trackId] })
      return chainState.trackRegistered
    }

    async getTrack(trackId: string): Promise<[string, string, string, bigint, string, bigint, string, bigint]> {
      if (this.kind !== 'scrobble') throw new Error('wrong_contract_kind:getTrack')
      chainState.calls.push({ fn: 'getTrack', args: [trackId] })
      return [
        chainState.trackTitle,
        chainState.trackArtist,
        chainState.trackAlbum,
        3n,
        `0x${'1'.repeat(64)}`,
        1n,
        '',
        200n,
      ]
    }
  }

  return {
    Contract: MockContract,
    JsonRpcProvider: MockProvider,
    Wallet: MockWallet,
    getAddress: (value: string) => value.toLowerCase(),
  }
})

let studySetsApp: { request: (input: string, init: RequestInit, env: Record<string, unknown>) => Promise<Response> }

class MockDb {
  private locks = new Map<string, { owner: string; expiresAt: number }>()

  prepare(sql: string) {
    const db = this
    return {
      sql,
      params: [] as unknown[],
      bind(...args: unknown[]) {
        this.params = args
        return this
      },
      async run() {
        return db.run(sql, this.params)
      },
    }
  }

  private async run(sql: string, params: unknown[]): Promise<{ meta: { changes: number } }> {
    if (sql.includes('DELETE FROM study_set_generation_locks') && sql.includes('expires_at <= ?')) {
      const now = Number(params[0])
      let removed = 0
      for (const [key, value] of this.locks.entries()) {
        if (value.expiresAt <= now) {
          this.locks.delete(key)
          removed += 1
        }
      }
      return { meta: { changes: removed } }
    }

    if (sql.includes('INSERT OR IGNORE INTO study_set_generation_locks')) {
      const lockKey = String(params[0])
      const owner = String(params[1])
      const expiresAt = Number(params[3])
      if (this.locks.has(lockKey)) {
        return { meta: { changes: 0 } }
      }
      this.locks.set(lockKey, { owner, expiresAt })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('DELETE FROM study_set_generation_locks') && sql.includes('lock_key = ?')) {
      const lockKey = String(params[0])
      const owner = String(params[1])
      const existing = this.locks.get(lockKey)
      if (existing && existing.owner === owner) {
        this.locks.delete(lockKey)
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 0 } }
    }

    throw new Error(`Unhandled D1 run SQL: ${sql}`)
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function sha256HexUtf8(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `0x${hex}`
}

function buildEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: new MockDb(),
    OPENROUTER_API_KEY: 'sk-test-openrouter',
    OPENROUTER_STUDY_MODEL: 'google/gemini-3-flash-preview',
    TEMPO_RPC_URL: 'https://rpc.moderato.tempo.xyz',
    TEMPO_CHAIN_ID: '42431',
    TEMPO_SCROBBLE_V4: '0x07B8BdE8BaD74DC974F783AA71C7C51d6B37C363',
    TEMPO_CANONICAL_LYRICS_REGISTRY: '0x1111111111111111111111111111111111111111',
    TEMPO_STUDY_SET_REGISTRY: '0x2222222222222222222222222222222222222222',
    TEMPO_OPERATOR_PRIVATE_KEY: `0x${'2'.repeat(64)}`,
    LOAD_S3_AGENT_API_KEY: 'load-test-key',
    LOAD_S3_AGENT_URL: 'https://load-agent.test',
    LOAD_GATEWAY_URL: 'https://gateway.test',
    ...overrides,
  }
}

async function postGenerate(env: Record<string, unknown>, body: Record<string, unknown>) {
  const response = await studySetsApp.request(
    '/generate',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-address': '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      body: JSON.stringify(body),
    },
    env,
  )

  return {
    status: response.status,
    json: await response.json() as Record<string, unknown>,
  }
}

function expectStatus(result: { status: number; json: Record<string, unknown> }, expected: number) {
  if (result.status !== expected) {
    // eslint-disable-next-line no-console
    console.log('unexpected response', result.status, result.json)
  }
  expect(result.status).toBe(expected)
}

beforeAll(async () => {
  const mod = await import('../src/routes/study-sets')
  studySetsApp = mod.default as typeof studySetsApp
})

beforeEach(async () => {
  chainState.calls = []
  chainState.fetchCalls = []
  chainState.studySetReads = []
  chainState.studySetReadIndex = 0
  chainState.credits = 0n
  chainState.creditsPerFulfill = 1n
  chainState.fulfillError = null
  chainState.fulfillTxHash = `0x${'3'.repeat(64)}`
  chainState.lyricsText = [
    'Baby, can\'t you see I\'m callin\'',
    'A guy like you should wear a warning',
    'It\'s dangerous, I\'m fallin\'',
  ].join('\n')
  chainState.lyricsHash = await sha256HexUtf8(chainState.lyricsText)
  chainState.trackRegistered = true
  chainState.trackTitle = 'Toxic'
  chainState.trackArtist = 'Britney Spears'
  chainState.trackAlbum = 'In the Zone'
  chainState.cachedPack = {
    specVersion: 'exercise-pack-v2',
    trackId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    language: 'en',
    questions: [{ id: 'cached-1', type: 'say_it_back' }],
  }

  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    const method = (init?.method || 'GET').toUpperCase()
    chainState.fetchCalls.push({ method, url })

    if (url === 'https://arweave.net/lyrics-id' && method === 'GET') {
      return new Response(chainState.lyricsText, { status: 200 })
    }

    if (url === 'https://arweave.net/existing-pack-id' && method === 'GET') {
      return jsonResponse(chainState.cachedPack, 200)
    }

    if (url === 'https://load-agent.test/upload' && method === 'POST') {
      return jsonResponse({ id: 'generated-pack-id' }, 200)
    }

    if (url === 'https://load-agent.test/post/generated-pack-id' && method === 'POST') {
      return jsonResponse({ posted: true }, 200)
    }

    if (url === 'https://arweave.net/generated-pack-id' && method === 'HEAD') {
      return new Response('', { status: 200 })
    }

    if (url === 'https://openrouter.ai/api/v1/chat/completions' && method === 'POST') {
      const rawBody = typeof init?.body === 'string' ? init.body : '{}'
      const body = JSON.parse(rawBody) as {
        messages?: Array<{ content?: string }>
      }
      const userContent = String(body.messages?.[1]?.content ?? '')
      const lineIndexes = userContent
        .split('\n')
        .map((line) => /^\s*(\d+)\s*:/.exec(line)?.[1])
        .filter((v): v is string => !!v)
        .map((v) => Number(v))
      const unique = [...new Set(lineIndexes)]
      const payload = {
        lines: unique.map((index) => ({
          index,
          lang: 'en',
          lang2: '',
          difficulty: 2,
        })),
      }
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify(payload),
            },
          },
        ],
      }, 200)
    }

    throw new Error(`Unhandled fetch ${method} ${url}`)
  }) as typeof fetch
})

describe('POST /generate', () => {
  it('fails fast with 402 when user has insufficient onchain credits', async () => {
    chainState.studySetReads = [
      {
        studySetRef: '',
        studySetHash: `0x${'0'.repeat(64)}`,
        submitter: '0x0000000000000000000000000000000000000000',
        createdAt: 0,
        exists: false,
      },
    ]
    chainState.credits = 0n
    chainState.creditsPerFulfill = 1n

    const env = buildEnv()
    const result = await postGenerate(env, {
      trackId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      language: 'en',
      version: 1,
    })

    expectStatus(result, 402)
    expect(result.json.code).toBe('insufficient_credits')
    expect(result.json.requiredCredits).toBe('1')
    expect(result.json.availableCredits).toBe('0')

    expect(chainState.calls.map((c) => c.fn)).toEqual([
      'getStudySet',
      'credits',
      'CREDITS_PER_FULFILL',
    ])
    expect(chainState.fetchCalls.length).toBe(0)
  })

  it('returns canonical cached pack when fulfill races with existing write', async () => {
    const cachedPackJson = JSON.stringify(chainState.cachedPack)
    const cachedPackHash = await sha256HexUtf8(cachedPackJson)

    chainState.studySetReads = [
      {
        studySetRef: '',
        studySetHash: `0x${'0'.repeat(64)}`,
        submitter: '0x0000000000000000000000000000000000000000',
        createdAt: 0,
        exists: false,
      },
      {
        studySetRef: 'ar://existing-pack-id',
        studySetHash: cachedPackHash,
        submitter: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        createdAt: 1_739_980_810,
        exists: true,
      },
    ]
    chainState.credits = 2n
    chainState.creditsPerFulfill = 1n
    chainState.fulfillError = 'execution reverted: study set already set'

    const env = buildEnv()
    const result = await postGenerate(env, {
      trackId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      language: 'en',
      version: 1,
      sayItBackCount: 3,
    })

    expectStatus(result, 200)
    expect(result.json.success).toBe(true)
    expect(result.json.cached).toBe(true)
    expect(result.json.raceResolved).toBe(true)
    expect(result.json.pack).toEqual(chainState.cachedPack)

    const callNames = chainState.calls.map((c) => c.fn)
    expect(callNames).toContain('getStudySet')
    expect(callNames).toContain('credits')
    expect(callNames).toContain('getLyrics')
    expect(callNames).toContain('isRegistered')
    expect(callNames).toContain('getTrack')
    expect(callNames).toContain('fulfillFromCredit')

    const urls = chainState.fetchCalls.map((c) => `${c.method} ${c.url}`)
    expect(urls).toContain('GET https://arweave.net/lyrics-id')
    expect(urls).toContain('POST https://load-agent.test/upload')
    expect(urls).toContain('POST https://load-agent.test/post/generated-pack-id')
    expect(urls).toContain('GET https://arweave.net/existing-pack-id')
  })
})
