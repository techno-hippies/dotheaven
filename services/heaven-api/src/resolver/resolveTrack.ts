/**
 * Scrobble Track Resolver
 *
 * Normalizes track metadata and generates deterministic track_key for cross-user aggregation.
 * Resolution hooks (MBID verify, ISRC lookup, AcoustID, fallback search) are wired but dormant
 * until the Android payload includes embedded IDs or fingerprints.
 *
 * Rate limit awareness:
 * - MusicBrainz: ~1 req/s per IP (handle 503 with backoff)
 * - AcoustID: ≤3 req/s, non-commercial
 * - All external lookups cached in KV (30-day TTL)
 */

import type { Env } from '../types'

export type Provenance = {
  step: string
  source: 'embedded' | 'musicbrainz' | 'acoustid' | 'fallback' | 'local'
  detail?: Record<string, unknown>
}

export type Normalized = {
  title_norm: string
  artist_norm: string
  album_norm: string
  duration_s?: number
  isrc_norm?: string
  mbid_norm?: string
}

export type Resolved = {
  mbid?: string
  acoustid?: string
  isrcs?: string[]
  confidence: number // 0..1
  provenance: Provenance[]
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/

// ============================================================================
// Normalization helpers
// ============================================================================

function normText(s?: string): string {
  if (!s) return ''
  return s
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normTitle(s?: string): string {
  const t = normText(s)
  return t
    .replace(/\((official|lyric|audio|video).*\)$/g, '')
    .replace(/\[(official|lyric|audio|video).*\]$/g, '')
    .replace(/\s+-\s+remastered.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normISRC(s?: string): string | undefined {
  if (!s) return undefined
  const x = s.toUpperCase().replace(/-/g, '').trim()
  return ISRC_RE.test(x) ? x : undefined
}

function normMBID(s?: string): string | undefined {
  if (!s) return undefined
  const x = s.trim().toLowerCase()
  return UUID_RE.test(x) ? x : undefined
}

// ============================================================================
// Hashing + scoring
// ============================================================================

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(digest)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Bucket duration by 2s to absorb tiny tag discrepancies */
function durationBucket(durationS?: number): number | undefined {
  if (!durationS) return undefined
  return Math.round(durationS / 2) * 2
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0
  // Simple Levenshtein for short strings
  const m = a.length, n = b.length
  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return 1 - dp[n] / Math.max(a.length, b.length)
}

function durationScore(a?: number, b?: number): number {
  if (!a || !b) return 0.5
  const diff = Math.abs(a - b)
  if (diff <= 1) return 1.0
  if (diff <= 2) return 0.9
  if (diff <= 5) return 0.7
  if (diff <= 10) return 0.4
  return 0.0
}

// ============================================================================
// External API helpers (all cached in KV)
// ============================================================================

async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2
): Promise<any> {
  let attempt = 0
  let backoffMs = 500

  while (true) {
    const res = await fetch(url, init)
    if (res.ok) return res.json()

    if ((res.status === 503 || res.status >= 500) && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, backoffMs))
      attempt++
      backoffMs *= 2
      continue
    }

    throw new Error(`HTTP ${res.status} ${url}`)
  }
}

async function mbRecordingExists(env: Env, mbid: string): Promise<boolean> {
  const key = `mbid-exists:${mbid}`
  const cached = await env.RESOLVER_KV!.get(key)
  if (cached === '1') return true
  if (cached === '0') return false

  try {
    const url = `https://musicbrainz.org/ws/2/recording/${encodeURIComponent(mbid)}?fmt=json`
    await fetchJsonWithRetry(url, {
      headers: { 'User-Agent': env.MB_USER_AGENT!, Accept: 'application/json' },
    })
    await env.RESOLVER_KV!.put(key, '1', { expirationTtl: 60 * 60 * 24 * 30 })
    return true
  } catch {
    await env.RESOLVER_KV!.put(key, '0', { expirationTtl: 60 * 60 * 24 * 7 })
    return false
  }
}

async function mbIsrcLookup(env: Env, isrc: string): Promise<any | null> {
  const cacheKey = `isrc:${isrc}`
  const cached = await env.RESOLVER_KV!.get(cacheKey, 'json')
  if (cached) return cached

  const url =
    `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}` +
    `?fmt=json&inc=recordings+artist-credits`

  const data = await fetchJsonWithRetry(url, {
    headers: { 'User-Agent': env.MB_USER_AGENT!, Accept: 'application/json' },
  })

  await env.RESOLVER_KV!.put(cacheKey, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 30 })
  return data
}

