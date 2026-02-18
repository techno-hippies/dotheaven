import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

type MockChainState = {
  isRegistered: boolean
  contentActive: boolean
  scrobbleWaitTimeout: boolean
  contentWaitTimeout: boolean
  calls: Array<{ fn: string; args: unknown[] }>
}

const chainState: MockChainState = {
  isRegistered: false,
  contentActive: false,
  scrobbleWaitTimeout: false,
  contentWaitTimeout: false,
  calls: [],
}

function fakeHash(input: unknown): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input)
  let acc = 0n
  for (let i = 0; i < raw.length; i++) {
    acc = (acc * 131n + BigInt(raw.charCodeAt(i))) & ((1n << 256n) - 1n)
  }
  return `0x${acc.toString(16).padStart(64, '0')}`
}

mock.module('ethers', () => {
  class MockAbiCoder {
    encode(types: string[], values: unknown[]): string {
      return JSON.stringify({ types, values })
    }
  }

  class MockProvider {
    constructor(_url: string, _chainId: number) {}
  }

  class MockWallet {
    constructor(_pk: string, _provider: MockProvider) {}
  }

  class MockContract {
    constructor(_address: string, _abi: string[], _wallet: MockWallet) {}

    async isRegistered(_trackId: string): Promise<boolean> {
      chainState.calls.push({ fn: 'isRegistered', args: [_trackId] })
      return chainState.isRegistered
    }

    async registerTracksBatch(...args: unknown[]): Promise<{ hash: string; wait: () => Promise<{ hash: string }> }> {
      chainState.calls.push({ fn: 'registerTracksBatch', args })
      chainState.isRegistered = true
      return {
        hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        wait: async () => {
          if (chainState.scrobbleWaitTimeout) {
            await new Promise(() => undefined)
          }
          return { hash: '0x1111111111111111111111111111111111111111111111111111111111111111' }
        },
      }
    }

    async getContent(_contentId: string): Promise<[string, string, string, number, number, boolean]> {
      chainState.calls.push({ fn: 'getContent', args: [_contentId] })
      return [
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0x',
        1,
        0,
        chainState.contentActive,
      ]
    }

    async registerContentFor(...args: unknown[]): Promise<{ hash: string; wait: () => Promise<{ hash: string }> }> {
      chainState.calls.push({ fn: 'registerContentFor', args })
      chainState.contentActive = true
      return {
        hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
        wait: async () => {
          if (chainState.contentWaitTimeout) {
            await new Promise(() => undefined)
          }
          return { hash: '0x2222222222222222222222222222222222222222222222222222222222222222' }
        },
      }
    }
  }

  return {
    AbiCoder: { defaultAbiCoder: () => new MockAbiCoder() },
    Contract: MockContract,
    JsonRpcProvider: MockProvider,
    Wallet: MockWallet,
    ZeroAddress: '0x0000000000000000000000000000000000000000',
    getAddress: (value: string) => value.toLowerCase(),
    id: (value: string) => fakeHash(value),
    keccak256: (value: unknown) => fakeHash(value),
  }
})

let musicApp: { request: (input: string, init: RequestInit, env: Record<string, unknown>) => Promise<Response> }

function baseJobRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000)
  return {
    job_id: 'music_test_job',
    user_pkp: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    status: 'policy_passed',
    publish_type: 'original',
    idempotency_key: null,
    file_name: 'track.mp3',
    content_type: 'audio/mpeg',
    file_size: 1234,
    audio_sha256: 'a'.repeat(64),
    fingerprint: 'sha256:test',
    duration_s: 180,
    staged_dataitem_id: 'staged_piece_cid',
    staged_gateway_url: 'https://gateway.example/staged_piece_cid',
    staged_payload_json: '{}',
    cover_staged_dataitem_id: 'cover_id',
    cover_staged_gateway_url: 'https://gateway.example/cover_id',
    cover_content_type: 'image/jpeg',
    cover_file_size: 1,
    cover_staged_payload_json: '{}',
    lyrics_staged_dataitem_id: 'lyrics_id',
    lyrics_staged_gateway_url: 'https://gateway.example/lyrics_id',
    lyrics_sha256: `0x${'b'.repeat(64)}`,
    lyrics_bytes: 12,
    lyrics_staged_payload_json: '{}',
    policy_decision: 'pass',
    policy_reason_code: null,
    policy_reason: null,
    parent_ip_ids_json: '[]',
    license_terms_ids_json: '[]',
    anchored_dataitem_id: null,
    arweave_ref: null,
    arweave_url: null,
    arweave_available: 0,
    anchor_payload_json: null,
    metadata_status: 'none',
    metadata_error: null,
    ip_metadata_uri: null,
    ip_metadata_hash: null,
    ip_metadata_dataitem_id: null,
    nft_metadata_uri: null,
    nft_metadata_hash: null,
    nft_metadata_dataitem_id: null,
    story_tx_hash: null,
    story_ip_id: null,
    story_token_id: null,
    story_license_terms_ids_json: null,
    story_block_number: null,
    megaeth_tx_hash: null,
    error_code: null,
    error_message: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

class MockDb {
  constructor(private row: Record<string, unknown>) {}

  prepare(sql: string) {
    const db = this
    return {
      sql,
      params: [] as unknown[],
      bind(...args: unknown[]) {
        this.params = args
        return this
      },
      async first<T>() {
        return db.first<T>(sql, this.params)
      },
      async run() {
        return db.run(sql, this.params)
      },
    }
  }

  private async first<T>(sql: string, params: unknown[]): Promise<T | null> {
    if (sql.includes('FROM user_identity')) {
      const userPkp = params[0]
      if (userPkp !== this.row.user_pkp) return null
      return { user_pkp: userPkp } as T
    }
    if (sql.includes('FROM music_upload_bans')) {
      return null
    }
    if (sql.includes('FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?')) {
      const [jobId, userPkp] = params
      if (jobId !== this.row.job_id || userPkp !== this.row.user_pkp) return null
      return { ...this.row } as T
    }
    throw new Error(`Unhandled first SQL: ${sql}`)
  }

  private async run(sql: string, params: unknown[]): Promise<{ meta: { changes: number } }> {
    if (sql.includes("SET status = 'registering'")) {
      const status = this.row.status as string
      if (!['policy_passed', 'anchored', 'registered'].includes(status)) {
        return { meta: { changes: 0 } }
      }
      this.row.status = 'registering'
      this.row.updated_at = params[0]
      return { meta: { changes: 1 } }
    }
    if (sql.includes("SET status = 'registered'")) {
      this.row.status = 'registered'
      this.row.megaeth_tx_hash = params[0]
      this.row.error_code = null
      this.row.error_message = null
      this.row.updated_at = params[1]
      return { meta: { changes: 1 } }
    }
    if (sql.includes("SET status = ?") && sql.includes("error_code = 'tempo_finalize_failed'")) {
      this.row.status = params[0]
      this.row.error_code = 'tempo_finalize_failed'
      this.row.error_message = params[1]
      this.row.updated_at = params[2]
      return { meta: { changes: 1 } }
    }
    throw new Error(`Unhandled run SQL: ${sql}`)
  }
}

function buildEnv(row: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    DB: new MockDb(row),
    TEMPO_RPC_URL: 'https://rpc.test.tempo.xyz',
    TEMPO_CHAIN_ID: '42431',
    TEMPO_SPONSOR_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
    TEMPO_OPERATOR_PRIVATE_KEY: `0x${'2'.repeat(64)}`,
    TEMPO_SCROBBLE_V4: '0x07B8BdE8BaD74DC974F783AA71C7C51d6B37C363',
    TEMPO_CONTENT_REGISTRY: '0x2A3beA895AE5bb4415c436155cbA15a97ACc2C77',
    TEMPO_TX_WAIT_TIMEOUT_MS: '1000',
    ...overrides,
  }
}

async function postFinalize(env: Record<string, unknown>, body: Record<string, unknown>) {
  const response = await musicApp.request(
    '/publish/music_test_job/finalize',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-pkp': '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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
    // Helps surface route failures during test iteration.
    // eslint-disable-next-line no-console
    console.log('unexpected response', result.status, result.json)
  }
  expect(result.status).toBe(expected)
}

beforeAll(async () => {
  const mod = await import('../src/routes/music')
  musicApp = mod.default as typeof musicApp
})

beforeEach(() => {
  chainState.isRegistered = false
  chainState.contentActive = false
  chainState.scrobbleWaitTimeout = false
  chainState.contentWaitTimeout = false
  chainState.calls = []
})

describe('POST /publish/:jobId/finalize', () => {
  it('returns cached when already registered with tempo evidence', async () => {
    const row = baseJobRow({
      status: 'registered',
      megaeth_tx_hash: '0xdeadbeef',
    })
    const env = buildEnv(row)
    const result = await postFinalize(env, { title: 'Song', artist: 'Artist', album: '' })

    expectStatus(result, 200)
    expect((result.json.registration as Record<string, unknown>).cached).toBe(true)
    expect(chainState.calls.length).toBe(0)
  })

  it('re-finalizes when status is registered but tempo evidence is missing', async () => {
    const row = baseJobRow({
      status: 'registered',
      megaeth_tx_hash: null,
    })
    const env = buildEnv(row)
    const result = await postFinalize(env, { title: 'Song', artist: 'Artist', album: '' })

    expectStatus(result, 200)
    expect(((result.json.job as Record<string, unknown>).status)).toBe('registered')
    expect(chainState.calls.some((v) => v.fn === 'registerTracksBatch')).toBe(true)
    expect(chainState.calls.some((v) => v.fn === 'registerContentFor')).toBe(true)
  })

  it('survives scrobble receipt timeout by rechecking on-chain state', async () => {
    chainState.scrobbleWaitTimeout = true
    const row = baseJobRow({ status: 'policy_passed' })
    const env = buildEnv(row, { TEMPO_TX_WAIT_TIMEOUT_MS: '1000' })

    const result = await postFinalize(env, { title: 'Song', artist: 'Artist', album: '' })

    expectStatus(result, 200)
    expect(chainState.calls.filter((v) => v.fn === 'isRegistered').length).toBe(2)
    expect(chainState.calls.some((v) => v.fn === 'registerTracksBatch')).toBe(true)
    expect(chainState.calls.some((v) => v.fn === 'registerContentFor')).toBe(true)
  })

  it('rejects metadata that exceeds 128-byte UTF-8 contract limit', async () => {
    const row = baseJobRow({ status: 'policy_passed' })
    const env = buildEnv(row)
    const tooLong = 'a'.repeat(129)

    const result = await postFinalize(env, { title: tooLong, artist: 'Artist', album: '' })

    expectStatus(result, 400)
    expect(result.json.error).toBe('title exceeds 128-byte UTF-8 contract limit')
    expect(chainState.calls.length).toBe(0)
  })
})
