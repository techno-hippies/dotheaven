/**
 * Activity Context for Scarlett
 *
 * Keeps prompt context compact:
 * - latest 5 scrobbles
 * - all-time total scrobbles + #1 artist (from aggregate entities when available)
 */

import type { Env } from "./env";

interface ScrobbleTrack {
  artist: string;
  title: string;
  album?: string | null;
}

interface ScrobbleRow {
  timestamp: string;
  track: ScrobbleTrack | null;
}

interface RecentScrobblesResponse {
  data?: { scrobbles: ScrobbleRow[] };
  errors?: Array<{ message: string }>;
}

interface ListeningStatsRow {
  totalScrobbles: string;
  lastScrobbleAt: string;
  topArtist: string;
  topArtistScrobbleCount: string;
}

interface ListeningStatsResponse {
  data?: { userListeningStats: ListeningStatsRow | null };
  errors?: Array<{ message: string }>;
}

const RECENT_LIMIT = 5;

const RECENT_SCROBBLES_QUERY = `
query UserRecentScrobbles($user: Bytes!, $limit: Int!) {
  scrobbles(
    where: { user: $user }
    orderBy: timestamp
    orderDirection: desc
    first: $limit
  ) {
    timestamp
    track {
      artist
      title
      album
    }
  }
}`;

const LISTENING_STATS_QUERY = `
query UserListeningStats($userId: ID!) {
  userListeningStats(id: $userId) {
    totalScrobbles
    lastScrobbleAt
    topArtist
    topArtistScrobbleCount
  }
}`;

async function postGraphql<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  if (!env.SUBGRAPH_URL) return null;

  try {
    const res = await fetch(env.SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      console.warn(`[activity] Subgraph returned ${res.status}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (e) {
    console.warn("[activity] Subgraph fetch failed:", e);
    return null;
  }
}

async function fetchRecentScrobbles(env: Env, wallet: string): Promise<ScrobbleRow[]> {
  const json = await postGraphql<RecentScrobblesResponse>(
    env,
    RECENT_SCROBBLES_QUERY,
    { user: wallet.toLowerCase(), limit: RECENT_LIMIT },
  );
  if (!json) return [];
  if (json.errors?.length) {
    console.warn("[activity] recent scrobbles query error:", json.errors[0].message);
    return [];
  }
  return Array.isArray(json.data?.scrobbles) ? json.data.scrobbles : [];
}

async function fetchListeningStats(env: Env, wallet: string): Promise<ListeningStatsRow | null> {
  const json = await postGraphql<ListeningStatsResponse>(
    env,
    LISTENING_STATS_QUERY,
    { userId: wallet.toLowerCase() },
  );
  if (!json) return null;
  if (json.errors?.length) {
    // Aggregate entities may not exist yet on older deployments; fallback to recents-only context.
    console.warn("[activity] listening stats query error:", json.errors[0].message);
    return null;
  }
  return json.data?.userListeningStats ?? null;
}

function parseTimestamp(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function relativeTime(tsSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - tsSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatUtc(tsSeconds: number): string {
  return new Date(tsSeconds * 1000).toISOString().replace(".000Z", "Z");
}

function formatIntString(value: string): string {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num.toLocaleString("en-US") : value;
}

/**
 * Build a compact natural-language summary of listening behavior.
 * Returns null if no relevant data is available.
 */
export async function getActivityContext(env: Env, wallet: string): Promise<string | null> {
  const [recentRows, listeningStats] = await Promise.all([
    fetchRecentScrobbles(env, wallet),
    fetchListeningStats(env, wallet),
  ]);

  const recent = recentRows
    .map((row) => {
      const ts = parseTimestamp(row.timestamp);
      const artist = row.track?.artist?.trim() ?? "";
      const title = row.track?.title?.trim() ?? "";
      if (!ts || !artist || !title) return null;
      return `${artist} - ${title} (${relativeTime(ts)}; ${formatUtc(ts)})`;
    })
    .filter((v): v is string => v != null)
    .slice(0, RECENT_LIMIT);

  const lines: string[] = [];

  if (recent.length > 0) {
    lines.push(`Recent listens (latest ${RECENT_LIMIT}): ${recent.join("; ")}.`);
  }

  if (listeningStats) {
    const total = formatIntString(listeningStats.totalScrobbles);
    const topArtist = listeningStats.topArtist?.trim() || "Unknown Artist";
    const topArtistCount = formatIntString(listeningStats.topArtistScrobbleCount);
    const lastTs = parseTimestamp(listeningStats.lastScrobbleAt);
    const lastPart = lastTs ? ` Last scrobble: ${relativeTime(lastTs)} (${formatUtc(lastTs)}).` : "";
    lines.push(
      `All-time listening: ${total} scrobbles. #1 artist: ${topArtist} (${topArtistCount} scrobbles).${lastPart}`,
    );
  }

  if (lines.length === 0) return null;
  return lines.join("\n");
}
