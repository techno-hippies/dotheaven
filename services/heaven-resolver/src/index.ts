/**
 * heaven-resolver — MusicBrainz API proxy with KV caching.
 *
 * Endpoints:
 *   GET  /recording/:mbid              → artist info from a recording MBID
 *   GET  /artist/:mbid                 → artist metadata (name, genres, bio, image)
 *   GET  /search/artist?q=             → search artists by name
 *   POST /resolve/batch                → batch resolve {artist, title} → MBIDs via MB search
 *   GET  /resolve/spotify-artist/:id   → Spotify artist ID → MB artist MBID via URL relation
 *
 * MusicBrainz rate limit: 1 req/sec with User-Agent identification.
 * Cache: KV with 30-day positive TTL, 1-hour negative TTL.
 */

interface Env {
  CACHE: KVNamespace
  MB_USER_AGENT: string
  ENVIRONMENT: string
}

// ── Cache TTLs ───────────────────────────────────────────────────────
const CACHE_TTL_POSITIVE = 60 * 60 * 24 * 30 // 30 days
const CACHE_TTL_NEGATIVE = 60 * 60            // 1 hour

// ── Rate limiter (per-isolate, best-effort) ──────────────────────────
let lastMbRequest = 0

async function mbFetch(url: string, env: Env): Promise<Response> {
  // Enforce ~1 req/sec to MusicBrainz
  const now = Date.now()
  const wait = Math.max(0, 1100 - (now - lastMbRequest))
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastMbRequest = Date.now()

  return fetch(url, {
    headers: {
      'User-Agent': env.MB_USER_AGENT,
      Accept: 'application/json',
    },
  })
}

// ── CORS headers ─────────────────────────────────────────────────────
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

// ── Route handlers ───────────────────────────────────────────────────

/**
 * GET /recording/:mbid
 * Resolves a recording MBID to its artist(s).
 * Returns: { recording: { mbid, title }, artists: [{ mbid, name, sortName }] }
 */
async function handleRecording(mbid: string, env: Env): Promise<Response> {
  const cacheKey = `recording:${mbid}`
  const cached = await env.CACHE.get(cacheKey, 'json') as Record<string, unknown> | null
  if (cached) {
    // Follow cached redirects instead of returning raw {redirect: ...}
    if (typeof cached.redirect === 'string') return handleRecording(cached.redirect, env)
    return jsonResponse(cached)
  }

  const url = `https://musicbrainz.org/ws/2/recording/${mbid}?inc=artists&fmt=json`
  const res = await mbFetch(url, env)

  if (res.status === 404) {
    const neg = { error: 'not_found', mbid }
    await env.CACHE.put(cacheKey, JSON.stringify(neg), { expirationTtl: CACHE_TTL_NEGATIVE })
    return jsonResponse(neg, 404)
  }

  // Handle MBID merge/redirect (MusicBrainz returns 301/302 for merged entities)
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('Location')
    if (location) {
      const newMbid = location.match(/recording\/([a-f0-9-]{36})/)?.[1]
      if (newMbid) {
        const redirect = { redirect: newMbid }
        await env.CACHE.put(cacheKey, JSON.stringify(redirect), { expirationTtl: CACHE_TTL_POSITIVE })
        return handleRecording(newMbid, env)
      }
    }
  }

  if (!res.ok) {
    return jsonResponse({ error: 'upstream_error', status: res.status }, 502)
  }

  const data = await res.json() as {
    id: string
    title: string
    'artist-credit'?: Array<{
      artist: { id: string; name: string; 'sort-name': string }
    }>
  }

  const result = {
    recording: { mbid: data.id, title: data.title },
    artists: (data['artist-credit'] ?? []).map((ac) => ({
      mbid: ac.artist.id,
      name: ac.artist.name,
      sortName: ac.artist['sort-name'],
    })),
  }

  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_POSITIVE })
  return jsonResponse(result)
}

