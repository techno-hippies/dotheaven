/**
 * Artist data layer — fetches artist metadata from the heaven-resolver
 * (MusicBrainz proxy) and on-chain scrobble data from the Goldsky subgraph.
 */

import { SUBGRAPH_ACTIVITY, IPFS_GATEWAY } from './heaven-constants';

// ── Config ──────────────────────────────────────────────────────────

const RESOLVER_URL =
  'https://heaven-resolver-production.deletion-backup782.workers.dev';

/** Validate CID looks like an IPFS hash (Qm... or bafy...) */
function isValidCid(cid: string | undefined | null): cid is string {
  return !!cid && (cid.startsWith('Qm') || cid.startsWith('bafy'));
}

// ── Types ───────────────────────────────────────────────────────────

export interface ArtistInfo {
  mbid: string;
  name: string;
  sortName: string;
  type: string | null;
  disambiguation: string | null;
  country: string | null;
  area: string | null;
  lifeSpan: { begin?: string; end?: string; ended?: boolean } | null;
  genres: string[];
  links: Record<string, string>;
}

export interface ArtistSearchResult {
  mbid: string;
  name: string;
  sortName: string;
  score: number;
  type: string | null;
  disambiguation: string | null;
  country: string | null;
}

export interface ArtistTrack {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  coverCid: string;
  kind: number;
  payload: string;
  durationSec: number;
  scrobbleCount: number;
  lastPlayed: number; // unix seconds
}

export interface ArtistPageData {
  info: ArtistInfo;
  tracks: ArtistTrack[];
  totalScrobbles: number;
  uniqueListeners: number;
  ranking: number;
  totalArtists: number;
}

/** Display-ready track for the artist screen */
export interface DisplayTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumCover: string | undefined;
  scrobbleCount: number;
  duration: string;
}

// ── Resolver API ────────────────────────────────────────────────────

export async function searchArtist(
  query: string,
): Promise<ArtistSearchResult[]> {
  const res = await fetch(
    `${RESOLVER_URL}/search/artist?q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) throw new Error(`Search error: ${res.status}`);
  const data = (await res.json()) as { artists: ArtistSearchResult[] };
  return data.artists ?? [];
}

export async function fetchArtistInfo(mbid: string): Promise<ArtistInfo> {
  const res = await fetch(`${RESOLVER_URL}/artist/${mbid}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Artist not found');
    throw new Error(`Resolver error: ${res.status}`);
  }
  return res.json();
}

// ── Image rehosting ─────────────────────────────────────────────────

const imageCache = new Map<string, string>();

export async function resolveImageUrl(
  url: string | undefined,
): Promise<string | undefined> {
  if (!url) return undefined;

  // Already IPFS / Filebase — pass through
  if (url.startsWith('ipfs://') || url.includes('myfilebase.com')) {
    return url.startsWith('ipfs://')
      ? `https://heaven.myfilebase.com/ipfs/${url.slice(7)}`
      : url;
  }

  if (!url.startsWith('https://') && !url.startsWith('http://')) return url;

  const cached = imageCache.get(url);
  if (cached) return cached;

  try {
    const response = await fetch(`${RESOLVER_URL}/rehost/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url] }),
    });
    if (!response.ok) return url;

    const data = (await response.json()) as {
      results: Array<{
        url: string;
        ipfsUrl: string | null;
        error: string | null;
      }>;
    };
    const result = data.results[0];
    if (result?.ipfsUrl) {
      const ipfsUrl = `https://heaven.myfilebase.com/ipfs/${result.ipfsUrl.slice(7)}`;
      imageCache.set(url, ipfsUrl);
      return ipfsUrl;
    }
    return url;
  } catch {
    return url;
  }
}

// ── Subgraph: find tracks by artist name ────────────────────────────

export async function fetchArtistTracks(
  artistName: string,
  limit = 50,
): Promise<{
  tracks: ArtistTrack[];
  totalScrobbles: number;
  uniqueListeners: number;
}> {
  const results = await queryArtistTracks({
    where: `artist_contains_nocase: "${escapeGql(artistName)}"`,
    limit: Math.max(limit, 200),
  });

  const target = normalizeArtistName(artistName);
  const filtered = results.filter((t) => artistMatchesTarget(t.artist, target));

  return mapArtistTracks(filtered);
}

