#!/usr/bin/env bun

import {
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  writeSync,
  readFileSync,
  rmSync,
  statSync,
  createReadStream,
  existsSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

type Provider = 'ls3-agent' | 'turbo-offchain'
type Mode = Provider | 'both'

interface Config {
  mode: Mode
  fileSizesMb: number[]
  iterations: number
  concurrency: number
  verifyResolve: boolean
  resolveRangeBytes: number
  reportPath?: string
  ls3: {
    baseUrl: string
    uploadPath: string
    gatewayUrl: string
    apiKey?: string
  }
  turbo: {
    uploadUrl: string
    timeoutMs: number
    walletJwkPath?: string
  }
}

interface Job {
  provider: Provider
  sizeMb: number
  iteration: number
  filePath: string
  sizeBytes: number
}

interface UploadResult {
  provider: Provider
  sizeMb: number
  sizeBytes: number
  iteration: number
  startedAtIso: string
  uploadDurationMs: number
  resolveDurationMs: number | null
  totalDurationMs: number
  uploadId: string | null
  gatewayUrl: string | null
  ok: boolean
  error?: string
}

interface UploadOutput {
  uploadId: string
  raw: unknown
}

function parseMode(raw: string | undefined): Mode {
  const value = (raw || 'both').trim().toLowerCase()
  if (value === 'ls3-agent' || value === 'turbo-offchain' || value === 'both') {
    return value
  }
  throw new Error(`Invalid MODE "${raw}". Expected ls3-agent | turbo-offchain | both`)
}

function parseIntEnv(raw: string | undefined, fallback: number, name: string): number {
  if (!raw || !raw.trim()) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`Invalid ${name}: "${raw}"`)
  }
  return parsed
}

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || !raw.trim()) return fallback
  const value = raw.trim().toLowerCase()
  if (value === '1' || value === 'true' || value === 'yes') return true
  if (value === '0' || value === 'false' || value === 'no') return false
  throw new Error(`Invalid boolean value "${raw}"`)
}

function parseFileSizes(raw: string | undefined): number[] {
  const input = (raw || '1,5,15').trim()
  const values = input
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
  if (values.length === 0) {
    throw new Error(`Invalid FILE_SIZES_MB "${raw}"`)
  }
  return Array.from(new Set(values))
}

function loadConfig(): Config {
  const envPath = resolve(process.cwd(), '.env')
  if (existsSync(envPath)) {
    loadDotEnvIntoProcess(envPath)
  }

  const config: Config = {
    mode: parseMode(process.env.MODE),
    fileSizesMb: parseFileSizes(process.env.FILE_SIZES_MB),
    iterations: parseIntEnv(process.env.ITERATIONS, 3, 'ITERATIONS'),
    concurrency: parseIntEnv(process.env.CONCURRENCY, 2, 'CONCURRENCY'),
    verifyResolve: parseBoolEnv(process.env.VERIFY_RESOLVE, true),
    resolveRangeBytes: parseIntEnv(process.env.RESOLVE_RANGE_BYTES, 2048, 'RESOLVE_RANGE_BYTES'),
    reportPath: process.env.REPORT_PATH?.trim() || undefined,
    ls3: {
      baseUrl: (process.env.LOAD_S3_AGENT_URL || 'https://load-s3-agent.load.network').trim(),
      uploadPath: (process.env.LOAD_S3_AGENT_UPLOAD_PATH || '/upload').trim(),
      gatewayUrl: (process.env.LOAD_GATEWAY_URL || 'https://gateway.s3-node-1.load.network').trim(),
      apiKey: process.env.LOAD_S3_AGENT_API_KEY?.trim() || undefined,
    },
    turbo: {
      uploadUrl: (
        process.env.LOAD_TURBO_UPLOAD_URL || 'https://loaded-turbo-api.load.network'
      ).trim(),
      timeoutMs: parseIntEnv(
        process.env.LOAD_TURBO_UPLOAD_TIMEOUT_MS,
        300_000,
        'LOAD_TURBO_UPLOAD_TIMEOUT_MS',
      ),
      walletJwkPath: process.env.TURBO_WALLET_JWK_PATH?.trim() || undefined,
    },
  }

  if ((config.mode === 'ls3-agent' || config.mode === 'both') && !config.ls3.apiKey) {
    throw new Error(
      'LOAD_S3_AGENT_API_KEY is required for ls3-agent mode. Set MODE=turbo-offchain to skip it.',
    )
  }

  return config
}

