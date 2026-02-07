/**
 * heaven-resolver — MusicBrainz API proxy with KV caching.
 *
 * Endpoints:
 *   GET  /recording/:mbid              → artist + release-group info from a recording MBID
 *   GET  /artist/:mbid                 → artist metadata (name, genres, bio, image)
 *   GET  /release-group/:mbid          → album metadata (title, artists, date, cover art, genres)
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
  FILEBASE_API_KEY?: string
}

// ── Cache TTLs ───────────────────────────────────────────────────────
const CACHE_TTL_POSITIVE = 60 * 60 * 24 * 30 // 30 days
const CACHE_TTL_NEGATIVE = 60 * 60            // 1 hour
const CACHE_TTL_IMAGE = 60 * 60 * 24 * 365    // 1 year (images are immutable once rehosted)

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
    // Serve from cache only if it has releaseGroup field (v2 format) or is an error
    if (cached.error || 'releaseGroup' in cached) return jsonResponse(cached)
    // Stale v1 cache entry without releaseGroup — fall through to re-fetch
  }

  const url = `https://musicbrainz.org/ws/2/recording/${mbid}?inc=artists+releases+release-groups&fmt=json`
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
    releases?: Array<{
      id: string
      title: string
      'release-group'?: { id: string; title: string; 'primary-type'?: string }
    }>
  }

  // Pick the first release-group (album) from the releases
  const releaseGroup = data.releases?.find((r) => r['release-group'])?.['release-group'] ?? null

  const result = {
    recording: { mbid: data.id, title: data.title },
    artists: (data['artist-credit'] ?? []).map((ac) => ({
      mbid: ac.artist.id,
      name: ac.artist.name,
      sortName: ac.artist['sort-name'],
    })),
    releaseGroup: releaseGroup ? {
      mbid: releaseGroup.id,
      title: releaseGroup.title,
      type: releaseGroup['primary-type'] ?? null,
    } : null,
  }

  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_POSITIVE })
  return jsonResponse(result)
}

/**
 * GET /artist/:mbid
 * Returns artist metadata: name, genres, type, area, disambiguation, links.
 *
 * Background rehosting: If the artist has a Wikimedia image URL, queue a background
 * job to rehost it to IPFS. First visitor gets Wikipedia URL, second visitor gets IPFS.
 */
async function handleArtist(mbid: string, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const cacheKey = `artist:${mbid}`
  const cached = await env.CACHE.get(cacheKey, 'json') as Record<string, unknown> | null
  if (cached) {
    // Follow cached redirects instead of returning raw {redirect: ...}
    if (typeof cached.redirect === 'string') return handleArtist(cached.redirect, env, ctx)
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

  // Cache artist metadata with Wikipedia URL (returned immediately)
  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_POSITIVE })

  // Background job: rehost Wikimedia image to IPFS (doesn't block response)
  if (ctx && links.image?.startsWith('https://')) {
    ctx.waitUntil(rehostArtistImageBackground(mbid, links.image, env))
  }

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

// ── Release-group (album) metadata ──────────────────────────────────

/**
 * GET /release-group/:mbid
 * Returns album metadata: title, artist-credit, date, genres, cover art, links.
 */