/**
 * Fetch full artist page data: resolver info + subgraph scrobble stats.
 */
export async function fetchArtistPageData(
  mbid: string,
): Promise<ArtistPageData> {
  const info = await fetchArtistInfo(mbid);

  const [trackResult, rankResult] = await Promise.all([
    fetchArtistTracks(info.name),
    fetchArtistRanking(info.name),
  ]);

  return {
    info,
    tracks: trackResult.tracks,
    totalScrobbles: trackResult.totalScrobbles,
    uniqueListeners: trackResult.uniqueListeners,
    ranking: rankResult.ranking,
    totalArtists: rankResult.totalArtists,
  };
}

/**
 * Fetch artist page data starting from an artist name (searches for MBID first).
 */
export async function fetchArtistPageDataByName(
  artistName: string,
): Promise<ArtistPageData | null> {
  const results = await searchArtist(artistName);
  if (results.length === 0) return null;

  // Use the top search result
  return fetchArtistPageData(results[0].mbid);
}

/**
 * Compute the artist's ranking by total scrobble count among all artists.
 */
async function fetchArtistRanking(
  artistName: string,
): Promise<{ ranking: number; totalArtists: number }> {
  const allTracks: Array<{ artist: string; scrobbleCount: number }> = [];
  let skip = 0;
  const pageSize = 1000;

  while (true) {
    const query = `{
      tracks(first: ${pageSize}, skip: ${skip}, orderBy: registeredAt, orderDirection: desc) {
        artist
        scrobbles { id }
      }
    }`;
    const res = await fetch(SUBGRAPH_ACTIVITY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) break;
    const json = await res.json();
    const tracks = json.data?.tracks ?? [];
    if (tracks.length === 0) break;
    for (const t of tracks) {
      if (t.scrobbles.length > 0) {
        allTracks.push({ artist: t.artist, scrobbleCount: t.scrobbles.length });
      }
    }
    if (tracks.length < pageSize) break;
    skip += pageSize;
  }

  const artistScrobbles = new Map<string, number>();
  for (const t of allTracks) {
    const parts = splitArtistNames(t.artist);
    const primary = parts[0] || normalizeArtistName(t.artist);
    artistScrobbles.set(
      primary,
      (artistScrobbles.get(primary) ?? 0) + t.scrobbleCount,
    );
  }

  const sorted = [...artistScrobbles.entries()].sort((a, b) => b[1] - a[1]);

  const targetVariants = normalizeArtistVariants(artistName);
  let ranking = 0;
  for (let i = 0; i < sorted.length; i++) {
    const entryVariants = normalizeArtistVariants(sorted[i][0]);
    for (const v of targetVariants) {
      if (entryVariants.has(v)) {
        ranking = i + 1;
        break;
      }
    }
    if (ranking > 0) break;
  }

  return { ranking, totalArtists: sorted.length };
}

/**
 * Convert ArtistTrack[] to DisplayTrack[] for the screen.
 */