async function acoustidLookup(env: Env, fingerprint: string, durationS: number): Promise<any | null> {
  const fpKey = `fp:${durationS}:${fingerprint.slice(0, 64)}`
  const cached = await env.RESOLVER_KV!.get(fpKey, 'json')
  if (cached) return cached

  const form = new URLSearchParams()
  form.set('client', env.ACOUSTID_CLIENT_KEY!)
  form.set('duration', String(durationS))
  form.set('fingerprint', fingerprint)
  form.set('meta', 'recordingids+recordings')

  const data = await fetchJsonWithRetry('https://api.acoustid.org/v2/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
  })

  await env.RESOLVER_KV!.put(fpKey, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 30 })
  return data
}

async function mbRecordingSearch(env: Env, title: string, artist: string): Promise<any | null> {
  const query = `recording:"${title.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`
  const url =
    `https://musicbrainz.org/ws/2/recording?fmt=json&limit=5&dismax=true` +
    `&query=${encodeURIComponent(query)}`

  return fetchJsonWithRetry(url, {
    headers: { 'User-Agent': env.MB_USER_AGENT!, Accept: 'application/json' },
  })
}

// ============================================================================
// Candidate scoring (for ISRC/search results with multiple recordings)
// ============================================================================

interface RecordingCandidate {
  mbid: string
  title?: string
  artist?: string
  lengthMs?: number
}

function chooseBest(
  candidates: RecordingCandidate[],
  norm: Normalized
): { mbid: string; score: number } | null {
  let best: { mbid: string; score: number } | null = null

  for (const c of candidates) {
    const t = normTitle(c.title)
    const a = normText(c.artist)
    const durS = c.lengthMs ? Math.round(c.lengthMs / 1000) : undefined

    const sTitle = similarity(norm.title_norm, t)
    const sArtist = similarity(norm.artist_norm, a)
    const sDur = durationScore(norm.duration_s, durS)

    // weights: title 0.5, artist 0.35, duration 0.15
    const score = 0.5 * sTitle + 0.35 * sArtist + 0.15 * sDur

    if (!best || score > best.score) best = { mbid: c.mbid, score }
  }

  return best
}

function extractCandidatesFromIsrc(data: any): RecordingCandidate[] {
  const recs: any[] = Array.isArray(data?.recordings) ? data.recordings : []
  return recs
    .map((r: any) => ({
      mbid: String(r.id),
      title: r.title,
      artist: r['artist-credit']?.map((x: any) => x?.name).filter(Boolean).join(' ') ?? '',
      lengthMs: typeof r.length === 'number' ? r.length : undefined,
    }))
    .filter((x) => UUID_RE.test(x.mbid))
}

// ============================================================================
// Main resolve function
// ============================================================================

export interface TrackInput {
  title?: string
  artist?: string
  album?: string
  duration_ms?: number      // milliseconds
  playedAt?: number
  source?: string
  embedded?: {
    mb_recording_id?: string
    isrc?: string
  }
  fingerprint?: string
}