function loadDotEnvIntoProcess(filePath: string) {
  const contents = readFileSync(filePath, 'utf8')
  const lines = contents.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 1) continue
    const key = line.slice(0, idx).trim()
    if (!key || process.env[key] !== undefined) continue
    const value = line.slice(idx + 1).trim()
    const unquoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value
    process.env[key] = unquoted
  }
}

function mibToBytes(mib: number): number {
  return Math.floor(mib * 1024 * 1024)
}

function writeRandomFile(filePath: string, sizeBytes: number) {
  const fd = openSync(filePath, 'w')
  const chunkSize = 1024 * 1024
  const chunk = Buffer.allocUnsafe(chunkSize)

  try {
    let remaining = sizeBytes
    while (remaining > 0) {
      const writeLen = Math.min(remaining, chunkSize)
      randomBytes(writeLen).copy(chunk, 0, 0, writeLen)
      writeSync(fd, chunk, 0, writeLen)
      remaining -= writeLen
    }
  } finally {
    closeSync(fd)
  }
}

function setupTempFiles(fileSizesMb: number[]): { root: string; files: Map<number, string> } {
  const root = mkdtempSync(join(tmpdir(), 'load-poc-'))
  const files = new Map<number, string>()

  for (const sizeMb of fileSizesMb) {
    const filePath = join(root, `fixture-${sizeMb}MiB.bin`)
    writeRandomFile(filePath, mibToBytes(sizeMb))
    files.set(sizeMb, filePath)
  }

  return { root, files }
}

function buildJobs(config: Config, files: Map<number, string>): Job[] {
  const providers: Provider[] =
    config.mode === 'both' ? ['ls3-agent', 'turbo-offchain'] : [config.mode]
  const jobs: Job[] = []

  for (const provider of providers) {
    for (const sizeMb of config.fileSizesMb) {
      const filePath = files.get(sizeMb)
      if (!filePath) {
        throw new Error(`Missing temp file for ${sizeMb} MiB`)
      }
      const sizeBytes = statSync(filePath).size
      for (let i = 1; i <= config.iterations; i += 1) {
        jobs.push({
          provider,
          sizeMb,
          iteration: i,
          filePath,
          sizeBytes,
        })
      }
    }
  }

  return jobs
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let idx = 0

  async function consume() {
    while (true) {
      const current = idx
      idx += 1
      if (current >= items.length) return
      results[current] = await worker(items[current])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => consume())
  await Promise.all(workers)
  return results
}

function extractUploadId(payload: any): string | null {
  const candidates = [
    payload?.id,
    payload?.dataitemId,
    payload?.dataitem_id,
    payload?.receipt?.id,
    payload?.result?.id,
    payload?.result?.receipt?.id,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return null
}

async function verifyResolve(gatewayUrl: string, uploadId: string, rangeBytes: number) {
  const start = performance.now()
  const res = await fetch(`${gatewayUrl}/resolve/${uploadId}`, {
    headers: {
      Range: `bytes=0-${Math.max(0, rangeBytes - 1)}`,
    },
  })
  const elapsed = performance.now() - start
  if (!(res.status === 200 || res.status === 206)) {
    const body = await res.text()
    throw new Error(`Resolve failed (${res.status}): ${body.slice(0, 300)}`)
  }
  return elapsed
}

async function uploadViaLs3Agent(config: Config, filePath: string): Promise<UploadOutput> {
  const bytes = readFileSync(filePath)
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), basename(filePath))
  form.append('content_type', 'application/octet-stream')
  form.append(
    'tags',
    JSON.stringify([
      { name: 'App-Name', value: 'Heaven Load PoC' },
      { name: 'PoC', value: 'load-network-replacement-eval' },
    ]),
  )

  const uploadPath = config.ls3.uploadPath.startsWith('/')
    ? config.ls3.uploadPath
    : `/${config.ls3.uploadPath}`

  const res = await fetch(`${config.ls3.baseUrl}${uploadPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.ls3.apiKey || ''}`,
    },
    body: form,
  })

  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`LS3 upload failed (${res.status}): ${bodyText.slice(0, 500)}`)
  }

  let payload: unknown = {}
  try {
    payload = JSON.parse(bodyText)
  } catch {
    payload = { raw: bodyText }
  }

  const uploadId = extractUploadId(payload)
  if (!uploadId) {
    throw new Error(`LS3 upload succeeded but no upload id found in response: ${bodyText}`)
  }

  return { uploadId, raw: payload }
}

