import { Hono } from 'hono'
import type { Env } from '../types'
import {
  StudySetValidationError,
  generateStudySetWithOpenRouter,
  type GeniusReferentInput,
} from '../lib/study-set-generator'

const app = new Hono<{ Bindings: Env }>()

const MAX_LYRICS_BYTES = 256 * 1024
const MAX_REFERENTS = 48

type DebugGenerateBody = {
  trackId?: unknown
  title?: unknown
  artist?: unknown
  language?: unknown
  lyrics?: unknown
  lyricsRef?: unknown
  geniusSongId?: unknown
  geniusReferents?: unknown
  model?: unknown
  translationCount?: unknown
  triviaCount?: unknown
  sayItBackCount?: unknown
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asOptionalInt(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return undefined
}

function parseGeniusReferents(value: unknown): GeniusReferentInput[] {
  if (!Array.isArray(value)) return []

  const referents: GeniusReferentInput[] = []
  for (const row of value.slice(0, MAX_REFERENTS)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const record = row as Record<string, unknown>

    const fragment = asString(record.fragment)
    const annotation = asString(record.annotation)
    if (!fragment || !annotation) continue

    const classificationRaw = asString(record.classification)
    const votesTotalRaw = record.votesTotal
    const votesTotal = typeof votesTotalRaw === 'number' && Number.isFinite(votesTotalRaw)
      ? Math.floor(votesTotalRaw)
      : undefined

    referents.push({
      fragment,
      annotation,
      classification: classificationRaw ?? undefined,
      votesTotal,
      url: asString(record.url) ?? undefined,
    })
  }

  return referents
}

app.post('/debug-generate', async (c) => {
  const apiKey = c.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    return c.json({ success: false, error: 'Server misconfiguration (OPENROUTER_API_KEY missing)' }, 500)
  }

  let body: DebugGenerateBody
  try {
    body = await c.req.json() as DebugGenerateBody
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const trackId = asString(body.trackId) ?? `debug:${Date.now()}`
  const title = asString(body.title) ?? 'Unknown Title'
  const artist = asString(body.artist) ?? 'Unknown Artist'
  const language = asString(body.language)
  const lyrics = asString(body.lyrics)

  if (!language) {
    return c.json({ success: false, error: 'language is required' }, 400)
  }

  if (!lyrics) {
    return c.json({ success: false, error: 'lyrics is required' }, 400)
  }

  const lyricsBytes = new TextEncoder().encode(lyrics).byteLength
  if (lyricsBytes > MAX_LYRICS_BYTES) {
    return c.json({ success: false, error: `lyrics too large: ${lyricsBytes} > ${MAX_LYRICS_BYTES}` }, 400)
  }

  const geniusReferents = parseGeniusReferents(body.geniusReferents)

  try {
    const result = await generateStudySetWithOpenRouter(apiKey, {
      trackId,
      title,
      artist,
      language,
      lyrics,
      lyricsRef: asString(body.lyricsRef),
      geniusSongId: asString(body.geniusSongId),
      geniusReferents,
      model: asString(body.model) ?? c.env.OPENROUTER_STUDY_MODEL ?? undefined,
      apiBaseUrl: c.env.LLM_API_BASE_URL ?? undefined,
      translationCount: asOptionalInt(body.translationCount),
      triviaCount: asOptionalInt(body.triviaCount),
      sayItBackCount: asOptionalInt(body.sayItBackCount),
    })

    return c.json({
      success: true,
      model: result.model,
      promptHash: result.promptHash,
      warnings: result.warnings,
      counts: {
        total: result.pack.questions.length,
        sayItBack: result.pack.questions.filter((q) => q.type === 'say_it_back').length,
        translationMcq: result.pack.questions.filter((q) => q.type === 'translation_mcq').length,
        triviaMcq: result.pack.questions.filter((q) => q.type === 'trivia_mcq').length,
      },
      pack: result.pack,
    })
  } catch (err) {
    if (err instanceof StudySetValidationError) {
      return c.json({
        success: false,
        error: err.message,
        validationIssues: err.issues,
        rawModelOutput: err.rawOutput ?? null,
      }, 422)
    }

    const message = err instanceof Error ? err.message : String(err)
    return c.json({ success: false, error: message }, 500)
  }
})

export default app
