/** Default OpenAI-compatible chat completions endpoint. Override via StudySetGenOptions.apiBaseUrl. */
const DEFAULT_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type StudyQuestionType = 'say_it_back' | 'translation_mcq' | 'trivia_mcq'
export type StudyDifficulty = 'easy' | 'medium' | 'hard'

export interface StudyQuestion {
  id: string
  type: StudyQuestionType
  prompt: string
  excerpt: string
  choices: string[]
  correctIndex: number
  explanation: string
  difficulty: StudyDifficulty
  /** Language of the excerpt line */
  excerptLang?: string
  source?: 'genius'
  sourceClassification?: 'verified' | 'accepted' | 'unreviewed'
}

export interface TaggedLyricLine {
  text: string
  /** ISO 639-1 code of the primary language of this line */
  lang: string
  /** If the line mixes languages, secondary language code */
  lang2?: string
}

export interface StudySetPack {
  specVersion: 'exercise-pack-v1'
  trackId: string
  language: string
  sourceRefs: {
    lyricsRef: string | null
    geniusRef: string | null
  }
  generator: {
    model: string
    promptHash: string
    generatedAt: number
  }
  /** Per-line language tags for all lyric lines used */
  lineTags: TaggedLyricLine[]
  questions: StudyQuestion[]
  compliance: {
    excerptPolicy: 'max-one-line-per-question'
    attribution: {
      track: string
      artist: string
      geniusSongId: number | null
    }
  }
}

export interface GeniusReferentInput {
  fragment: string
  annotation: string
  classification?: string
  votesTotal?: number
  url?: string
}

export interface StudySetGenOptions {
  trackId: string
  /** Learner's target language (ISO 639-1) */
  language: string
  title: string
  artist: string
  lyrics: string
  lyricsRef?: string | null
  geniusSongId?: string | null
  geniusReferents?: GeniusReferentInput[]
  model?: string
  translationCount?: number
  triviaCount?: number
  sayItBackCount?: number
  /** Pre-computed line tags. If omitted, tagLyricLineLanguages() is called automatically. */
  precomputedLineTags?: TaggedLyricLine[]
  /** Override the chat completions API URL (default: OpenRouter). Use for DeepInfra, local, etc. */
  apiBaseUrl?: string
}

export interface StudySetGenResult {
  pack: StudySetPack
  promptHash: string
  model: string
  rawOutput: string
  warnings: string[]
}

export class StudySetValidationError extends Error {
  issues: string[]
  rawOutput?: string

  constructor(message: string, issues: string[], rawOutput?: string) {
    super(message)
    this.name = 'StudySetValidationError'
    this.issues = issues
    this.rawOutput = rawOutput
  }
}

type ModelPayload = {
  translation_mcq?: unknown
  trivia_mcq?: unknown
}

const DEFAULT_MODEL = 'google/gemini-3-flash-preview'
const DEFAULT_TRANSLATION_COUNT = 6
const DEFAULT_TRIVIA_COUNT = 4
const DEFAULT_SAY_IT_BACK_COUNT = 10
const MAX_LYRIC_LINES_FOR_PROMPT = 60
const MAX_REFERENTS_FOR_PROMPT = 24
const MAX_QUESTION_EXCERPT_LENGTH = 180
const MAX_PROMPT_LENGTH = 400
const MAX_EXPLANATION_LENGTH = 420

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function sanitizeLyricLine(line: string): string {
  let value = line.trim()
  value = value.replace(/^[-*\d.\)\s]+/, '').trim()
  value = value.replace(/\s*\((?:[Oo]oh|[Oo]h|[Yy]eah|[Aa]h|[Uu]h|[Ww]oo+|[Ll]a+|[Nn]a+)(?:[,\s]+(?:[Oo]oh|[Oo]h|[Yy]eah|[Aa]h|[Uu]h|[Ww]oo+|[Ll]a+|[Nn]a+|[a-z]+\s+[a-z]+))*\)\s*$/i, '').trim()
  value = value.replace(/\s*\[(?:x\d+|repeat.*?)\]\s*$/i, '').trim()
  return normalizeWhitespace(value)
}