let turboClientSingleton: any | null = null

async function getTurboClient(config: Config): Promise<any> {
  if (turboClientSingleton) return turboClientSingleton

  const [{ TurboFactory, developmentTurboConfiguration }, ArweavePkg] = await Promise.all([
    import('@ardrive/turbo-sdk/node'),
    import('arweave'),
  ])
  const Arweave = (ArweavePkg as any).default || ArweavePkg

  let jwk: any
  if (config.turbo.walletJwkPath) {
    const jwkPath = resolve(process.cwd(), config.turbo.walletJwkPath)
    jwk = JSON.parse(readFileSync(jwkPath, 'utf8'))
  } else {
    const arweave = new Arweave({})
    jwk = await arweave.crypto.generateJWK()
  }

  const turboConfig = {
    ...developmentTurboConfiguration,
    uploadServiceConfig: {
      url: config.turbo.uploadUrl,
    },
  }

  turboClientSingleton = TurboFactory.authenticated({
    privateKey: jwk,
    ...turboConfig,
  })
  return turboClientSingleton
}

async function uploadViaTurbo(config: Config, filePath: string): Promise<UploadOutput> {
  const client = await getTurboClient(config)
  const size = statSync(filePath).size
  const uploadResult = await client.uploadFile({
    fileStreamFactory: () => createReadStream(filePath),
    fileSizeFactory: () => size,
    dataItemOpts: {
      tags: [
        { name: 'Content-Type', value: 'application/octet-stream' },
        { name: 'App-Name', value: 'Heaven Load PoC' },
        { name: 'PoC', value: 'load-network-replacement-eval' },
      ],
    },
    signal: AbortSignal.timeout(config.turbo.timeoutMs),
  })

  const uploadId = extractUploadId(uploadResult)
  if (!uploadId) {
    throw new Error(
      `Turbo upload succeeded but no upload id found in response: ${JSON.stringify(uploadResult)}`,
    )
  }
  return { uploadId, raw: uploadResult }
}