export async function resolveTrack(
  env: Env,
  track: TrackInput
): Promise<{ normalized: Normalized; resolved: Resolved; track_key: string }> {
  // Convert ms to seconds, clamp to sane range (0, 6 hours]
  const rawS = typeof track.duration_ms === 'number' ? Math.round(track.duration_ms / 1000) : undefined
  const duration_s = typeof rawS === 'number' && rawS > 0 && rawS < 21600 ? rawS : undefined

  const normalized: Normalized = {
    title_norm: normTitle(track.title),
    artist_norm: normText(track.artist),
    album_norm: normText(track.album),
    duration_s,
    isrc_norm: normISRC(track.embedded?.isrc),
    mbid_norm: normMBID(track.embedded?.mb_recording_id),
  }

  // Deterministic track key (versioned so normalization changes don't silently break aggregation)
  const hasCore = normalized.title_norm.length > 0 && normalized.artist_norm.length > 0
  const keyMaterial = hasCore
    ? ['trackkey-v1', normalized.title_norm, normalized.artist_norm, String(durationBucket(normalized.duration_s) ?? '')].join('|')
    : ['trackkey-v1-incomplete', normText(track.title), normText(track.artist), String(durationBucket(normalized.duration_s) ?? ''), normText(track.album)].join('|')
  const track_key = await sha256Hex(keyMaterial)

  const provenance: Provenance[] = []

  // If no KV binding, just return normalization (no external lookups possible)
  if (!env.RESOLVER_KV) {
    return {
      normalized,
      track_key,
      resolved: { confidence: 0.0, provenance: [{ step: 'normalized_only', source: 'local' }] },
    }
  }

  // --- Step 1: Embedded MBID ---
  if (normalized.mbid_norm) {
    provenance.push({ step: 'mbid_present', source: 'embedded', detail: { mbid: normalized.mbid_norm } })

    if (env.MB_USER_AGENT) {
      const exists = await mbRecordingExists(env, normalized.mbid_norm)
      if (exists) {
        return {
          normalized,
          track_key,
          resolved: {
            mbid: normalized.mbid_norm,
            confidence: 0.98,
            provenance: [...provenance, { step: 'mbid_verified', source: 'musicbrainz' }],
          },
        }
      }
      provenance.push({ step: 'mbid_not_found', source: 'musicbrainz' })
    }
  }

  // --- Step 2: ISRC lookup ---
  if (normalized.isrc_norm && env.MB_USER_AGENT) {
    provenance.push({ step: 'isrc_present', source: 'embedded', detail: { isrc: normalized.isrc_norm } })

    try {
      const data = await mbIsrcLookup(env, normalized.isrc_norm)
      const candidates = extractCandidatesFromIsrc(data)
      const best = chooseBest(candidates, normalized)

      if (best && best.score >= 0.72) {
        return {
          normalized,
          track_key,
          resolved: {
            mbid: best.mbid,
            isrcs: [normalized.isrc_norm],
            confidence: Math.min(0.92, 0.70 + 0.30 * best.score),
            provenance: [...provenance, { step: 'isrc_resolved', source: 'musicbrainz', detail: { bestScore: best.score } }],
          },
        }
      }
      provenance.push({ step: 'isrc_no_good_match', source: 'musicbrainz', detail: { candidates: candidates.length } })
    } catch {
      provenance.push({ step: 'isrc_lookup_failed', source: 'musicbrainz' })
    }
  }

  // --- Step 3: AcoustID ---
  if (track.fingerprint && normalized.duration_s && env.ACOUSTID_CLIENT_KEY) {
    provenance.push({ step: 'fingerprint_present', source: 'embedded', detail: { duration_s: normalized.duration_s } })

    try {
      const data = await acoustidLookup(env, track.fingerprint, normalized.duration_s)
      const results: any[] = Array.isArray(data?.results) ? data.results : []
      results.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))
      const top = results[0]
      const acoustid = top?.id ? String(top.id) : undefined
      const mbid =
        top?.recordings?.[0]?.id && UUID_RE.test(String(top.recordings[0].id))
          ? String(top.recordings[0].id)
          : undefined
      const score = typeof top?.score === 'number' ? top.score : 0

      if (mbid && score >= 0.80) {
        return {
          normalized,
          track_key,
          resolved: {
            mbid,
            acoustid,
            confidence: Math.min(0.95, 0.75 + 0.25 * score),
            provenance: [...provenance, { step: 'acoustid_resolved', source: 'acoustid', detail: { score } }],
          },
        }
      }
      provenance.push({ step: 'acoustid_low_confidence', source: 'acoustid', detail: { score } })
    } catch {
      provenance.push({ step: 'acoustid_lookup_failed', source: 'acoustid' })
    }
  }

  // --- Step 4: Fallback search (disabled by default) ---
  if (
    env.ENABLE_MB_FALLBACK_SEARCH === 'true' &&
    env.MB_USER_AGENT &&
    normalized.title_norm &&
    normalized.artist_norm
  ) {
    const searchKey = `mbsearch:${normalized.title_norm}|${normalized.artist_norm}|${durationBucket(normalized.duration_s) ?? ''}`
    const cached = (await env.RESOLVER_KV.get(searchKey, 'json')) as { mbid: string; confidence: number } | null

    if (cached?.mbid) {
      return {
        normalized,
        track_key,
        resolved: {
          mbid: cached.mbid,
          confidence: cached.confidence,
          provenance: [...provenance, { step: 'fallback_cache_hit', source: 'musicbrainz' }],
        },
      }
    }

    provenance.push({ step: 'fallback_search', source: 'fallback' })

    try {
      const data = await mbRecordingSearch(env, normalized.title_norm, normalized.artist_norm)
      const recs: any[] = Array.isArray(data?.recordings) ? data.recordings : []
      const candidates: RecordingCandidate[] = recs
        .map((r: any) => ({
          mbid: String(r.id),
          title: r.title,
          artist: r['artist-credit']?.map((x: any) => x?.name).filter(Boolean).join(' ') ?? '',
          lengthMs: typeof r.length === 'number' ? r.length : undefined,
        }))
        .filter((x) => UUID_RE.test(x.mbid))

      const best = chooseBest(candidates, normalized)
      if (best && best.score >= 0.78) {
        const confidence = 0.60 + 0.25 * best.score
        await env.RESOLVER_KV.put(searchKey, JSON.stringify({ mbid: best.mbid, confidence }), {
          expirationTtl: 60 * 60 * 24 * 30,
        })
        return {
          normalized,
          track_key,
          resolved: {
            mbid: best.mbid,
            confidence,
            provenance: [...provenance, { step: 'fallback_resolved', source: 'musicbrainz', detail: { bestScore: best.score } }],
          },
        }
      }
    } catch {
      provenance.push({ step: 'fallback_search_failed', source: 'musicbrainz' })
    }
  }

  // No resolution achieved — normalization + track_key only
  return {
    normalized,
    track_key,
    resolved: { confidence: 0.0, provenance: [...provenance, { step: 'unresolved', source: 'local' }] },
  }
}