function isSectionHeader(line: string): boolean {
  return /^\[[^\]]+\]$/.test(line.trim())
}

function isLikelyUsefulLyricLine(line: string): boolean {
  if (!line) return false
  if (line.length > MAX_QUESTION_EXCERPT_LENGTH) return false
  if (isSectionHeader(line)) return false
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length < 3) return false
  return true
}

function estimateDifficulty(text: string, isMixed?: boolean): StudyDifficulty {
  const words = text.split(/\s+/).filter(Boolean)
  if (isMixed) {
    // Mixed-language lines are inherently harder
    if (words.length <= 6) return 'medium'
    return 'hard'
  }
  if (words.length <= 5) return 'easy'
  if (words.length <= 10) return 'medium'
  return 'hard'
}

function toUnixSeconds(nowMs: number): number {
  return Math.floor(nowMs / 1000)
}

async function sha256HexString(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function collectLyricLines(lyrics: string): string[] {
  const dedupe = new Set<string>()
  const lines: string[] = []

  for (const raw of lyrics.split(/\r?\n/)) {
    const normalized = sanitizeLyricLine(raw)
    if (!isLikelyUsefulLyricLine(normalized)) continue

    const dedupeKey = normalized.toLowerCase()
    if (dedupe.has(dedupeKey)) continue
    dedupe.add(dedupeKey)
    lines.push(normalized)
  }

  return lines
}

function asBoundedCount(raw: number | undefined, fallback: number, min: number, max: number): number {
  if (raw == null) return fallback
  if (!Number.isFinite(raw)) return fallback
  const value = Math.floor(raw)
  if (value < min) return min
  if (value > max) return max
  return value
}

function normalizeReferentClassification(value: string | undefined): 'verified' | 'accepted' | 'unreviewed' {
  if (value === 'verified') return 'verified'
  if (value === 'accepted') return 'accepted'
  return 'unreviewed'
}

function stripJsonFence(raw: string): string {
  let value = raw.trim()
  if (value.startsWith('```json')) {
    value = value.slice(7).trim()
  } else if (value.startsWith('```')) {
    value = value.slice(3).trim()
  }
  if (value.endsWith('```')) {
    value = value.slice(0, -3).trim()
  }
  return value
}

// ---------------------------------------------------------------------------
// Per-line language tagging
// ---------------------------------------------------------------------------

const LINE_LANGUAGE_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'line_languages',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer', description: 'Zero-based line index from input' },
              lang: { type: 'string', description: 'ISO 639-1 code of primary language of this line' },
              lang2: { type: 'string', description: 'Secondary language if line mixes languages, or empty string if monolingual' },
            },
            required: ['index', 'lang', 'lang2'],
            additionalProperties: false,
          },
        },
      },
      required: ['lines'],
      additionalProperties: false,
    },
  },
}

/**
 * Tag each lyric line with its language(s) via a cheap LLM call.
 * Returns tagged lines in the same order as input.
 */