async function handleReleaseGroup(mbid: string, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const cacheKey = `release-group:${mbid}`
  const cached = await env.CACHE.get(cacheKey, 'json') as Record<string, unknown> | null
  if (cached) {
    if (typeof cached.redirect === 'string') return handleReleaseGroup(cached.redirect, env, ctx)
    return jsonResponse(cached)
  }

  const url = `https://musicbrainz.org/ws/2/release-group/${mbid}?inc=artists+genres+url-rels+releases&fmt=json`
  const res = await mbFetch(url, env)

  if (res.status === 404) {
    const neg = { error: 'not_found', mbid }
    await env.CACHE.put(cacheKey, JSON.stringify(neg), { expirationTtl: CACHE_TTL_NEGATIVE })
    return jsonResponse(neg, 404)
  }

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('Location')
    if (location) {
      const newMbid = location.match(/release-group\/([a-f0-9-]{36})/)?.[1]
      if (newMbid) {
        await env.CACHE.put(cacheKey, JSON.stringify({ redirect: newMbid }), { expirationTtl: CACHE_TTL_POSITIVE })
        return handleReleaseGroup(newMbid, env)
      }
    }
  }

  if (!res.ok) {
    return jsonResponse({ error: 'upstream_error', status: res.status }, 502)
  }

  const data = await res.json() as {
    id: string
    title: string
    'primary-type'?: string
    'secondary-types'?: string[]
    'first-release-date'?: string
    disambiguation?: string
    'artist-credit'?: Array<{
      artist: { id: string; name: string; 'sort-name': string }
      joinphrase?: string
    }>
    genres?: Array<{ name: string; count: number }>
    releases?: Array<{
      id: string
      title: string
      date?: string
      status?: string
      'track-count'?: number
    }>
    relations?: Array<{
      type: string
      url?: { resource: string }
    }>
  }

  // Extract links (same pattern as artist)
  const links: Record<string, string> = {}
  for (const rel of data.relations ?? []) {
    if (rel.url?.resource) {
      if (rel.type === 'wikidata') links.wikidata = rel.url.resource
      else if (rel.type === 'discogs') links.discogs = rel.url.resource
      else if (rel.type === 'streaming music' || rel.type === 'free streaming') {
        const u = rel.url.resource
        if (u.includes('spotify.com')) links.spotify = u
      }
    }
  }

  // Pick the earliest official release for track count
  const officialRelease = (data.releases ?? [])
    .filter((r) => r.status === 'Official')
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0]

  const coverArtUrl = `https://coverartarchive.org/release-group/${data.id}/front-250`

  const result = {
    mbid: data.id,
    title: data.title,
    type: data['primary-type'] ?? null,
    secondaryTypes: data['secondary-types'] ?? [],
    releaseDate: data['first-release-date'] ?? null,
    disambiguation: data.disambiguation ?? null,
    artists: (data['artist-credit'] ?? []).map((ac) => ({
      mbid: ac.artist.id,
      name: ac.artist.name,
      joinphrase: ac.joinphrase ?? '',
    })),
    genres: (data.genres ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((g) => g.name),
    coverArtUrl,
    trackCount: officialRelease?.['track-count'] ?? null,
    links,
  }

  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_POSITIVE })

  // Background job: rehost cover art to IPFS
  if (ctx && coverArtUrl) {
    ctx.waitUntil(rehostReleaseGroupCoverBackground(mbid, coverArtUrl, env))
  }

  return jsonResponse(result)
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

// ── Filebase S3 Upload ──────────────────────────────────────────────

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(message))
  const hashArray = new Uint8Array(hashBuffer)
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function uploadToFilebase(
  imageData: Uint8Array,
  contentType: string,
  filename: string,
  env: Env
): Promise<string> {
  if (!env.FILEBASE_API_KEY) {
    throw new Error('FILEBASE_API_KEY not configured')
  }

  const decoded = atob(env.FILEBASE_API_KEY)
  const [accessKey, secretKey, bucket] = decoded.split(':')
  if (!accessKey || !secretKey || !bucket) {
    throw new Error('Invalid FILEBASE_API_KEY format (expected base64(accessKey:secretKey:bucket))')
  }

  const endpoint = 's3.filebase.com'
  const region = 'us-east-1'
  const service = 's3'

  const date = new Date()
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const canonicalUri = `/${bucket}/${filename}`

  // Compute payload hash
  const payloadHashBuffer = await crypto.subtle.digest('SHA-256', imageData)
  const payloadHash = bytesToHex(new Uint8Array(payloadHashBuffer))

  const canonicalHeaders =
    `host:${endpoint}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const canonicalRequestHash = await sha256Hex(canonicalRequest)
  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n')

  // Compute signing key
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  const kSigning = await hmacSha256(kService, 'aws4_request')

  const signature = await hmacHex(kSigning, stringToSign)

  const authHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  const response = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Content-Type': contentType,
    },
    body: imageData,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Filebase upload failed: ${response.status} ${text}`)
  }

  const cid = response.headers.get('x-amz-meta-cid')
  if (!cid) {
    throw new Error('No CID returned from Filebase')
  }

  return cid
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return new Uint8Array(sig)
}

