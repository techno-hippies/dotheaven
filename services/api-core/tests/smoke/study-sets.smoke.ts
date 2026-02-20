/**
 * Smoke test for study set generation flow.
 *
 * Calls POST /api/study-sets/generate for 3 configured songs and validates:
 * - expected counts (default 6 say_it_back / 4 translation_mcq / 3 trivia_mcq)
 * - difficultyScore exists for every question (1..5)
 * - sourceLineId exists in lineTags
 * - adjacent same-type questions only when mathematically unavoidable
 *
 * Usage:
 *   STUDY_SET_TRACK_IDS=0x...,0x...,0x... \
 *   TEST_USER_ADDRESS=0x... \
 *   bun run tests/smoke/study-sets.smoke.ts
 *
 * Alternative case input:
 *   STUDY_SET_SMOKE_CASES='[{"trackId":"0x...","language":"es","version":1}]' \
 *   TEST_USER_ADDRESS=0x... \
 *   bun run tests/smoke/study-sets.smoke.ts
 *
 * Optional env:
 *   API_BASE=http://localhost:8787
 *   STUDY_SET_LANGUAGE=es
 *   STUDY_SET_VERSION=1
 *   SAY_IT_BACK_COUNT=6
 *   TRANSLATION_COUNT=4
 *   TRIVIA_COUNT=3
 *   SMOKE_ALLOW_LLM_UNDERSHOOT=1    (allows translation/trivia to be expected-1 minimum)
 */

type QuestionType = 'say_it_back' | 'translation_mcq' | 'trivia_mcq'

type SmokeCase = {
  name?: string
  trackId: string
  language?: string
  version?: number
  sayItBackCount?: number
  translationCount?: number
  triviaCount?: number
}

const API_BASE = (process.env.API_BASE || process.env.API_CORE_URL || 'http://localhost:8787').replace(/\/+$/, '')
const TEST_USER_ADDRESS = (process.env.TEST_USER_ADDRESS || '').trim()
const DEFAULT_LANGUAGE = (process.env.STUDY_SET_LANGUAGE || 'es').trim()
const DEFAULT_VERSION = parsePositiveInt(process.env.STUDY_SET_VERSION, 1)
const DEFAULT_SAY_IT_BACK_COUNT = parsePositiveInt(process.env.SAY_IT_BACK_COUNT, 6)
const DEFAULT_TRANSLATION_COUNT = parsePositiveInt(process.env.TRANSLATION_COUNT, 4)
const DEFAULT_TRIVIA_COUNT = parsePositiveInt(process.env.TRIVIA_COUNT, 3)
const ALLOW_LLM_UNDERSHOOT = /^(1|true)$/i.test((process.env.SMOKE_ALLOW_LLM_UNDERSHOOT || '').trim())

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return parsed
}