export async function tagLyricLineLanguages(
  apiKey: string,
  lines: string[],
  model?: string,
  apiBaseUrl?: string,
): Promise<TaggedLyricLine[]> {
  if (lines.length === 0) return []

  const system = [
    'Tag each numbered lyric line with its primary language (ISO 639-1 code).',
    'If a line mixes two languages (e.g. Korean words + English words), set lang to the dominant language and lang2 to the secondary.',
    'If a line is monolingual, set lang2 to empty string "".',
    'Ignore ad-libs and filler words (oh, yeah, uh) when determining language.',
    'Common codes: en, ko, ja, zh, es, fr, pt, de, it, hi, ar, th.',
  ].join('\n')

  const numbered = lines.map((l, i) => `${i}: ${l}`).join('\n')

  const raw = await callLlmApi(apiBaseUrl ?? DEFAULT_API_URL, apiKey, model ?? DEFAULT_MODEL, system, numbered, {
    responseFormat: LINE_LANGUAGE_RESPONSE_FORMAT,
    maxTokens: Math.min(lines.length * 30 + 100, 2000),
    temperature: 0,
  })

  const parsed = JSON.parse(stripJsonFence(raw)) as { lines: Array<{ index: number; lang: string; lang2: string }> }

  const langMap = new Map<number, { lang: string; lang2: string }>()
  for (const entry of parsed.lines ?? []) {
    if (typeof entry.index === 'number' && typeof entry.lang === 'string') {
      const lang2Raw = (entry.lang2 || '').toLowerCase().slice(0, 3).trim()
      langMap.set(entry.index, {
        lang: entry.lang.toLowerCase().slice(0, 3).trim(),
        lang2: lang2Raw || '',
      })
    }
  }

  return lines.map((text, i) => {
    const tags = langMap.get(i)
    return {
      text,
      lang: tags?.lang || 'und', // 'und' = undetermined, not 'en' — avoids English bias
      lang2: tags?.lang2 || undefined,
    }
  })
}

// ---------------------------------------------------------------------------
// Line selection by language
// ---------------------------------------------------------------------------

/** Check if a lang code matches the learner language (first 2 chars). */
function langMatches(code: string, learnerLang: string): boolean {
  return code.slice(0, 2) === learnerLang.slice(0, 2)
}

/**
 * Select lines suitable for translation MCQ.
 * A line is translatable if its primary language is NOT the learner's language.
 */
function selectTranslatableLines(taggedLines: TaggedLyricLine[], learnerLang: string): TaggedLyricLine[] {
  const lang = learnerLang.toLowerCase()
  return taggedLines.filter((line) => !langMatches(line.lang, lang))
}

/**
 * Select lines suitable for say-it-back.
 * All lines are valid — mixed-language lines get bumped difficulty.
 */
function selectSayItBackLines(taggedLines: TaggedLyricLine[]): TaggedLyricLine[] {
  return taggedLines // all lines are valid for say-it-back
}

// ---------------------------------------------------------------------------
// Say-it-back question builder (now language-aware)
// ---------------------------------------------------------------------------

function buildSayItBackQuestions(taggedLines: TaggedLyricLine[], maxCount: number): StudyQuestion[] {
  return selectSayItBackLines(taggedLines).slice(0, maxCount).map((line, i) => ({
    id: `sib-${String(i + 1).padStart(3, '0')}`,
    type: 'say_it_back' as const,
    prompt: 'Listen and repeat:',
    excerpt: line.text,
    choices: [],
    correctIndex: 0,
    explanation: 'Repeat clearly and match the rhythm and stress of the line.',
    difficulty: estimateDifficulty(line.text, !!line.lang2),
    excerptLang: line.lang,
  }))
}

// ---------------------------------------------------------------------------
// MCQ prompt builder (now uses tagged lines)
// ---------------------------------------------------------------------------

