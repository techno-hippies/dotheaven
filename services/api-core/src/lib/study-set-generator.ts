import { EN_TOP_1K, isTopEnglishWord } from './en-word-ranks'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type StudyQuestionType = 'say_it_back' | 'translation_mcq' | 'trivia_mcq'
export type StudyDifficulty = 'easy' | 'medium' | 'hard'

export interface StudyQuestion {
  id: string
  type: StudyQuestionType
  prompt: string
  excerpt: string
  choices: string[]
  correctIndex: number
  explanation?: string
  /** For MCQ: per-choice rationale aligned by index (why correct / why each distractor is wrong). */
  choiceRationales?: string[]
  difficulty: StudyDifficulty
  /** Numeric difficulty (1-5, rounded to 2 decimals) for adaptive ordering and SRS tuning. */
  difficultyScore: number
  /** References TaggedLyricLine.lineId */
  sourceLineId: string
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
  /** Hybrid difficulty score (1-5), where 1 is easiest */
  difficulty?: number
  /** LLM-provided difficulty score (1-5) */
  difficultyLlm?: number
  /** Deterministic lexical difficulty score (1-5) */
  difficultyLexical?: number
  /** Approximate Flesch-Kincaid grade used as lexical signal */
  fleschKincaid?: number
  /** Ratio of words in top-1k English list (0-1) */
  top1kRatio?: number
  /** Ratio of words in top-10k English list (0-1) */
  top10kRatio?: number
  /** Stable ID within the generated pack, e.g. L-001 */
  lineId: string
  /** Index in deduped line array (0-based) */
  lineIndex: number
  /** Raw line positions in original lyrics (0-based) where this exact text appears */
  allPositions: number[]
}

export interface StudySetPack {
  specVersion: 'exercise-pack-v2'
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

interface CollectedLine {
  text: string
  lineId: string
  lineIndex: number
  allPositions: number[]
}

const DEFAULT_MODEL = 'google/gemini-3-flash-preview'
const DEFAULT_TRANSLATION_COUNT = 4
const DEFAULT_TRIVIA_COUNT = 3
const DEFAULT_SAY_IT_BACK_COUNT = 6
const MAX_LYRIC_LINES_FOR_PROMPT = 36
const MAX_TRANSLATION_SOURCE_LINES = 24
const SAY_IT_BACK_REPEAT_TARGET = 2
const MAX_REFERENTS_FOR_PROMPT = 24
const MAX_QUESTION_EXCERPT_LENGTH = 180
const MAX_PROMPT_LENGTH = 400
const MAX_EXPLANATION_LENGTH = 420
const MAX_CHOICE_RATIONALE_LENGTH = 260

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

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return value
  return Math.round(value * 100) / 100
}

function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [])
}

function estimateSyllables(word: string): number {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!normalized) return 0
  if (normalized.length <= 3) return 1

  const vowels = normalized.match(/[aeiouy]+/g)
  let count = vowels ? vowels.length : 1
  if (normalized.endsWith('e') && !normalized.endsWith('le')) count -= 1
  return Math.max(1, count)
}

function estimateFleschKincaidGrade(text: string): number {
  const words = tokenizeWords(text)
  if (words.length === 0) return 0
  const sentenceCount = Math.max(1, (text.match(/[.!?]+/g) ?? []).length)
  const syllables = words.reduce((sum, w) => sum + estimateSyllables(w), 0)
  const grade = (0.39 * (words.length / sentenceCount)) + (11.8 * (syllables / words.length)) - 15.59
  return Number.isFinite(grade) ? grade : 0
}

type LexicalSignals = {
  difficulty: number
  fleschKincaid: number
  top1kRatio: number
  top10kRatio: number
}

function computeLexicalSignals(text: string): LexicalSignals {
  const words = tokenizeWords(text)
  if (words.length === 0) {
    return {
      difficulty: 3,
      fleschKincaid: 0,
      top1kRatio: 0,
      top10kRatio: 0,
    }
  }

  let top1kCount = 0
  let top10kCount = 0
  let longWordCount = 0
  for (const word of words) {
    if (EN_TOP_1K.has(word)) top1kCount += 1
    if (isTopEnglishWord(word, 10_000)) top10kCount += 1
    if (word.length >= 8) longWordCount += 1
  }

  const top1kRatio = top1kCount / words.length
  const top10kRatio = top10kCount / words.length
  const longWordRatio = longWordCount / words.length
  const fkGrade = estimateFleschKincaidGrade(text)
  const fkNorm = clamp((fkGrade - 2) / 10, 0, 1)
  const rarity = 1 - top1kRatio
  const lexicalNorm = clamp((0.55 * rarity) + (0.25 * fkNorm) + (0.20 * longWordRatio), 0, 1)
  const difficulty = 1 + (4 * lexicalNorm)

  return {
    difficulty,
    fleschKincaid: fkGrade,
    top1kRatio,
    top10kRatio,
  }
}

function toDifficultyLabel(value: number): StudyDifficulty {
  if (value < 2.5) return 'easy'
  if (value < 3.8) return 'medium'
  return 'hard'
}

function difficultyLabelToScore(value: StudyDifficulty): number {
  if (value === 'easy') return 2
  if (value === 'medium') return 3
  return 4
}

function buildDifficultyTargets(total: number): Record<StudyDifficulty, number> {
  const base = Math.floor(total / 3)
  const targets: Record<StudyDifficulty, number> = {
    easy: base,
    medium: base,
    hard: base,
  }

  let remaining = total - (base * 3)
  const remainderOrder: StudyDifficulty[] = ['medium', 'easy', 'hard']
  for (const bucket of remainderOrder) {
    if (remaining <= 0) break
    targets[bucket] += 1
    remaining -= 1
  }

  return targets
}