/**
 * GET /artist/:mbid
 * Returns artist metadata: name, genres, type, area, disambiguation, links.
 */
async function handleArtist(mbid: string, env: Env): Promise<Response> {
  const cacheKey = `artist:${mbid}`
  const cached = await env.CACHE.get(cacheKey, 'json') as Record<string, unknown> | null
  if (cached) {
    // Follow cached redirects instead of returning raw {redirect: ...}
    if (typeof cached.redirect === 'string') return handleArtist(cached.redirect, env)
    return jsonResponse(cached)
  }

  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=genres+url-rels&fmt=json`
  const res = await mbFetch(url, env)

  if (res.status === 404) {
    const neg = { error: 'not_found', mbid }
    await env.CACHE.put(cacheKey, JSON.stringify(neg), { expirationTtl: CACHE_TTL_NEGATIVE })
    return jsonResponse(neg, 404)
  }

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('Location')
    if (location) {
      const newMbid = location.match(/artist\/([a-f0-9-]{36})/)?.[1]
      if (newMbid) {
        await env.CACHE.put(cacheKey, JSON.stringify({ redirect: newMbid }), { expirationTtl: CACHE_TTL_POSITIVE })
        return handleArtist(newMbid, env)
      }
    }
  }

  if (!res.ok) {
    return jsonResponse({ error: 'upstream_error', status: res.status }, 502)
  }

  const data = await res.json() as {
    id: string
    name: string
    'sort-name': string
    type?: string
    disambiguation?: string
    country?: string
    area?: { name: string }
    'life-span'?: { begin?: string; end?: string; ended?: boolean }
    genres?: Array<{ name: string; count: number }>
    relations?: Array<{
      type: string
      url?: { resource: string }
    }>
  }

  // Extract useful links
  const links: Record<string, string> = {}
  let commonsImagePage: string | null = null
  for (const rel of data.relations ?? []) {
    if (rel.url?.resource) {
      if (rel.type === 'wikidata') links.wikidata = rel.url.resource
      else if (rel.type === 'image') commonsImagePage = rel.url.resource
      else if (rel.type === 'official homepage') links.website = rel.url.resource
      else if (rel.type === 'social network') {
        const u = rel.url.resource
        if (u.includes('twitter.com') || u.includes('x.com')) links.twitter = u
        else if (u.includes('instagram.com')) links.instagram = u
        else if (u.includes('facebook.com')) links.facebook = u
      }
      else if (rel.type === 'streaming music' || rel.type === 'free streaming') {
        const u = rel.url.resource
        if (u.includes('spotify.com')) links.spotify = u
        else if (u.includes('soundcloud.com')) links.soundcloud = u
      }
    }
  }

  // Resolve Wikimedia Commons image page URL to actual image URL
  if (commonsImagePage) {
    const imageUrl = await resolveCommonsImage(commonsImagePage, env)
    if (imageUrl) links.image = imageUrl
  }

  const result = {
    mbid: data.id,
    name: data.name,
    sortName: data['sort-name'],
    type: data.type ?? null,
    disambiguation: data.disambiguation ?? null,
    country: data.country ?? null,
    area: data.area?.name ?? null,
    lifeSpan: data['life-span'] ?? null,
    genres: (data.genres ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((g) => g.name),
    links,
  }

  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_POSITIVE })
  return jsonResponse(result)
}

/**
 * GET /search/artist?q=name
 * Search MusicBrainz for artists by name. Returns top 5 matches.
 */
async function handleSearchArtist(query: string, env: Env): Promise<Response> {
  if (!query || query.length < 2) {
    return jsonResponse({ error: 'query too short' }, 400)
  }

  const cacheKey = `search:artist:${query.toLowerCase().trim()}`
  const cached = await env.CACHE.get(cacheKey, 'json')
  if (cached) return jsonResponse(cached)

  const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(query)}&limit=5&fmt=json`
  const res = await mbFetch(url, env)

  if (!res.ok) {
    return jsonResponse({ error: 'upstream_error', status: res.status }, 502)
  }

  const data = await res.json() as {
    artists: Array<{
      id: string
      name: string
      'sort-name': string
      score: number
      type?: string
      disambiguation?: string
      country?: string
    }>
  }

  const result = {
    artists: (data.artists ?? []).map((a) => ({
      mbid: a.id,
      name: a.name,
      sortName: a['sort-name'],
      score: a.score,
      type: a.type ?? null,
      disambiguation: a.disambiguation ?? null,
      country: a.country ?? null,
    })),
  }

  // Cache searches for 24h (shorter — results may change with new releases)
  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 })
  return jsonResponse(result)
}