async function hmacHex(key: Uint8Array, message: string): Promise<string> {
  const sig = await hmacSha256(key, message)
  return bytesToHex(sig)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Image Rehosting ─────────────────────────────────────────────────

interface RehostRequest {
  urls: string[]
}

interface RehostResult {
  url: string
  ipfsUrl: string | null
  cid: string | null
  error: string | null
  cached: boolean
}

/**
 * POST /rehost/image
 * Batch rehost external images to Filebase IPFS.
 * Input:  { urls: ["https://..."] }
 * Output: { results: [{ url, ipfsUrl, cid, error, cached }] }
 */
async function handleRehostImage(request: Request, env: Env): Promise<Response> {
  if (!env.FILEBASE_API_KEY) {
    return jsonResponse({ error: 'FILEBASE_API_KEY not configured' }, 500)
  }

  let body: RehostRequest
  try {
    body = (await request.json()) as RehostRequest
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  if (!Array.isArray(body.urls) || body.urls.length === 0) {
    return jsonResponse({ error: 'urls array required' }, 400)
  }

  if (body.urls.length > 50) {
    return jsonResponse({ error: 'max 50 URLs per batch' }, 400)
  }

  // Validate URLs
  for (const url of body.urls) {
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      return jsonResponse({ error: 'all URLs must be HTTPS strings' }, 400)
    }
  }

  const results: RehostResult[] = []

  for (const url of body.urls) {
    try {
      const result = await rehostSingleImage(url, env)
      results.push(result)
    } catch (err) {
      results.push({
        url,
        ipfsUrl: null,
        cid: null,
        error: err instanceof Error ? err.message : String(err),
        cached: false,
      })
    }
  }

  return jsonResponse({ results })
}

async function rehostSingleImage(url: string, env: Env): Promise<RehostResult> {
  // Compute URL hash for cache key
  const urlHash = await sha256Hex(url)
  const cacheKey = `rehost:${urlHash}`

  // Check cache
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    return {
      url,
      ipfsUrl: `ipfs://${cached}`,
      cid: cached,
      error: null,
      cached: true,
    }
  }

  // Fetch external image
  const response = await fetch(url, {
    headers: {
      'User-Agent': env.MB_USER_AGENT,
    },
    signal: AbortSignal.timeout(15000), // 15s timeout
  })

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const buffer = await response.arrayBuffer()
  const imageData = new Uint8Array(buffer)

  if (imageData.byteLength > 10 * 1024 * 1024) {
    throw new Error('Image too large (max 10MB)')
  }

  // Generate unique filename
  const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg'
  const filename = `${urlHash.slice(0, 16)}.${ext}`

  // Upload to Filebase
  const cid = await uploadToFilebase(imageData, contentType, filename, env)

  // Cache CID (1 year TTL)
  await env.CACHE.put(cacheKey, cid, { expirationTtl: CACHE_TTL_IMAGE })

  return {
    url,
    ipfsUrl: `ipfs://${cid}`,
    cid,
    error: null,
    cached: false,
  }
}

/**
 * Background job: rehost artist image to IPFS and update cached artist metadata.
 * Runs after returning the initial response (doesn't block user).
 */
async function rehostArtistImageBackground(
  mbid: string,
  imageUrl: string,
  env: Env
): Promise<void> {
  try {
    // Rehost the image
    const result = await rehostSingleImage(imageUrl, env)
    if (!result.ipfsUrl) {
      console.warn(`[Artist] Rehost failed for ${mbid}:`, result.error)
      return
    }

    // Update cached artist metadata with IPFS URL
    const cacheKey = `artist:${mbid}`
    const cached = await env.CACHE.get(cacheKey, 'json') as Record<string, unknown> | null
    if (cached && typeof cached === 'object' && 'links' in cached) {
      const updated = {
        ...cached,
        links: {
          ...(cached.links as Record<string, unknown>),
          image: result.ipfsUrl,
        },
      }
      await env.CACHE.put(cacheKey, JSON.stringify(updated), { expirationTtl: CACHE_TTL_POSITIVE })
      console.log(`[Artist] Rehosted ${mbid} image: ${result.cid}`)
    }
  } catch (err) {
    console.error(`[Artist] Background rehost failed for ${mbid}:`, err)
  }
}

/**
 * Background job: rehost release-group cover art to IPFS and update cached metadata.
 */
async function rehostReleaseGroupCoverBackground(
  mbid: string,
  coverArtUrl: string,
  env: Env
): Promise<void> {
  try {
    const result = await rehostSingleImage(coverArtUrl, env)
    if (!result.ipfsUrl) {
      console.warn(`[ReleaseGroup] Rehost failed for ${mbid}:`, result.error)
      return
    }

    // Update cached release-group metadata
    const cacheKey = `release-group:${mbid}`
    const cached = await env.CACHE.get(cacheKey, 'json') as Record<string, unknown> | null
    if (cached && typeof cached === 'object') {
      const updated = { ...cached, coverArtUrl: result.ipfsUrl }
      await env.CACHE.put(cacheKey, JSON.stringify(updated), { expirationTtl: CACHE_TTL_POSITIVE })
      console.log(`[ReleaseGroup] Rehosted ${mbid} cover: ${result.cid}`)
    }
  } catch (err) {
    console.error(`[ReleaseGroup] Background rehost failed for ${mbid}:`, err)
  }
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      if (path === '/rehost/image') {
        return handleRehostImage(request, env)
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
      return handleArtist(mbid, env, ctx)
    }

    // GET /release-group/:mbid
    const releaseGroupMatch = path.match(/^\/release-group\/([a-f0-9-]{36})$/)
    if (releaseGroupMatch) {
      const mbid = releaseGroupMatch[1]
      if (!UUID_RE.test(mbid)) return jsonResponse({ error: 'invalid mbid' }, 400)
      return handleReleaseGroup(mbid, env, ctx)
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