function interleaveQuestionGroups(groups: StudyQuestion[][]): StudyQuestion[] {
  type InterleaveCandidate = {
    index: number
    remaining: number
    nextType: StudyQuestionType
  }

  const queues = groups.map((group) => [...group])
  const output: StudyQuestion[] = []
  let lastType: StudyQuestionType | null = null

  while (true) {
    const candidates: InterleaveCandidate[] = queues
      .map((queue, index) => (queue.length > 0 ? { index, remaining: queue.length, nextType: queue[0].type } : null))
      .filter((candidate): candidate is InterleaveCandidate => candidate != null)
    if (candidates.length === 0) break

    const eligible: InterleaveCandidate[] = lastType == null
      ? candidates
      : candidates.filter((candidate) => candidate.nextType !== lastType)
    const pool: InterleaveCandidate[] = eligible.length > 0 ? eligible : candidates
    pool.sort((a, b) => {
      if (a.remaining !== b.remaining) return b.remaining - a.remaining
      return a.index - b.index
    })

    const chosenIndex = pool[0].index
    const nextQuestion = queues[chosenIndex].shift()
    if (!nextQuestion) break

    output.push(nextQuestion)
    lastType = nextQuestion.type
  }

  return output
}

function blendedLineDifficulty(params: {
  llmDifficulty?: number
  lexicalDifficulty: number
  isRepeated: boolean
  isMixed: boolean
}): number {
  const llm = params.llmDifficulty && Number.isFinite(params.llmDifficulty)
    ? clamp(params.llmDifficulty, 1, 5)
    : params.lexicalDifficulty

  let blended = (0.7 * llm) + (0.3 * params.lexicalDifficulty)
  if (params.isRepeated) blended -= 0.35
  if (params.isMixed) blended += 0.25
  return clamp(blended, 1, 5)
}

function lineDifficulty(line: TaggedLyricLine): number {
  if (typeof line.difficulty === 'number' && Number.isFinite(line.difficulty)) {
    return clamp(line.difficulty, 1, 5)
  }
  const lexical = computeLexicalSignals(line.text).difficulty
  return blendedLineDifficulty({
    llmDifficulty: line.difficultyLlm,
    lexicalDifficulty: typeof line.difficultyLexical === 'number' ? line.difficultyLexical : lexical,
    isRepeated: line.allPositions.length > 1,
    isMixed: !!line.lang2,
  })
}

function pickDistributedLines(lines: TaggedLyricLine[], count: number): TaggedLyricLine[] {
  if (count <= 0 || lines.length === 0) return []
  if (lines.length <= count) return [...lines]

  const selected: TaggedLyricLine[] = []
  const used = new Set<number>()
  const step = lines.length / count

  for (let i = 0; i < count; i += 1) {
    let target = Math.floor((i * step) + (step / 2))
    target = clamp(target, 0, lines.length - 1)

    if (used.has(target)) {
      let offset = 1
      while (target - offset >= 0 || target + offset < lines.length) {
        const left = target - offset
        const right = target + offset
        if (left >= 0 && !used.has(left)) {
          target = left
          break
        }
        if (right < lines.length && !used.has(right)) {
          target = right
          break
        }
        offset += 1
      }
    }

    if (!used.has(target)) {
      used.add(target)
      selected.push(lines[target])
    }
  }

  return selected
}

function toUnixSeconds(nowMs: number): number {
  return Math.floor(nowMs / 1000)
}