export function artistTracksToDisplayTracks(
  artistTracks: ArtistTrack[],
): DisplayTrack[] {
  return artistTracks.map((t) => ({
    id: t.trackId,
    title: t.title,
    artist: t.artist,
    album: t.album,
    albumCover: isValidCid(t.coverCid)
      ? `${IPFS_GATEWAY}${t.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
      : undefined,
    scrobbleCount: t.scrobbleCount,
    duration: formatDuration(t.durationSec),
  }));
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Wikimedia image helpers ─────────────────────────────────────────

export function promoteWikimediaThumb(url: string, width = 1600): string {
  if (!url.includes('/wikipedia/commons/thumb/')) return url;
  return url.replace(/\/\d+px-/, `/${width}px-`);
}

export function buildWikimediaImageCandidates(url?: string): string[] {
  if (!url) return [];

  const out = new Set<string>();
  out.add(url);

  if (url.includes('/wikipedia/commons/thumb/')) {
    out.add(promoteWikimediaThumb(url, 1600));
    out.add(promoteWikimediaThumb(url, 1200));

    const original = url
      .replace('/wikipedia/commons/thumb/', '/wikipedia/commons/')
      .replace(/\/\d+px-[^/]+$/, '');
    out.add(original);
  }

  return Array.from(out);
}

// ── Helpers ──────────────────────────────────────────────────────────

function escapeGql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ── Internal helpers ───────────────────────────────────────────────

type RawArtistTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  kind: number;
  payload: string;
  coverCid: string | null;
  durationSec: number | null;
  scrobbles: Array<{ id: string; user: string; timestamp: string }>;
};

async function queryArtistTracks(params: {
  where: string;
  limit: number;
}): Promise<RawArtistTrack[]> {
  const query = `{
    tracks(
      where: { ${params.where} }
      first: ${params.limit}
      orderBy: registeredAt
      orderDirection: desc
    ) {
      id
      title
      artist
      album
      kind
      payload
      coverCid
      durationSec
      scrobbles(first: 1000) {
        id
        user
        timestamp
      }
    }
  }`;

  const res = await fetch(SUBGRAPH_ACTIVITY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph query failed: ${res.status}`);
  const json = await res.json();
  return json.data?.tracks ?? [];
}

function mapArtistTracks(rawTracks: RawArtistTrack[]): {
  tracks: ArtistTrack[];
  totalScrobbles: number;
  uniqueListeners: number;
} {
  let totalScrobbles = 0;
  const listenerSet = new Set<string>();

  const tracks: ArtistTrack[] = rawTracks.map((t) => {
    totalScrobbles += t.scrobbles.length;
    for (const s of t.scrobbles) listenerSet.add(s.user);

    const lastPlayed =
      t.scrobbles.length > 0
        ? Math.max(...t.scrobbles.map((s) => parseInt(s.timestamp)))
        : 0;

    return {
      trackId: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album ?? '',
      coverCid: t.coverCid ?? '',
      kind: t.kind,
      payload: t.payload ?? '',
      durationSec: t.durationSec ?? 0,
      scrobbleCount: t.scrobbles.length,
      lastPlayed,
    };
  });

  tracks.sort((a, b) => b.scrobbleCount - a.scrobbleCount);

  return { tracks, totalScrobbles, uniqueListeners: listenerSet.size };
}

export function normalizeArtistName(name: string): string {
  const folded = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return folded
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/&/g, ' and ')
    .replace(/\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/g, ' feat ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function splitArtistNames(name: string): string[] {
  const unified = name
    .toLowerCase()
    .replace(/\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/g, '|')
    .replace(/\bstarring\b/g, '|')
    .replace(/&/g, '|')
    .replace(/\+/g, '|')
    .replace(/\bx\b/g, '|')
    .replace(/\band\b/g, '|')
    .replace(/\bwith\b/g, '|')
    .replace(/\//g, '|')
    .replace(/,/g, '|');
  return unified
    .split('|')
    .map((p) => normalizeArtistName(p))
    .filter(Boolean);
}

export function artistMatchesTarget(
  artistField: string,
  targetNorm: string,
): boolean {
  if (!targetNorm) return false;
  const targetVariants = normalizeArtistVariants(targetNorm);
  const fieldVariants = normalizeArtistVariants(artistField);

  for (const fieldVariant of fieldVariants) {
    for (const targetVariant of targetVariants) {
      if (fieldVariant === targetVariant) return true;
      if (wordContains(fieldVariant, targetVariant)) return true;
      if (wordContains(targetVariant, fieldVariant)) return true;
    }
  }
  for (const part of splitArtistNames(artistField)) {
    for (const targetVariant of targetVariants) {
      if (part === targetVariant) return true;
      if (wordContains(part, targetVariant)) return true;
    }
  }
  return false;
}

export function normalizeArtistVariants(name: string): Set<string> {
  const base = normalizeArtistName(name);
  const variants = new Set<string>([base]);

  const noParens = base
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (noParens && noParens !== base) variants.add(noParens);

  if (base.startsWith('the ')) {
    variants.add(base.slice(4));
  }

  if (base.endsWith(' the')) {
    const noTrail = base.slice(0, -4);
    variants.add(noTrail);
    variants.add(`the ${noTrail}`);
  }

  return variants;
}

function wordContains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}