async function runJob(config: Config, job: Job): Promise<UploadResult> {
  const startedAt = new Date()
  const uploadStart = performance.now()
  try {
    const output =
      job.provider === 'ls3-agent'
        ? await uploadViaLs3Agent(config, job.filePath)
        : await uploadViaTurbo(config, job.filePath)

    const uploadDurationMs = performance.now() - uploadStart

    let resolveDurationMs: number | null = null
    if (config.verifyResolve) {
      resolveDurationMs = await verifyResolve(
        config.ls3.gatewayUrl,
        output.uploadId,
        config.resolveRangeBytes,
      )
    }

    const totalDurationMs = performance.now() - uploadStart
    return {
      provider: job.provider,
      sizeMb: job.sizeMb,
      sizeBytes: job.sizeBytes,
      iteration: job.iteration,
      startedAtIso: startedAt.toISOString(),
      uploadDurationMs,
      resolveDurationMs,
      totalDurationMs,
      uploadId: output.uploadId,
      gatewayUrl: `${config.ls3.gatewayUrl}/resolve/${output.uploadId}`,
      ok: true,
    }
  } catch (error) {
    const totalDurationMs = performance.now() - uploadStart
    return {
      provider: job.provider,
      sizeMb: job.sizeMb,
      sizeBytes: job.sizeBytes,
      iteration: job.iteration,
      startedAtIso: startedAt.toISOString(),
      uploadDurationMs: totalDurationMs,
      resolveDurationMs: null,
      totalDurationMs,
      uploadId: null,
      gatewayUrl: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`
}

function formatRate(value: number): string {
  return `${value.toFixed(2)} MiB/s`
}

function printSummary(results: UploadResult[]) {
  const providers: Provider[] = ['ls3-agent', 'turbo-offchain']
  console.log('\n=== Summary ===')
  console.log(
    'provider          size(MiB)  runs  success  fail  avg_upload   p50_upload   p95_upload   avg_throughput',
  )

  for (const provider of providers) {
    const providerResults = results.filter((r) => r.provider === provider)
    const sizes = Array.from(new Set(providerResults.map((r) => r.sizeMb))).sort((a, b) => a - b)

    for (const sizeMb of sizes) {
      const rows = providerResults.filter((r) => r.sizeMb === sizeMb)
      const okRows = rows.filter((r) => r.ok)
      const uploads = okRows.map((r) => r.uploadDurationMs)
      const rates = okRows.map((r) => sizeMb / (r.uploadDurationMs / 1000))

      const line = [
        provider.padEnd(16),
        String(sizeMb).padStart(9),
        String(rows.length).padStart(5),
        String(okRows.length).padStart(8),
        String(rows.length - okRows.length).padStart(5),
        formatMs(mean(uploads)).padStart(12),
        formatMs(percentile(uploads, 50)).padStart(12),
        formatMs(percentile(uploads, 95)).padStart(12),
        formatRate(mean(rates)).padStart(16),
      ].join('  ')
      console.log(line)
    }
  }
}

function defaultReportPath(): string {
  const reportsDir = resolve(process.cwd(), 'reports')
  mkdirSync(reportsDir, { recursive: true })
  return join(reportsDir, `load-poc-${Date.now()}.json`)
}

function redactConfig(config: Config): Record<string, unknown> {
  return {
    ...config,
    ls3: {
      ...config.ls3,
      apiKey: config.ls3.apiKey ? `${config.ls3.apiKey.slice(0, 6)}...` : undefined,
    },
  }
}

async function main() {
  const config = loadConfig()

  console.log('Load Network PoC benchmark')
  console.log(JSON.stringify(redactConfig(config), null, 2))

  const fixtures = setupTempFiles(config.fileSizesMb)
  const jobs = buildJobs(config, fixtures.files)
  const started = Date.now()

  try {
    console.log(`\nPrepared ${jobs.length} upload jobs across ${config.concurrency} workers.`)
    const results = await runWithConcurrency(jobs, config.concurrency, (job) => runJob(config, job))
    printSummary(results)

    const report = {
      meta: {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      },
      config: redactConfig(config),
      results,
    }

    const reportPath = config.reportPath
      ? resolve(process.cwd(), config.reportPath)
      : defaultReportPath()
    mkdirSync(dirname(reportPath), { recursive: true })
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\nReport written: ${reportPath}`)

    const failures = results.filter((r) => !r.ok)
    if (failures.length > 0) {
      console.log(`Failures: ${failures.length}/${results.length}`)
      for (const failure of failures.slice(0, 5)) {
        console.log(
          `- ${failure.provider} ${failure.sizeMb}MiB #${failure.iteration}: ${failure.error || 'unknown error'}`,
        )
      }
      process.exitCode = 1
    }
  } finally {
    rmSync(fixtures.root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