async function sha256HexString(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toLineId(index: number): string {
  return `L-${String(index + 1).padStart(3, '0')}`
}

function collectLyricLines(lyrics: string): CollectedLine[] {
  const dedupe = new Map<string, number>()
  const lines: CollectedLine[] = []
  const rawLines = lyrics.split(/\r?\n/)

  for (let rawPosition = 0; rawPosition < rawLines.length; rawPosition += 1) {
    const normalized = sanitizeLyricLine(rawLines[rawPosition])
    if (!isLikelyUsefulLyricLine(normalized)) continue

    const dedupeKey = normalized.toLowerCase()
    const existing = dedupe.get(dedupeKey)
    if (existing != null) {
      lines[existing].allPositions.push(rawPosition)
      continue
    }

    const lineIndex = lines.length
    lines.push({
      text: normalized,
      lineId: toLineId(lineIndex),
      lineIndex,
      allPositions: [rawPosition],
    })
    dedupe.set(dedupeKey, lineIndex)
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
              difficulty: { type: 'integer', minimum: 1, maximum: 5, description: 'Estimated learner difficulty for this line (1 easiest, 5 hardest)' },
            },
            required: ['index', 'lang', 'lang2', 'difficulty'],
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
  lines: CollectedLine[],
  model?: string,
): Promise<TaggedLyricLine[]> {
  if (lines.length === 0) return []

  const system = [
    'Tag each numbered lyric line with its primary language (ISO 639-1 code).',
    'If a line mixes two languages (e.g. Korean words + English words), set lang to the dominant language and lang2 to the secondary.',
    'If a line is monolingual, set lang2 to empty string "".',
    'Also score learner difficulty for each line on a 1-5 scale (1 easiest, 5 hardest).',
    'Use hints as guidance (top1k_ratio, top10k_ratio, flesch_kincaid, repetition_count), but apply judgment for slang/idioms/metaphors.',
    'Ignore ad-libs and filler words (oh, yeah, uh) when determining language.',
    'Common codes: en, ko, ja, zh, es, fr, pt, de, it, hi, ar, th.',
  ].join('\n')

  const lexicalByIndex = lines.map((line) => computeLexicalSignals(line.text))

  const numbered = lines.map((line, i) => {
    const lexical = lexicalByIndex[i]
    return [
      `${i}: ${line.text}`,
      `   hints: top1k_ratio=${lexical.top1kRatio.toFixed(2)} top10k_ratio=${lexical.top10kRatio.toFixed(2)} flesch_kincaid=${lexical.fleschKincaid.toFixed(2)} repetition_count=${line.allPositions.length}`,
    ].join('\n')
  }).join('\n')

  const raw = await callOpenRouter(apiKey, model ?? DEFAULT_MODEL, system, numbered, {
    responseFormat: LINE_LANGUAGE_RESPONSE_FORMAT,
    maxTokens: Math.min(lines.length * 30 + 100, 2000),
    temperature: 0,
  })

  const parsed = JSON.parse(stripJsonFence(raw)) as { lines: Array<{ index: number; lang: string; lang2: string; difficulty: number }> }

  const langMap = new Map<number, { lang: string; lang2: string; difficulty?: number }>()
  for (const entry of parsed.lines ?? []) {
    if (typeof entry.index === 'number' && typeof entry.lang === 'string') {
      const lang2Raw = (entry.lang2 || '').toLowerCase().slice(0, 3).trim()
      langMap.set(entry.index, {
        lang: entry.lang.toLowerCase().slice(0, 3).trim(),
        lang2: lang2Raw || '',
        difficulty: Number.isFinite(entry.difficulty) ? Math.floor(entry.difficulty) : undefined,
      })
    }
  }

  return lines.map((line, i) => {
    const tags = langMap.get(i)
    const lexical = lexicalByIndex[i]
    const difficulty = blendedLineDifficulty({
      llmDifficulty: tags?.difficulty,
      lexicalDifficulty: lexical.difficulty,
      isRepeated: line.allPositions.length > 1,
      isMixed: !!tags?.lang2,
    })
    return {
      text: line.text,
      lang: tags?.lang || 'und', // 'und' = undetermined, not 'en' — avoids English bias
      lang2: tags?.lang2 || undefined,
      difficulty: round2(difficulty),
      difficultyLlm: tags?.difficulty ? round2(clamp(tags.difficulty, 1, 5)) : undefined,
      difficultyLexical: round2(lexical.difficulty),
      fleschKincaid: round2(lexical.fleschKincaid),
      top1kRatio: round2(lexical.top1kRatio),
      top10kRatio: round2(lexical.top10kRatio),
      lineId: line.lineId,
      lineIndex: line.lineIndex,
      allPositions: [...line.allPositions],
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
  const candidates = taggedLines.filter((line) => !langMatches(line.lang, lang))
  if (candidates.length <= MAX_TRANSLATION_SOURCE_LINES) return candidates

  const ranked = [...candidates].sort((a, b) => {
    const aScore = Math.abs(lineDifficulty(a) - 3.3)
      + (a.allPositions.length > 1 ? 0.35 : 0)
      + (tokenizeWords(a.text).length < 4 ? 0.25 : 0)
    const bScore = Math.abs(lineDifficulty(b) - 3.3)
      + (b.allPositions.length > 1 ? 0.35 : 0)
      + (tokenizeWords(b.text).length < 4 ? 0.25 : 0)
    if (aScore !== bScore) return aScore - bScore
    return a.lineIndex - b.lineIndex
  })

  const pool = ranked.slice(0, Math.min(candidates.length, MAX_TRANSLATION_SOURCE_LINES * 2))
  const byIndex = [...pool].sort((a, b) => a.lineIndex - b.lineIndex)
  return pickDistributedLines(byIndex, MAX_TRANSLATION_SOURCE_LINES).sort((a, b) => a.lineIndex - b.lineIndex)
}

function normalizeLooseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findLineByReferentFragment(lines: TaggedLyricLine[], fragment: string): TaggedLyricLine | null {
  const normalizedFragment = normalizeLooseText(fragment)
  if (!normalizedFragment) return null

  let best: TaggedLyricLine | null = null
  let bestScore = -1
  for (const line of lines) {
    const normalizedLine = normalizeLooseText(line.text)
    if (!normalizedLine) continue
    if (!(normalizedLine.includes(normalizedFragment) || normalizedFragment.includes(normalizedLine))) continue
    const overlap = Math.min(normalizedLine.length, normalizedFragment.length)
    if (overlap > bestScore) {
      best = line
      bestScore = overlap
    }
  }

  return best
}

// ---------------------------------------------------------------------------
// Say-it-back question builder (now language-aware)
// ---------------------------------------------------------------------------

function selectSayItBackQuestionLines(taggedLines: TaggedLyricLine[], maxCount: number): TaggedLyricLine[] {
  const candidates = [...taggedLines]
  if (candidates.length === 0) return []
  if (maxCount >= candidates.length) {
    return [...candidates].sort((a, b) => a.lineIndex - b.lineIndex)
  }

  const targetByDifficulty = buildDifficultyTargets(maxCount)
  const selected = new Map<string, TaggedLyricLine>()
  const selectedDifficultyCounts: Record<StudyDifficulty, number> = { easy: 0, medium: 0, hard: 0 }

  const addSelected = (line: TaggedLyricLine) => {
    if (selected.has(line.lineId)) return
    selected.set(line.lineId, line)
    selectedDifficultyCounts[toDifficultyLabel(lineDifficulty(line))] += 1
  }

  const repeated = candidates
    .filter((line) => line.allPositions.length > 1)
    .sort((a, b) => a.lineIndex - b.lineIndex)

  const repeatedTake = Math.min(SAY_IT_BACK_REPEAT_TARGET, maxCount, repeated.length)
  const repeatedPool = [...repeated]
  for (let i = 0; i < repeatedTake; i += 1) {
    repeatedPool.sort((a, b) => {
      const aBucket = toDifficultyLabel(lineDifficulty(a))
      const bBucket = toDifficultyLabel(lineDifficulty(b))
      const aNeed = targetByDifficulty[aBucket] - selectedDifficultyCounts[aBucket]
      const bNeed = targetByDifficulty[bBucket] - selectedDifficultyCounts[bBucket]
      if (aNeed !== bNeed) return bNeed - aNeed
      return a.lineIndex - b.lineIndex
    })

    const next = repeatedPool.shift()
    if (!next) break
    addSelected(next)
  }

  for (const bucket of ['easy', 'medium', 'hard'] as const) {
    const needed = Math.max(0, targetByDifficulty[bucket] - selectedDifficultyCounts[bucket])
    if (needed <= 0) continue

    const pool = candidates
      .filter((line) => !selected.has(line.lineId) && toDifficultyLabel(lineDifficulty(line)) === bucket)
      .sort((a, b) => a.lineIndex - b.lineIndex)
    for (const line of pickDistributedLines(pool, needed)) {
      addSelected(line)
    }
  }

  const remainingNeeded = Math.max(0, maxCount - selected.size)
  const remainingPool = candidates
    .filter((line) => !selected.has(line.lineId))
    .sort((a, b) => a.lineIndex - b.lineIndex)
  for (const line of pickDistributedLines(remainingPool, remainingNeeded)) {
    addSelected(line)
  }

  const ordered = [...selected.values()]
    .sort((a, b) => a.lineIndex - b.lineIndex)
    .slice(0, maxCount)

  const selectedCounts: Record<StudyDifficulty, number> = { easy: 0, medium: 0, hard: 0 }
  for (const line of ordered) {
    selectedCounts[toDifficultyLabel(lineDifficulty(line))] += 1
  }

  for (const bucket of ['easy', 'medium', 'hard'] as const) {
    const deficit = targetByDifficulty[bucket] - selectedCounts[bucket]
    if (deficit <= 0) continue

    const replacements = candidates
      .filter((line) => !ordered.some((s) => s.lineId === line.lineId) && toDifficultyLabel(lineDifficulty(line)) === bucket)
      .sort((a, b) => a.lineIndex - b.lineIndex)
      .slice(0, deficit)

    for (const replacement of replacements) {
      const surplusBucket = (['easy', 'medium', 'hard'] as const)
        .find((candidateBucket) => selectedCounts[candidateBucket] > targetByDifficulty[candidateBucket])
      if (!surplusBucket) break

      const replaceIndex = ordered.findIndex((line) => toDifficultyLabel(lineDifficulty(line)) === surplusBucket)
      if (replaceIndex < 0) break

      ordered[replaceIndex] = replacement
      selectedCounts[surplusBucket] -= 1
      selectedCounts[bucket] += 1
    }
  }

  return ordered
    .sort((a, b) => a.lineIndex - b.lineIndex)
    .slice(0, maxCount)
}

function buildSayItBackQuestions(taggedLines: TaggedLyricLine[], maxCount: number): StudyQuestion[] {
  return selectSayItBackQuestionLines(taggedLines, maxCount)
    .map((line, i) => {
      const difficultyScore = round2(lineDifficulty(line))
      const difficulty = toDifficultyLabel(difficultyScore)
      return {
        id: `sib-${String(i + 1).padStart(3, '0')}`,
        type: 'say_it_back' as const,
        prompt: '',
        excerpt: line.text,
        choices: [],
        correctIndex: 0,
        difficulty,
        difficultyScore,
        sourceLineId: line.lineId,
        excerptLang: line.lang,
      }
    })
}

// ---------------------------------------------------------------------------
// MCQ prompt builder (now uses tagged lines)
// ---------------------------------------------------------------------------

function buildPromptParts(
  opts: StudySetGenOptions,
  taggedLines: TaggedLyricLine[],
  sayItBackLineIds: string[],
): {
  system: string
  user: string
  promptHashInput: string
  translationCount: number
  triviaCount: number
  skipTranslation: boolean
  promptLineIds: string[]
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

  const promptLineMap = new Map<string, TaggedLyricLine>()
  const lineById = new Map(taggedLines.map((line) => [line.lineId, line]))
  for (const ref of referents) {
    const match = findLineByReferentFragment(taggedLines, ref.fragment)
    if (match) promptLineMap.set(match.lineId, match)
  }
  for (const line of translatableLines) {
    if (promptLineMap.size >= MAX_LYRIC_LINES_FOR_PROMPT) break
    promptLineMap.set(line.lineId, line)
  }
  for (const lineId of sayItBackLineIds) {
    if (promptLineMap.size >= MAX_LYRIC_LINES_FOR_PROMPT) break
    const line = lineById.get(lineId)
    if (line) promptLineMap.set(line.lineId, line)
  }
  for (const line of taggedLines) {
    if (promptLineMap.size >= MAX_LYRIC_LINES_FOR_PROMPT) break
    promptLineMap.set(line.lineId, line)
  }
  const promptLines = [...promptLineMap.values()].sort((a, b) => a.lineIndex - b.lineIndex)

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
      '- "sourceLineId" must be the lineId of the excerpt line.',
      '- "choices" are 4 original lyric lines from the song (in the song language).',
      '  One choice is the correct lyric line that matches the translation in the prompt.',
      '  The other 3 are real lyric lines from the same song that do NOT match the translation.',
      '- "explanation" is in the LEARNER language explaining why the correct line matches.',
      '- "choiceRationales" is an array of 4 strings aligned to "choices" by index.',
      '  At correctIndex: explain why that choice is correct.',
      '  At other indexes: explain specifically why each choice is wrong.',
      '  Do NOT prefix rationale text with labels like "Correcto:", "Incorrecto:", "Correct:", "Wrong:".',
      '- Do NOT put translations in the choices. Choices must be original lyric lines.',
    ]

  const system = [
    'You generate Jeopardy-style MCQ exercises from song lyrics and Genius annotations.',
    'Return JSON only. No markdown fences.',
    'For BOTH translation_mcq and trivia_mcq: write prompt, explanation, and choiceRationales in the learner language.',
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
    '- "sourceLineId" must be the lineId of the excerpt line.',
    '- "choiceRationales" is an array of 4 strings aligned to "choices" by index.',
    '  At correctIndex: explain why that choice is correct.',
    '  At other indexes: explain specifically why each choice is wrong per annotation fact.',
    '  Do NOT prefix rationale text with labels like "Correcto:", "Incorrecto:", "Correct:", "Wrong:".',
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
    '    {"prompt":"...","excerpt":"...","sourceLineId":"L-001","choices":["...","...","...","..."],"correctIndex":N,"explanation":"...","choiceRationales":["...","...","...","..."],"difficulty":"easy|medium|hard"}',
    '  ],',
    '  "trivia_mcq": [',
    '    {"prompt":"...","excerpt":"...","sourceLineId":"L-001","choices":["...","...","...","..."],"correctIndex":N,"explanation":"...","choiceRationales":["...","...","...","..."],"difficulty":"easy|medium|hard","sourceClassification":"verified|accepted|unreviewed"}',
    '  ]',
    '}',
  ].join('\n')

  // Include language tags in the prompt so the model knows which lines are translatable
  const lyricLinesWithTags = promptLines.map((line) => ({
    lineId: line.lineId,
    text: line.text,
    lang: line.lang,
    lang2: line.lang2 || undefined,
    difficulty: Number(lineDifficulty(line).toFixed(2)),
    lexicalHints: {
      top1kRatio: Number((line.top1kRatio ?? 0).toFixed(2)),
      top10kRatio: Number((line.top10kRatio ?? 0).toFixed(2)),
      fleschKincaid: Number((line.fleschKincaid ?? 0).toFixed(2)),
      repetitionCount: line.allPositions.length,
    },
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
    promptLineIds: promptLines.map((line) => line.lineId),
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible chat completions client
// ---------------------------------------------------------------------------

async function callOpenRouter(
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

  const response = await fetch(OPENROUTER_API_URL, {
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

function buildStudySetResponseFormat(validLineIds: string[]) {
  const lineIdEnum = validLineIds.length > 0 ? validLineIds : ['L-001']

  return {
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
                sourceLineId: { type: 'string', enum: lineIdEnum, description: 'lineId of excerpt source line' },
                choices: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4, description: 'Exactly 4 choices' },
                correctIndex: { type: 'integer', minimum: 0, maximum: 3, description: '0-3 index of correct answer' },
                explanation: { type: 'string', description: 'Explanation in learner language' },
                choiceRationales: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 4,
                  maxItems: 4,
                  description: 'Per-choice rationales aligned by index',
                },
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
              },
              required: ['prompt', 'excerpt', 'sourceLineId', 'choices', 'correctIndex', 'explanation', 'choiceRationales', 'difficulty'],
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
                sourceLineId: { type: 'string', enum: lineIdEnum, description: 'lineId of excerpt source line' },
                choices: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4, description: 'Exactly 4 choices' },
                correctIndex: { type: 'integer', minimum: 0, maximum: 3, description: '0-3 index of correct answer' },
                explanation: { type: 'string', description: 'Explanation with source fact' },
                choiceRationales: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 4,
                  maxItems: 4,
                  description: 'Per-choice rationales aligned by index',
                },
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                sourceClassification: { type: 'string', enum: ['verified', 'accepted', 'unreviewed'] },
              },
              required: ['prompt', 'excerpt', 'sourceLineId', 'choices', 'correctIndex', 'explanation', 'choiceRationales', 'difficulty', 'sourceClassification'],
              additionalProperties: false,
            },
          },
        },
        required: ['translation_mcq', 'trivia_mcq'],
        additionalProperties: false,
      },
    },
  }
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