// ── Batch resolve: {artist, title} → MBIDs via MusicBrainz search ───

const MAX_BATCH_SIZE = 50
const MIN_SCORE = 80 // minimum MB search score to accept a match

interface ResolveItem {
  artist: string
  title: string
  release?: string
}

interface ResolveResult {
  recording_mbid: string | null
  recording_name: string | null
  artist_mbids: string[]
  artist_credit_name: string | null
  release_mbid: string | null
  release_name: string | null
  score: number
}

const EMPTY_RESULT: ResolveResult = {
  recording_mbid: null,
  recording_name: null,
  artist_mbids: [],
  artist_credit_name: null,
  release_mbid: null,
  release_name: null,
  score: 0,
}

/** Sentinel: resolveOne hit a transient upstream error — don't cache. */
const TRANSIENT_ERROR = Symbol('transient')

/**
 * Resolve a single (artist, title) pair via MusicBrainz recording search.
 * Uses Lucene query: `recording:"title" AND artist:"artist"`
 * Returns the top result if score >= MIN_SCORE, EMPTY_RESULT for genuine misses,
 * or TRANSIENT_ERROR if MB returned a server error (so we skip caching).
 */
async function resolveOne(item: ResolveItem, env: Env): Promise<ResolveResult | typeof TRANSIENT_ERROR> {
  // Build Lucene query parts
  const parts = [
    `recording:"${luceneEscape(item.title)}"`,
    `artist:"${luceneEscape(item.artist)}"`,
  ]
  if (item.release) {
    parts.push(`release:"${luceneEscape(item.release)}"`)
  }
  const q = parts.join(' AND ')

  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&limit=1&fmt=json`

  let res: Response
  try {
    res = await mbFetch(url, env)
  } catch {
    return TRANSIENT_ERROR
  }

  // Server errors are transient — don't cache
  if (res.status >= 500) return TRANSIENT_ERROR
  if (!res.ok) return EMPTY_RESULT

  const data = await res.json() as {
    recordings?: Array<{
      id: string
      title: string
      score: number
      'artist-credit'?: Array<{
        artist: { id: string; name: string }
      }>
      releases?: Array<{
        id: string
        title: string
      }>
    }>
  }

  const top = data.recordings?.[0]
  if (!top || top.score < MIN_SCORE) return EMPTY_RESULT

  return {
    recording_mbid: top.id,
    recording_name: top.title,
    artist_mbids: (top['artist-credit'] ?? []).map((ac) => ac.artist.id),
    artist_credit_name: (top['artist-credit'] ?? []).map((ac) => ac.artist.name).join(', ') || null,
    release_mbid: top.releases?.[0]?.id ?? null,
    release_name: top.releases?.[0]?.title ?? null,
    score: top.score,
  }
}

/**
 * POST /resolve/batch
 * Batch resolve recordings via MusicBrainz recording search.
 * Input:  { recordings: [{ artist, title, release? }] }
 * Output: { results: [ResolveResult] } — parallel array, null fields for misses
 *
 * Checks KV cache per item first, then resolves uncached items sequentially
 * (respecting MB's 1 req/sec rate limit).
 */
async function handleResolveBatch(request: Request, env: Env): Promise<Response> {
  let body: { recordings?: unknown }
  try {
    body = await request.json() as { recordings?: unknown }
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  if (!Array.isArray(body.recordings) || body.recordings.length === 0) {
    return jsonResponse({ error: 'recordings array required' }, 400)
  }

  if (body.recordings.length > MAX_BATCH_SIZE) {
    return jsonResponse({ error: `max ${MAX_BATCH_SIZE} recordings per batch` }, 400)
  }

  const items = body.recordings as ResolveItem[]

  // Validate
  for (const item of items) {
    if (!item.artist || !item.title) {
      return jsonResponse({ error: 'each item needs artist and title' }, 400)
    }
  }

  // Build cache keys (include release when present for more precise matches)
  const cacheKeys = items.map((item) => {
    let key = `resolve:${item.artist.toLowerCase().trim()}::${item.title.toLowerCase().trim()}`
    if (item.release) key += `::${item.release.toLowerCase().trim()}`
    return key
  })

  // Parallel KV lookups
  const cached = await Promise.all(
    cacheKeys.map((key) => env.CACHE.get(key, 'json') as Promise<ResolveResult | null>)
  )

  const results: ResolveResult[] = new Array(items.length)
  const uncachedIndices: number[] = []

  for (let i = 0; i < items.length; i++) {
    if (cached[i] !== null) {
      results[i] = cached[i]!
    } else {
      uncachedIndices.push(i)
    }
  }

  // Resolve uncached items sequentially (MB rate limit: 1 req/sec)
  for (const idx of uncachedIndices) {
    const resolved = await resolveOne(items[idx], env)

    // Transient upstream errors: return empty to client, skip caching
    if (resolved === TRANSIENT_ERROR) {
      results[idx] = EMPTY_RESULT
      continue
    }

    results[idx] = resolved
    const ttl = resolved.recording_mbid ? CACHE_TTL_POSITIVE : CACHE_TTL_NEGATIVE
    await env.CACHE.put(cacheKeys[idx], JSON.stringify(resolved), { expirationTtl: ttl })
  }

  return jsonResponse({ results })
}

// ── Spotify artist → MB artist MBID ──────────────────────────────────

/**
 * GET /resolve/spotify-artist/:id
 * Resolves a Spotify artist ID to a MusicBrainz artist MBID via URL relation lookup.
 * Uses: https://musicbrainz.org/ws/2/url?resource=https://open.spotify.com/artist/{id}&fmt=json
 */
async function handleResolveSpotifyArtist(spotifyId: string, env: Env): Promise<Response> {
  const cacheKey = `spotify-artist:${spotifyId}`
  const cached = await env.CACHE.get(cacheKey, 'json')
  if (cached) return jsonResponse(cached)

  const spotifyUrl = `https://open.spotify.com/artist/${spotifyId}`
  const url = `https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(spotifyUrl)}&inc=artist-rels&fmt=json`
  const res = await mbFetch(url, env)

  if (res.status === 404) {
    const neg = { error: 'not_found', spotifyId }
    await env.CACHE.put(cacheKey, JSON.stringify(neg), { expirationTtl: CACHE_TTL_NEGATIVE })
    return jsonResponse(neg, 404)
  }

  if (!res.ok) {
    return jsonResponse({ error: 'upstream_error', status: res.status }, 502)
  }

  const data = await res.json() as {
    relations?: Array<{
      type: string
      direction: string
      artist?: { id: string; name: string; 'sort-name': string }
    }>
  }

  // Extract artist relation from the URL entity
  const artistRel = data.relations?.find((r) => r.artist)
  if (!artistRel?.artist) {
    const neg = { error: 'no_artist_relation', spotifyId }
    await env.CACHE.put(cacheKey, JSON.stringify(neg), { expirationTtl: CACHE_TTL_NEGATIVE })
    return jsonResponse(neg, 404)
  }

  const result = {
    mbid: artistRel.artist.id,
    name: artistRel.artist.name,
    sortName: artistRel.artist['sort-name'],
    spotifyId,
  }

  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_POSITIVE })
  return jsonResponse(result)
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Escape special Lucene characters for MusicBrainz search queries. */
function luceneEscape(s: string): string {
  // Lucene special chars: + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
  return s.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1')
}