function assertAddress(value: string, label: string): string {
  const normalized = value.trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a 0x-prefixed 40-hex address`)
  }
  return normalized
}

function assertBytes32(value: string, label: string): string {
  const normalized = value.trim()
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error(`${label} must be a 0x-prefixed 64-hex bytes32`)
  }
  return normalized
}

function parseCases(): SmokeCase[] {
  const fromJson = process.env.STUDY_SET_SMOKE_CASES?.trim()
  if (fromJson) {
    let parsed: unknown
    try {
      parsed = JSON.parse(fromJson)
    } catch (error) {
      throw new Error(`STUDY_SET_SMOKE_CASES is not valid JSON: ${String(error)}`)
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('STUDY_SET_SMOKE_CASES must be a non-empty JSON array')
    }
    return parsed.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`STUDY_SET_SMOKE_CASES[${index}] must be an object`)
      }
      const row = entry as Record<string, unknown>
      const trackId = assertBytes32(String(row.trackId || ''), `STUDY_SET_SMOKE_CASES[${index}].trackId`)
      const language = typeof row.language === 'string' && row.language.trim() ? row.language.trim() : DEFAULT_LANGUAGE
      const version = Number.isInteger(row.version) ? Number(row.version) : DEFAULT_VERSION
      const sayItBackCount = Number.isInteger(row.sayItBackCount) ? Number(row.sayItBackCount) : DEFAULT_SAY_IT_BACK_COUNT
      const translationCount = Number.isInteger(row.translationCount) ? Number(row.translationCount) : DEFAULT_TRANSLATION_COUNT
      const triviaCount = Number.isInteger(row.triviaCount) ? Number(row.triviaCount) : DEFAULT_TRIVIA_COUNT
      return {
        name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `case-${index + 1}`,
        trackId,
        language,
        version,
        sayItBackCount,
        translationCount,
        triviaCount,
      }
    })
  }

  const trackIdsRaw = (process.env.STUDY_SET_TRACK_IDS || '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)

  if (trackIdsRaw.length === 0) {
    throw new Error('Provide STUDY_SET_TRACK_IDS (comma-separated) or STUDY_SET_SMOKE_CASES JSON')
  }

  return trackIdsRaw.map((trackId, index) => ({
    name: `case-${index + 1}`,
    trackId: assertBytes32(trackId, `STUDY_SET_TRACK_IDS[${index}]`),
    language: DEFAULT_LANGUAGE,
    version: DEFAULT_VERSION,
    sayItBackCount: DEFAULT_SAY_IT_BACK_COUNT,
    translationCount: DEFAULT_TRANSLATION_COUNT,
    triviaCount: DEFAULT_TRIVIA_COUNT,
  }))
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; json: any }> {
  const res = await fetch(url, init)
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  return { status: res.status, json: parsed }
}

function countByType(types: QuestionType[]): Record<QuestionType, number> {
  return types.reduce(
    (acc, type) => {
      acc[type] += 1
      return acc
    },
    { say_it_back: 0, translation_mcq: 0, trivia_mcq: 0 } as Record<QuestionType, number>,
  )
}

function minimalUnavoidableAdjacencies(counts: Record<QuestionType, number>): number {
  const values = [counts.say_it_back, counts.translation_mcq, counts.trivia_mcq]
  const total = values.reduce((sum, value) => sum + value, 0)
  const max = Math.max(...values)
  const others = total - max
  return Math.max(0, max - (others + 1))
}

function observedAdjacencies(types: QuestionType[]): number {
  let adjacent = 0
  for (let i = 1; i < types.length; i += 1) {
    if (types[i] === types[i - 1]) adjacent += 1
  }
  return adjacent
}

function assertPackInvariants(params: {
  pack: any
  expectedSayItBack: number
  expectedTranslation: number
  expectedTrivia: number
  label: string
  allowLlmUndershoot: boolean
}) {
  const {
    pack,
    expectedSayItBack,
    expectedTranslation,
    expectedTrivia,
    label,
    allowLlmUndershoot,
  } = params
  if (!pack || typeof pack !== 'object') {
    throw new Error(`${label}: missing pack object`)
  }
  if (!Array.isArray(pack.questions)) {
    throw new Error(`${label}: pack.questions must be an array`)
  }
  if (!Array.isArray(pack.lineTags)) {
    throw new Error(`${label}: pack.lineTags must be an array`)
  }

  const types = pack.questions.map((question: any) => String(question?.type)) as QuestionType[]
  const counts = countByType(types)

  const minTranslation = allowLlmUndershoot ? Math.max(0, expectedTranslation - 1) : expectedTranslation
  const minTrivia = allowLlmUndershoot ? Math.max(0, expectedTrivia - 1) : expectedTrivia
  const translationOk = counts.translation_mcq >= minTranslation && counts.translation_mcq <= expectedTranslation
  const triviaOk = counts.trivia_mcq >= minTrivia && counts.trivia_mcq <= expectedTrivia

  if (counts.say_it_back !== expectedSayItBack || !translationOk || !triviaOk) {
    const mode = allowLlmUndershoot ? 'undershoot_allowed' : 'strict'
    throw new Error(
      `${label}: unexpected counts (${mode}) (got sib=${counts.say_it_back}, tr=${counts.translation_mcq}, tv=${counts.trivia_mcq}; expected sib=${expectedSayItBack}, tr=${minTranslation}-${expectedTranslation}, tv=${minTrivia}-${expectedTrivia})`,
    )
  }

  const lineIdSet = new Set<string>()
  for (const line of pack.lineTags) {
    const lineId = typeof line?.lineId === 'string' ? line.lineId.trim() : ''
    if (lineId) lineIdSet.add(lineId)
  }

  for (let i = 0; i < pack.questions.length; i += 1) {
    const q = pack.questions[i]
    const sourceLineId = typeof q?.sourceLineId === 'string' ? q.sourceLineId.trim() : ''
    if (!sourceLineId || !lineIdSet.has(sourceLineId)) {
      throw new Error(`${label}: questions[${i}] sourceLineId missing from lineTags`)
    }
    const difficultyScore = Number(q?.difficultyScore)
    if (!Number.isFinite(difficultyScore) || difficultyScore < 1 || difficultyScore > 5) {
      throw new Error(`${label}: questions[${i}] invalid difficultyScore=${String(q?.difficultyScore)}`)
    }
  }

  const unavoidable = minimalUnavoidableAdjacencies(counts)
  const observed = observedAdjacencies(types)
  if (observed > unavoidable) {
    throw new Error(`${label}: adjacent same-type questions too high (observed=${observed}, unavoidable=${unavoidable})`)
  }

  return { counts, unavoidable, observed }
}

async function main() {
  const userAddress = assertAddress(TEST_USER_ADDRESS, 'TEST_USER_ADDRESS')
  const cases = parseCases()
  if (cases.length !== 3) {
    throw new Error(`Expected exactly 3 smoke cases, got ${cases.length}`)
  }

  console.log('=== Study Set Generate Smoke Test ===')
  console.log(`API_BASE=${API_BASE}`)
  console.log(`TEST_USER_ADDRESS=${userAddress}`)
  console.log(`cases=${cases.length}`)
  console.log(`ALLOW_LLM_UNDERSHOOT=${ALLOW_LLM_UNDERSHOOT}`)

  const health = await fetchJson(`${API_BASE}/health`)
  if (health.status !== 200) {
    throw new Error(`Health check failed: status=${health.status} payload=${JSON.stringify(health.json)}`)
  }
  console.log('Health check ok')

  const results: Array<Record<string, unknown>> = []

  for (const [index, testCase] of cases.entries()) {
    const label = `${testCase.name || `case-${index + 1}`}:${testCase.trackId.slice(0, 10)}`
    const payload = {
      trackId: testCase.trackId,
      language: testCase.language ?? DEFAULT_LANGUAGE,
      version: testCase.version ?? DEFAULT_VERSION,
      sayItBackCount: testCase.sayItBackCount ?? DEFAULT_SAY_IT_BACK_COUNT,
      translationCount: testCase.translationCount ?? DEFAULT_TRANSLATION_COUNT,
      triviaCount: testCase.triviaCount ?? DEFAULT_TRIVIA_COUNT,
    }

    console.log(`POST /api/study-sets/generate ${label}`)
    const response = await fetchJson(`${API_BASE}/api/study-sets/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-address': userAddress,
      },
      body: JSON.stringify(payload),
    })

    if (response.status !== 200) {
      throw new Error(`${label}: generate failed status=${response.status} payload=${JSON.stringify(response.json)}`)
    }
    if (!response.json?.success || !response.json?.pack) {
      throw new Error(`${label}: invalid success payload=${JSON.stringify(response.json)}`)
    }

    const invariants = assertPackInvariants({
      pack: response.json.pack,
      expectedSayItBack: payload.sayItBackCount,
      expectedTranslation: payload.translationCount,
      expectedTrivia: payload.triviaCount,
      label,
      allowLlmUndershoot: ALLOW_LLM_UNDERSHOOT,
    })

    results.push({
      label,
      trackId: payload.trackId,
      language: payload.language,
      version: payload.version,
      cached: Boolean(response.json.cached),
      raceResolved: Boolean(response.json.raceResolved),
      counts: invariants.counts,
      adjacencies: {
        observed: invariants.observed,
        unavoidable: invariants.unavoidable,
      },
      allowLlmUndershoot: ALLOW_LLM_UNDERSHOOT,
      storage: response.json.storage
        ? {
          arweaveRef: response.json.storage.arweaveRef ?? null,
          payloadHash: response.json.storage.payloadHash ?? null,
        }
        : null,
    })
  }

  console.log('Study-set smoke passed')
  console.log(JSON.stringify({ ok: true, results }, null, 2))
}

main().catch((error) => {
  console.error('Study-set smoke failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