function stripRationaleLabelPrefix(input: string): string {
  const cleaned = normalizeWhitespace(input)
  if (!cleaned) return cleaned

  const withoutPrefix = cleaned.replace(
    /^\s*(?:correct|incorrect|right|wrong|true|false|correcto|incorrecto|verdadero|falso|richtig|falsch|corretto|errato|vrai|faux|正解|不正解|正确|错误|맞음|틀림)\s*[:.\-–—]\s*/iu,
    '',
  )
  return normalizeWhitespace(withoutPrefix || cleaned)
}

function seededRng(seedInput: string): () => number {
  let seed = 2166136261 >>> 0
  for (let i = 0; i < seedInput.length; i += 1) {
    seed ^= seedInput.charCodeAt(i)
    seed = Math.imul(seed, 16777619)
  }
  let state = seed || 0x9e3779b9
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffledIndexes(size: number, rng: () => number): number[] {
  const order = Array.from({ length: size }, (_, i) => i)
  for (let i = size - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const temp = order[i]
    order[i] = order[j]
    order[j] = temp
  }
  return order
}

function scrambleMcqChoices(question: StudyQuestion, seedInput: string): StudyQuestion {
  if (question.type === 'say_it_back') return question
  if (question.choices.length !== 4) return question
  if (!Array.isArray(question.choiceRationales) || question.choiceRationales.length !== 4) return question

  const rng = seededRng(seedInput)
  let order = shuffledIndexes(4, rng)
  if (order.every((value, index) => value === index)) {
    // Avoid identity order so model bias (e.g. always index 0) is neutralized.
    order = [1, 2, 3, 0]
  }

  const newCorrectIndex = order.indexOf(question.correctIndex)
  if (newCorrectIndex < 0) return question

  return {
    ...question,
    choices: order.map((oldIndex) => question.choices[oldIndex]),
    choiceRationales: order.map((oldIndex) => question.choiceRationales![oldIndex]),
    correctIndex: newCorrectIndex,
  }
}

function scrambleMcqQuestions(questions: StudyQuestion[], promptHash: string): StudyQuestion[] {
  return questions.map((question, index) => {
    if (question.type === 'say_it_back') return question
    return scrambleMcqChoices(question, `${promptHash}:${question.id}:${index}`)
  })
}

function normalizeMcqRecord(
  value: unknown,
  type: 'translation_mcq' | 'trivia_mcq',
  index: number,
  issues: string[],
  lineById: Map<string, TaggedLyricLine>,
): StudyQuestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${type}[${index}] must be an object`)
    return null
  }

  const row = value as Record<string, unknown>
  const prompt = typeof row.prompt === 'string' ? normalizeWhitespace(row.prompt) : ''
  const excerpt = typeof row.excerpt === 'string' ? normalizeWhitespace(row.excerpt) : ''
  const sourceLineId = typeof row.sourceLineId === 'string' ? normalizeWhitespace(row.sourceLineId) : ''
  const explanation = typeof row.explanation === 'string' ? normalizeWhitespace(row.explanation) : ''
  const choiceRationalesRaw = Array.isArray(row.choiceRationales) ? row.choiceRationales : null
  const choicesRaw = Array.isArray(row.choices) ? row.choices : null
  const correctIndex = typeof row.correctIndex === 'number' ? Math.floor(row.correctIndex) : Number.NaN
  const difficulty = typeof row.difficulty === 'string' ? asStudyDifficulty(row.difficulty.trim()) : null

  if (!prompt) issues.push(`${type}[${index}].prompt is required`)
  if (prompt.length > MAX_PROMPT_LENGTH) issues.push(`${type}[${index}].prompt too long`)

  if (!excerpt) issues.push(`${type}[${index}].excerpt is required`)
  if (excerpt.length > MAX_QUESTION_EXCERPT_LENGTH) issues.push(`${type}[${index}].excerpt too long`)
  if (/\n|\r/.test(excerpt)) issues.push(`${type}[${index}].excerpt must be one line`)

  if (!sourceLineId) issues.push(`${type}[${index}].sourceLineId is required`)
  const sourceLine = lineById.get(sourceLineId)
  if (!sourceLine) issues.push(`${type}[${index}].sourceLineId not found in lineTags`)

  if (!explanation) issues.push(`${type}[${index}].explanation is required`)
  if (explanation.length > MAX_EXPLANATION_LENGTH) issues.push(`${type}[${index}].explanation too long`)
  if (!choiceRationalesRaw) {
    issues.push(`${type}[${index}].choiceRationales must be an array`)
    return null
  }

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

  const choiceRationales = choiceRationalesRaw
    .map((v) => (typeof v === 'string' ? normalizeWhitespace(v) : ''))
    .map((v) => stripRationaleLabelPrefix(v))
    .filter((v) => v.length > 0)

  if (choiceRationales.length !== 4) {
    issues.push(`${type}[${index}].choiceRationales must contain exactly 4 non-empty strings`)
  }
  choiceRationales.forEach((rationale, rationaleIndex) => {
    if (rationale.length > MAX_CHOICE_RATIONALE_LENGTH) {
      issues.push(`${type}[${index}].choiceRationales[${rationaleIndex}] too long`)
    }
  })

  if (!difficulty) issues.push(`${type}[${index}].difficulty must be easy|medium|hard`)

  let sourceClassification: 'verified' | 'accepted' | 'unreviewed' | undefined
  if (type === 'trivia_mcq') {
    sourceClassification = normalizeReferentClassification(typeof row.sourceClassification === 'string' ? row.sourceClassification : undefined)
  }

  if (issues.length > 0) {
    const hasFatal = issues.some((issue) => issue.startsWith(`${type}[${index}]`))
    if (hasFatal) return null
  }

  const difficultyLabel = difficulty ?? 'medium'
  const difficultyBaseScore = difficultyLabelToScore(difficultyLabel)
  const sourceDifficultyScore = sourceLine ? lineDifficulty(sourceLine) : difficultyBaseScore
  const difficultyScore = round2(clamp((0.55 * difficultyBaseScore) + (0.45 * sourceDifficultyScore), 1, 5))

  return {
    id: `${type === 'translation_mcq' ? 'tr' : 'tv'}-${String(index + 1).padStart(3, '0')}`,
    type,
    prompt,
    excerpt,
    sourceLineId,
    choices,
    correctIndex,
    explanation,
    choiceRationales,
    difficulty: difficultyLabel,
    difficultyScore,
    excerptLang: sourceLine?.lang,
    source: type === 'trivia_mcq' ? 'genius' : undefined,
    sourceClassification,
  }
}

function normalizeModelQuestions(
  payload: ModelPayload,
  lineById: Map<string, TaggedLyricLine>,
): { translation: StudyQuestion[]; trivia: StudyQuestion[]; issues: string[] } {
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
    const item = normalizeMcqRecord(row, 'translation_mcq', index, rowIssues, lineById)
    if (item) translation.push(item)
    else issues.push(...rowIssues.map((i) => `[dropped] ${i}`))
  })

  triviaRows.forEach((row, index) => {
    const rowIssues: string[] = []
    const item = normalizeMcqRecord(row, 'trivia_mcq', index, rowIssues, lineById)
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

    if (q.type === 'say_it_back') {
      if (q.explanation && q.explanation.trim().length > 0) {
        issues.push(`questions[${index}] say_it_back explanation must be omitted`)
      }
      if (Array.isArray(q.choiceRationales) && q.choiceRationales.length > 0) {
        issues.push(`questions[${index}] say_it_back choiceRationales must be omitted`)
      }
    } else {
      if (!q.explanation || !q.explanation.trim()) {
        issues.push(`questions[${index}] mcq explanation is required`)
      }
      if (!Array.isArray(q.choiceRationales) || q.choiceRationales.length !== 4) {
        issues.push(`questions[${index}] mcq choiceRationales must be 4`)
      } else {
        q.choiceRationales.forEach((rationale, rationaleIndex) => {
          if (!rationale || !rationale.trim()) {
            issues.push(`questions[${index}] choiceRationales[${rationaleIndex}] is required`)
          } else if (rationale.length > MAX_CHOICE_RATIONALE_LENGTH) {
            issues.push(`questions[${index}] choiceRationales[${rationaleIndex}] too long`)
          }
        })
      }
    }

    if (!q.sourceLineId || !q.sourceLineId.trim()) {
      issues.push(`questions[${index}] sourceLineId is required`)
    }

    if (q.correctIndex < 0 || q.correctIndex >= Math.max(1, q.choices.length || 1)) {
      issues.push(`questions[${index}] correctIndex out of range`)
    }

    if (!Number.isFinite(q.difficultyScore) || q.difficultyScore < 1 || q.difficultyScore > 5) {
      issues.push(`questions[${index}] difficultyScore must be between 1 and 5`)
    }
  })

  return issues
}

function isNonNegativeIntArray(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((v) => Number.isInteger(v) && v >= 0)
}

function normalizePrecomputedLineTags(
  precomputed: TaggedLyricLine[],
  collectedLines: CollectedLine[],
): TaggedLyricLine[] {
  const collectedByText = new Map<string, CollectedLine>()
  for (const line of collectedLines) {
    const key = line.text.toLowerCase()
    if (!collectedByText.has(key)) collectedByText.set(key, line)
  }

  const seenLineIds = new Set<string>()

  return precomputed.map((line, index) => {
    const text = normalizeWhitespace(line.text)
    const collected = collectedByText.get(text.toLowerCase())

    let lineId = typeof line.lineId === 'string' && line.lineId.trim()
      ? line.lineId.trim()
      : (collected?.lineId ?? toLineId(index))
    if (seenLineIds.has(lineId)) {
      lineId = toLineId(index)
    }
    seenLineIds.add(lineId)

    const lineIndex = Number.isInteger(line.lineIndex)
      ? line.lineIndex
      : (collected?.lineIndex ?? index)

    const allPositions = isNonNegativeIntArray(line.allPositions)
      ? [...line.allPositions]
      : (collected?.allPositions ? [...collected.allPositions] : [lineIndex >= 0 ? lineIndex : index])

    const lexical = computeLexicalSignals(text || (collected?.text ?? ''))
    const blended = blendedLineDifficulty({
      llmDifficulty: typeof line.difficultyLlm === 'number' ? line.difficultyLlm : line.difficulty,
      lexicalDifficulty: typeof line.difficultyLexical === 'number' ? line.difficultyLexical : lexical.difficulty,
      isRepeated: allPositions.length > 1,
      isMixed: !!line.lang2,
    })

    return {
      text: text || (collected?.text ?? ''),
      lang: (line.lang || 'und').toLowerCase().slice(0, 3).trim() || 'und',
      lang2: line.lang2 ? line.lang2.toLowerCase().slice(0, 3).trim() || undefined : undefined,
      difficulty: round2(blended),
      difficultyLlm: typeof line.difficultyLlm === 'number' ? round2(clamp(line.difficultyLlm, 1, 5)) : undefined,
      difficultyLexical: typeof line.difficultyLexical === 'number'
        ? round2(clamp(line.difficultyLexical, 1, 5))
        : round2(lexical.difficulty),
      fleschKincaid: typeof line.fleschKincaid === 'number' ? round2(line.fleschKincaid) : round2(lexical.fleschKincaid),
      top1kRatio: typeof line.top1kRatio === 'number' ? round2(line.top1kRatio) : round2(lexical.top1kRatio),
      top10kRatio: typeof line.top10kRatio === 'number' ? round2(line.top10kRatio) : round2(lexical.top10kRatio),
      lineId,
      lineIndex: lineIndex >= 0 ? lineIndex : index,
      allPositions,
    }
  })
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

  const collectedLines = collectLyricLines(opts.lyrics)
  if (collectedLines.length === 0) {
    throw new StudySetValidationError('No usable lyric lines', ['lyrics did not contain enough usable lines'])
  }

  const model = (opts.model || DEFAULT_MODEL).trim()

  // Step 1: Tag lines with languages (cheap LLM call, or use pre-computed tags)
  const taggedLines = opts.precomputedLineTags
    ? normalizePrecomputedLineTags(opts.precomputedLineTags, collectedLines)
    : await tagLyricLineLanguages(apiKey, collectedLines, model)
  const lineById = new Map(taggedLines.map((line) => [line.lineId, line]))
  if (lineById.size !== taggedLines.length) {
    throw new StudySetValidationError('Invalid precomputedLineTags', ['lineTags contain duplicate lineId values'])
  }

  // Step 2: Build say-it-back questions (deterministic, no LLM)
  const sayItBackCount = asBoundedCount(opts.sayItBackCount, DEFAULT_SAY_IT_BACK_COUNT, 1, 25)
  const sayItBack = buildSayItBackQuestions(taggedLines, sayItBackCount)
  const sayItBackLineIds = sayItBack.map((q) => q.sourceLineId)

  // Step 3: Build MCQ prompt using tagged lines
  const { system, user, promptHashInput, translationCount, triviaCount, skipTranslation, promptLineIds } = buildPromptParts(
    opts,
    taggedLines,
    sayItBackLineIds,
  )
  const promptHash = `0x${await sha256HexString(promptHashInput)}`

  // Step 4: Call LLM for MCQ generation (skip if no MCQ needed)
  const needsLlm = translationCount > 0 || triviaCount > 0
  const rawOutput = needsLlm
    ? await callOpenRouter(apiKey, model, system, user, { responseFormat: buildStudySetResponseFormat(promptLineIds) })
    : '{"translation_mcq":[],"trivia_mcq":[]}'

  let payload: ModelPayload
  try {
    payload = parseModelPayload(rawOutput)
  } catch (err) {
    if (err instanceof StudySetValidationError) throw err
    throw new StudySetValidationError('Model output is not valid JSON', ['failed to parse model output'], rawOutput)
  }

  const normalized = normalizeModelQuestions(payload, lineById)
  const hardIssues = normalized.issues.filter((i) => !i.startsWith('[dropped]'))
  const droppedIssues = normalized.issues.filter((i) => i.startsWith('[dropped]'))
  if (hardIssues.length > 0) {
    throw new StudySetValidationError('Model output failed validation', hardIssues, rawOutput)
  }

  const scrambledTranslation = scrambleMcqQuestions(normalized.translation, `${promptHash}:translation`)
  const scrambledTrivia = scrambleMcqQuestions(normalized.trivia, `${promptHash}:trivia`)

  const questions: StudyQuestion[] = interleaveQuestionGroups([
    sayItBack,
    scrambledTranslation,
    scrambledTrivia,
  ])

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

  const referencedLineIds = new Set(questions.map((q) => q.sourceLineId))
  const usedLineTags = taggedLines
    .filter((line) => referencedLineIds.has(line.lineId))
    .sort((a, b) => a.lineIndex - b.lineIndex)
  if (usedLineTags.length < referencedLineIds.size) {
    warnings.push('Some question sourceLineIds were not found in tagged line set.')
  }

  const pack: StudySetPack = {
    specVersion: 'exercise-pack-v2',
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
    lineTags: usedLineTags,
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

  if (pack.specVersion !== 'exercise-pack-v2') issues.push('specVersion must be exercise-pack-v2')
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

  const lineIdSet = new Set<string>()
  pack.lineTags.forEach((line, index) => {
    if (!line.lineId || !line.lineId.trim()) issues.push(`lineTags[${index}].lineId is required`)
    if (lineIdSet.has(line.lineId)) issues.push(`lineTags[${index}] duplicate lineId ${line.lineId}`)
    lineIdSet.add(line.lineId)
    if (!Number.isInteger(line.lineIndex) || line.lineIndex < 0) issues.push(`lineTags[${index}].lineIndex must be a non-negative integer`)
    if (!isNonNegativeIntArray(line.allPositions)) issues.push(`lineTags[${index}].allPositions must be a non-empty array of non-negative integers`)
    if (!line.text || !line.text.trim()) issues.push(`lineTags[${index}].text is required`)
    if (!line.lang || !line.lang.trim()) issues.push(`lineTags[${index}].lang is required`)
    if (line.difficulty != null && (!Number.isFinite(line.difficulty) || line.difficulty < 1 || line.difficulty > 5)) {
      issues.push(`lineTags[${index}].difficulty must be between 1 and 5 when provided`)
    }
    if (line.top1kRatio != null && (!Number.isFinite(line.top1kRatio) || line.top1kRatio < 0 || line.top1kRatio > 1)) {
      issues.push(`lineTags[${index}].top1kRatio must be between 0 and 1 when provided`)
    }
    if (line.top10kRatio != null && (!Number.isFinite(line.top10kRatio) || line.top10kRatio < 0 || line.top10kRatio > 1)) {
      issues.push(`lineTags[${index}].top10kRatio must be between 0 and 1 when provided`)
    }
  })

  issues.push(...validateFinalQuestionSet(pack.questions))
  pack.questions.forEach((question, index) => {
    if (!lineIdSet.has(question.sourceLineId)) {
      issues.push(`questions[${index}] sourceLineId not found in lineTags`)
    }
  })
  return issues
}