/**
 * Resolve a Wikimedia Commons file page URL to an actual image URL.
 * Input: https://commons.wikimedia.org/wiki/File:The_Fabs.JPG
 * Output: https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/The_Fabs.JPG/400px-The_Fabs.JPG
 */
async function resolveCommonsImage(pageUrl: string, env: Env): Promise<string | null> {
  // Extract filename from URL: File:Name.ext
  const match = pageUrl.match(/\/wiki\/File:(.+)$/)
  if (!match) return null
  const filename = decodeURIComponent(match[1])

  // Check cache
  const cacheKey = `commons:${filename}`
  const cached = await env.CACHE.get(cacheKey)
  if (cached) return cached === 'null' ? null : cached

  // Use MediaWiki API to get the actual image URL
  const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json`

  try {
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': env.MB_USER_AGENT },
    })
    if (!res.ok) return null

    const data = await res.json() as {
      query?: {
        pages?: Record<string, {
          imageinfo?: Array<{ thumburl?: string; url?: string }>
        }>
      }
    }

    const pages = data.query?.pages
    if (!pages) return null

    const page = Object.values(pages)[0]
    const imageUrl = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || null

    // Cache the result (use 'null' string for negative cache)
    await env.CACHE.put(cacheKey, imageUrl ?? 'null', { expirationTtl: CACHE_TTL_POSITIVE })

    return imageUrl
  } catch {
    return null
  }
}

// ── Router ───────────────────────────────────────────────────────────

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const SPOTIFY_ID_RE = /^[a-zA-Z0-9]{22}$/

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const path = url.pathname

    // POST routes
    if (request.method === 'POST') {
      if (path === '/resolve/batch') {
        return handleResolveBatch(request, env)
      }
      return jsonResponse({ error: 'not found' }, 404)
    }

    // GET routes
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    // GET /recording/:mbid
    const recordingMatch = path.match(/^\/recording\/([a-f0-9-]{36})$/)
    if (recordingMatch) {
      const mbid = recordingMatch[1]
      if (!UUID_RE.test(mbid)) return jsonResponse({ error: 'invalid mbid' }, 400)
      return handleRecording(mbid, env)
    }

    // GET /artist/:mbid
    const artistMatch = path.match(/^\/artist\/([a-f0-9-]{36})$/)
    if (artistMatch) {
      const mbid = artistMatch[1]
      if (!UUID_RE.test(mbid)) return jsonResponse({ error: 'invalid mbid' }, 400)
      return handleArtist(mbid, env)
    }

    // GET /search/artist?q=...
    if (path === '/search/artist') {
      const q = url.searchParams.get('q')
      if (!q) return jsonResponse({ error: 'missing q parameter' }, 400)
      return handleSearchArtist(q, env)
    }

    // GET /resolve/spotify-artist/:id
    const spotifyMatch = path.match(/^\/resolve\/spotify-artist\/([a-zA-Z0-9]+)$/)
    if (spotifyMatch) {
      const spotifyId = spotifyMatch[1]
      if (!SPOTIFY_ID_RE.test(spotifyId)) return jsonResponse({ error: 'invalid spotify id' }, 400)
      return handleResolveSpotifyArtist(spotifyId, env)
    }

    // Health check
    if (path === '/' || path === '/health') {
      return jsonResponse({ ok: true, service: 'heaven-resolver' })
    }

    return jsonResponse({ error: 'not found' }, 404)
  },
} satisfies ExportedHandler<Env>