function buildPromptParts(
  opts: StudySetGenOptions,
  taggedLines: TaggedLyricLine[],
): {
  system: string
  user: string
  promptHashInput: string
  translationCount: number
  triviaCount: number
  skipTranslation: boolean
} {
  const learnerLang = opts.language.toLowerCase()
  const translatableLines = selectTranslatableLines(taggedLines, learnerLang)
  const skipTranslation = translatableLines.length === 0

  const translationCount = skipTranslation ? 0 : Math.min(
    asBoundedCount(opts.translationCount, DEFAULT_TRANSLATION_COUNT, 1, 12),
    translatableLines.length,
  )
  const referentCount = (opts.geniusReferents ?? []).filter((r) => typeof r.fragment === 'string' && typeof r.annotation === 'string').length
  const triviaCount = Math.min(asBoundedCount(opts.triviaCount, DEFAULT_TRIVIA_COUNT, 0, 12), referentCount)

  const promptLines = taggedLines.slice(0, MAX_LYRIC_LINES_FOR_PROMPT)
  const referents = (opts.geniusReferents ?? [])
    .filter((r) => typeof r.fragment === 'string' && typeof r.annotation === 'string')
    .slice(0, MAX_REFERENTS_FOR_PROMPT)
    .map((r, index) => ({
      id: index + 1,
      fragment: normalizeWhitespace(r.fragment),
      annotation: normalizeWhitespace(r.annotation),
      classification: normalizeReferentClassification(r.classification),
      votesTotal: typeof r.votesTotal === 'number' ? r.votesTotal : undefined,
      url: r.url,
    }))

  const translationRules = skipTranslation
    ? [
      'SKIP translation_mcq entirely (no translatable lines found — all lyrics are in the learner language).',
      'Return "translation_mcq": [].',
    ]
    : [
      'translation_mcq rules (Jeopardy-style):',
      '- ONLY use lines marked as translatable (lang !== learner language) for translation questions.',
      '- "prompt" is written in the LEARNER language. It gives the MEANING/TRANSLATION of the lyric line.',
      '  Format: "Which lyric means: \'[translation in learner language]\'?"',
      '- "excerpt" is the original lyric line from the song (in the song language).',
      '- "choices" are 4 original lyric lines from the song (in the song language).',
      '  One choice is the correct lyric line that matches the translation in the prompt.',
      '  The other 3 are real lyric lines from the same song that do NOT match the translation.',
      '- "explanation" is in the LEARNER language explaining why the correct line matches.',
      '- Do NOT put translations in the choices. Choices must be original lyric lines.',
    ]

  const system = [
    'You generate Jeopardy-style MCQ exercises from song lyrics and Genius annotations.',
    'Return JSON only. No markdown fences.',
    '',
    'Copyright constraints:',
    '- Each question references at most one lyric line in "excerpt".',
    '- No full verses or choruses.',
    '- Keep excerpt under 180 chars and single-line.',
    '',
    ...translationRules,
    '',
    'trivia_mcq rules:',
    '- Extract ONE specific, testable FACT from the provided Genius annotation.',
    '- Ask about concrete details: names, dates, events, production facts, inspirations.',
    '- Do NOT ask vague interpretation questions like "What does this line mean?".',
    '- The correct answer must be a specific fact stated in the annotation.',
    '- Distractors must be plausible but factually wrong (similar names, dates, events).',
    '- "sourceClassification" must match the referent classification (verified/accepted/unreviewed).',
    '- If no referents are provided, return trivia_mcq as an empty array.',
    '',
    'CRITICAL: correctIndex MUST be randomized. Do NOT always put the correct answer at index 0.',
    'Vary correctIndex across 0, 1, 2, 3 uniformly.',
    '',
    'Difficulty:',
    '- easy: basic facts (year, well-known collaborator, obvious meaning)',
    '- medium: specific details (chart position, production technique, lesser-known fact)',
    '- hard: obscure details (working titles, early demos, studio anecdotes)',
    '',
    'Use exactly 4 choices per MCQ. Each choice must be unique.',
    '',
    'Output schema:',
    '{',
    '  "translation_mcq": [',
    '    {"prompt":"...","excerpt":"...","choices":["...","...","...","..."],"correctIndex":N,"explanation":"...","difficulty":"easy|medium|hard"}',
    '  ],',
    '  "trivia_mcq": [',
    '    {"prompt":"...","excerpt":"...","choices":["...","...","...","..."],"correctIndex":N,"explanation":"...","difficulty":"easy|medium|hard","sourceClassification":"verified|accepted|unreviewed"}',
    '  ]',
    '}',
  ].join('\n')

  // Include language tags in the prompt so the model knows which lines are translatable
  const lyricLinesWithTags = promptLines.map((line) => ({
    text: line.text,
    lang: line.lang,
    lang2: line.lang2 || undefined,
  }))

  const userPayload = {
    learnerLanguage: opts.language,
    track: {
      id: opts.trackId,
      title: opts.title,
      artist: opts.artist,
    },
    counts: {
      translation_mcq: translationCount,
      trivia_mcq: triviaCount,
    },
    lyricLines: lyricLinesWithTags,
    geniusReferents: referents,
  }

  const user = JSON.stringify(userPayload)
  return {
    system,
    user,
    promptHashInput: `${system}\n---\n${user}`,
    translationCount,
    triviaCount,
    skipTranslation,
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible chat completions client
// ---------------------------------------------------------------------------

async function callLlmApi(
  apiUrl: string,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  opts?: { responseFormat?: Record<string, unknown>; maxTokens?: number; temperature?: number },
): Promise<string> {
  const trimmedApiKey = apiKey.trim()
  if (!trimmedApiKey) {
    throw new Error('API key is empty after trimming')
  }

  const body: Record<string, unknown> = {
    model,
    temperature: opts?.temperature ?? 0.2,
    max_tokens: opts?.maxTokens ?? 4000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }
  if (opts?.responseFormat) {
    body.response_format = opts.responseFormat
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${trimmedApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://heaven.computer',
      'X-Title': 'Heaven Study Sets',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM API error: ${response.status} - ${errorText}`)
  }

  const parsed = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const output = parsed.choices?.[0]?.message?.content?.trim()
  if (!output) {
    throw new Error('OpenRouter returned empty content')
  }

  return output
}

const STUDY_SET_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'study_set',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        translation_mcq: {
          type: 'array',
          description: 'Translation MCQ questions (Jeopardy-style)',
          items: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Question in learner language' },
              excerpt: { type: 'string', description: 'Original lyric line' },
              choices: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4, description: 'Exactly 4 choices' },
              correctIndex: { type: 'integer', minimum: 0, maximum: 3, description: '0-3 index of correct answer' },
              explanation: { type: 'string', description: 'Explanation in learner language' },
              difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            },
            required: ['prompt', 'excerpt', 'choices', 'correctIndex', 'explanation', 'difficulty'],
            additionalProperties: false,
          },
        },
        trivia_mcq: {
          type: 'array',
          description: 'Trivia MCQ questions from Genius annotations',
          items: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Factual trivia question' },
              excerpt: { type: 'string', description: 'Related lyric line' },
              choices: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4, description: 'Exactly 4 choices' },
              correctIndex: { type: 'integer', minimum: 0, maximum: 3, description: '0-3 index of correct answer' },
              explanation: { type: 'string', description: 'Explanation with source fact' },
              difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
              sourceClassification: { type: 'string', enum: ['verified', 'accepted', 'unreviewed'] },
            },
            required: ['prompt', 'excerpt', 'choices', 'correctIndex', 'explanation', 'difficulty', 'sourceClassification'],
            additionalProperties: false,
          },
        },
      },
      required: ['translation_mcq', 'trivia_mcq'],
      additionalProperties: false,
    },
  },
}

// ---------------------------------------------------------------------------
// Model output parsing & normalization
// ---------------------------------------------------------------------------

function fixCommonModelTypos(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(fixCommonModelTypos)
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = /^correct.{0,3}index$/i.test(k) ? 'correctIndex' : k
      out[key] = fixCommonModelTypos(v)
    }
    return out
  }
  return obj
}

function parseModelPayload(rawOutput: string): ModelPayload {
  const cleaned = stripJsonFence(rawOutput)
  const parsed = JSON.parse(cleaned) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StudySetValidationError('Model output must be a JSON object', ['root must be an object'], rawOutput)
  }
  return fixCommonModelTypos(parsed) as ModelPayload
}

function asStudyDifficulty(raw: string): StudyDifficulty | null {
  if (raw === 'easy' || raw === 'medium' || raw === 'hard') return raw
  return null
}

function normalizeMcqRecord(value: unknown, type: 'translation_mcq' | 'trivia_mcq', index: number, issues: string[]): StudyQuestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${type}[${index}] must be an object`)
    return null
  }

  const row = value as Record<string, unknown>
  const prompt = typeof row.prompt === 'string' ? normalizeWhitespace(row.prompt) : ''
  const excerpt = typeof row.excerpt === 'string' ? normalizeWhitespace(row.excerpt) : ''
  const explanation = typeof row.explanation === 'string' ? normalizeWhitespace(row.explanation) : ''
  const choicesRaw = Array.isArray(row.choices) ? row.choices : null
  const correctIndex = typeof row.correctIndex === 'number' ? Math.floor(row.correctIndex) : Number.NaN
  const difficulty = typeof row.difficulty === 'string' ? asStudyDifficulty(row.difficulty.trim()) : null

  if (!prompt) issues.push(`${type}[${index}].prompt is required`)
  if (prompt.length > MAX_PROMPT_LENGTH) issues.push(`${type}[${index}].prompt too long`)

  if (!excerpt) issues.push(`${type}[${index}].excerpt is required`)
  if (excerpt.length > MAX_QUESTION_EXCERPT_LENGTH) issues.push(`${type}[${index}].excerpt too long`)
  if (/\n|\r/.test(excerpt)) issues.push(`${type}[${index}].excerpt must be one line`)

  if (!explanation) issues.push(`${type}[${index}].explanation is required`)
  if (explanation.length > MAX_EXPLANATION_LENGTH) issues.push(`${type}[${index}].explanation too long`)

  if (!choicesRaw) {
    issues.push(`${type}[${index}].choices must be an array`)
    return null
  }

  const choices = choicesRaw
    .map((v) => (typeof v === 'string' ? normalizeWhitespace(v) : ''))
    .filter((v) => v.length > 0)

  if (choices.length !== 4) issues.push(`${type}[${index}].choices must contain exactly 4 non-empty strings`)
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
    issues.push(`${type}[${index}].correctIndex out of range`)
  }

  const dedupe = new Set(choices.map((v) => v.toLowerCase()))
  if (dedupe.size !== choices.length) {
    issues.push(`${type}[${index}].choices must be unique`)
  }

  if (!difficulty) issues.push(`${type}[${index}].difficulty must be easy|medium|hard`)

  let sourceClassification: 'verified' | 'accepted' | 'unreviewed' | undefined
  if (type === 'trivia_mcq') {
    sourceClassification = normalizeReferentClassification(typeof row.sourceClassification === 'string' ? row.sourceClassification : undefined)
  }

  if (issues.length > 0) {
    const hasFatal = issues.some((issue) => issue.startsWith(`${type}[${index}]`))
    if (hasFatal) return null
  }

  return {
    id: `${type === 'translation_mcq' ? 'tr' : 'tv'}-${String(index + 1).padStart(3, '0')}`,
    type,
    prompt,
    excerpt,
    choices,
    correctIndex,
    explanation,
    difficulty: difficulty ?? 'medium',
    source: type === 'trivia_mcq' ? 'genius' : undefined,
    sourceClassification,
  }
}

function normalizeModelQuestions(payload: ModelPayload): { translation: StudyQuestion[]; trivia: StudyQuestion[]; issues: string[] } {
  const issues: string[] = []
  const translationRows = Array.isArray(payload.translation_mcq) ? payload.translation_mcq : []
  const triviaRows = Array.isArray(payload.trivia_mcq) ? payload.trivia_mcq : []

  if (!Array.isArray(payload.translation_mcq)) {
    issues.push('translation_mcq must be an array')
  }

  if (!Array.isArray(payload.trivia_mcq)) {
    issues.push('trivia_mcq must be an array')
  }

  const translation: StudyQuestion[] = []
  const trivia: StudyQuestion[] = []

  translationRows.forEach((row, index) => {
    const rowIssues: string[] = []
    const item = normalizeMcqRecord(row, 'translation_mcq', index, rowIssues)
    if (item) translation.push(item)
    else issues.push(...rowIssues.map((i) => `[dropped] ${i}`))
  })

  triviaRows.forEach((row, index) => {
    const rowIssues: string[] = []
    const item = normalizeMcqRecord(row, 'trivia_mcq', index, rowIssues)
    if (item) trivia.push(item)
    else issues.push(...rowIssues.map((i) => `[dropped] ${i}`))
  })

  return { translation, trivia, issues }
}

function validateFinalQuestionSet(questions: StudyQuestion[]): string[] {
  const issues: string[] = []
  const seenIds = new Set<string>()

  if (questions.length === 0) {
    issues.push('questions must not be empty')
  }

  questions.forEach((q, index) => {
    if (seenIds.has(q.id)) {
      issues.push(`questions[${index}] duplicate id ${q.id}`)
    }
    seenIds.add(q.id)

    if (q.type === 'say_it_back' && q.choices.length !== 0) {
      issues.push(`questions[${index}] say_it_back choices must be empty`)
    }

    if (q.type !== 'say_it_back' && q.choices.length !== 4) {
      issues.push(`questions[${index}] mcq choices must be 4`)
    }

    if (q.correctIndex < 0 || q.correctIndex >= Math.max(1, q.choices.length || 1)) {
      issues.push(`questions[${index}] correctIndex out of range`)
    }
  })

  return issues
}

// ---------------------------------------------------------------------------
// Main generation entry point
// ---------------------------------------------------------------------------

export async function generateStudySetWithOpenRouter(apiKey: string, opts: StudySetGenOptions): Promise<StudySetGenResult> {
  if (!opts.trackId || !opts.trackId.trim()) {
    throw new StudySetValidationError('Invalid trackId', ['trackId is required'])
  }

  if (!opts.language || !opts.language.trim()) {
    throw new StudySetValidationError('Invalid language', ['language is required'])
  }

  if (!opts.lyrics || !opts.lyrics.trim()) {
    throw new StudySetValidationError('Invalid lyrics', ['lyrics is required'])
  }

  const lyricLines = collectLyricLines(opts.lyrics)
  if (lyricLines.length === 0) {
    throw new StudySetValidationError('No usable lyric lines', ['lyrics did not contain enough usable lines'])
  }

  const model = (opts.model || DEFAULT_MODEL).trim()

  // Step 1: Tag lines with languages (cheap LLM call, or use pre-computed tags)
  const taggedLines = opts.precomputedLineTags ?? await tagLyricLineLanguages(apiKey, lyricLines, model, opts.apiBaseUrl)

  // Step 2: Build say-it-back questions (deterministic, no LLM)
  const sayItBackCount = asBoundedCount(opts.sayItBackCount, DEFAULT_SAY_IT_BACK_COUNT, 1, 25)
  const sayItBack = buildSayItBackQuestions(taggedLines, sayItBackCount)

  // Step 3: Build MCQ prompt using tagged lines
  const { system, user, promptHashInput, translationCount, triviaCount, skipTranslation } = buildPromptParts(opts, taggedLines)
  const promptHash = `0x${await sha256HexString(promptHashInput)}`

  // Step 4: Call LLM for MCQ generation (skip if no MCQ needed)
  const needsLlm = translationCount > 0 || triviaCount > 0
  const rawOutput = needsLlm
    ? await callLlmApi(opts.apiBaseUrl ?? DEFAULT_API_URL, apiKey, model, system, user, { responseFormat: STUDY_SET_RESPONSE_FORMAT })
    : '{"translation_mcq":[],"trivia_mcq":[]}'

  let payload: ModelPayload
  try {
    payload = parseModelPayload(rawOutput)
  } catch (err) {
    if (err instanceof StudySetValidationError) throw err
    throw new StudySetValidationError('Model output is not valid JSON', ['failed to parse model output'], rawOutput)
  }

  const normalized = normalizeModelQuestions(payload)
  const hardIssues = normalized.issues.filter((i) => !i.startsWith('[dropped]'))
  const droppedIssues = normalized.issues.filter((i) => i.startsWith('[dropped]'))
  if (hardIssues.length > 0) {
    throw new StudySetValidationError('Model output failed validation', hardIssues, rawOutput)
  }

  const questions: StudyQuestion[] = [
    ...sayItBack,
    ...normalized.translation,
    ...normalized.trivia,
  ]

  const finalIssues = validateFinalQuestionSet(questions)
  if (finalIssues.length > 0) {
    throw new StudySetValidationError('Final question set failed validation', finalIssues, rawOutput)
  }

  const warnings: string[] = [...droppedIssues]
  if (skipTranslation) {
    warnings.push('translation_mcq skipped: no translatable lines (all lyrics match learner language).')
  }
  if ((opts.geniusReferents?.length ?? 0) === 0 && normalized.trivia.length === 0) {
    warnings.push('No genius referents provided; trivia_mcq is empty.')
  }
  if (!skipTranslation && normalized.translation.length !== translationCount) {
    warnings.push(`Requested ${translationCount} translation_mcq; model returned ${normalized.translation.length}.`)
  }
  if (normalized.trivia.length !== triviaCount) {
    warnings.push(`Requested ${triviaCount} trivia_mcq; model returned ${normalized.trivia.length}.`)
  }

  const pack: StudySetPack = {
    specVersion: 'exercise-pack-v1',
    trackId: opts.trackId.trim(),
    language: opts.language.trim(),
    sourceRefs: {
      lyricsRef: opts.lyricsRef?.trim() || null,
      geniusRef: opts.geniusSongId?.trim() ? `genius:${opts.geniusSongId.trim()}` : null,
    },
    generator: {
      model,
      promptHash,
      generatedAt: toUnixSeconds(Date.now()),
    },
    lineTags: taggedLines,
    questions,
    compliance: {
      excerptPolicy: 'max-one-line-per-question',
      attribution: {
        track: opts.title,
        artist: opts.artist,
        geniusSongId: opts.geniusSongId ? Number(opts.geniusSongId) : null,
      },
    },
  }

  return {
    pack,
    promptHash,
    model,
    rawOutput,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Pack validation (for external callers)
// ---------------------------------------------------------------------------

export function validateStudySetPack(pack: StudySetPack): string[] {
  const issues: string[] = []

  if (pack.specVersion !== 'exercise-pack-v1') issues.push('specVersion must be exercise-pack-v1')
  if (!pack.trackId.trim()) issues.push('trackId is required')
  if (!pack.language.trim()) issues.push('language is required')
  if (!pack.generator.model.trim()) issues.push('generator.model is required')
  if (!/^0x[a-f0-9]{64}$/.test(pack.generator.promptHash)) issues.push('generator.promptHash must be 0x + 64 hex chars')
  if (!Number.isInteger(pack.generator.generatedAt) || pack.generator.generatedAt <= 0) issues.push('generator.generatedAt must be a unix timestamp')
  if (!Array.isArray(pack.lineTags)) issues.push('lineTags must be an array')
  if (pack.compliance.excerptPolicy !== 'max-one-line-per-question') issues.push('compliance.excerptPolicy must be max-one-line-per-question')
  if (!pack.compliance.attribution.track.trim()) issues.push('compliance.attribution.track is required')
  if (!pack.compliance.attribution.artist.trim()) issues.push('compliance.attribution.artist is required')
  if (
    pack.compliance.attribution.geniusSongId !== null
    && (!Number.isInteger(pack.compliance.attribution.geniusSongId) || pack.compliance.attribution.geniusSongId <= 0)
  ) {
    issues.push('compliance.attribution.geniusSongId must be a positive integer or null')
  }

  issues.push(...validateFinalQuestionSet(pack.questions))
  return issues
}
