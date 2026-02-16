/**
 * Activity Context for Scarlett
 *
 * Queries the activity-feed subgraph for a user's recent scrobbles, sleep,
 * runs, and meals, then formats them as natural-language context for the
 * system prompt.
 */

import type { Env } from "./env";

interface FeedItem {
  kind: string;
  source: string;
  ts: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  count: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  cid: string | null;
  photoCid: string | null;
  analysisCid: string | null;
}

interface ScrobbleTrack {
  artist: string;
  title: string;
  album?: string;
}

interface ScrobbleTrackWrapped {
  raw?: ScrobbleTrack;
  artist?: string;
  title?: string;
  album?: string;
}

interface ScrobbleBatch {
  tracks: ScrobbleTrackWrapped[];
}

interface SubgraphResponse {
  data?: { feedItems: FeedItem[] };
  errors?: Array<{ message: string }>;
}

interface MealAnalysis {
  description: string;
  items?: Array<{ name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }>;
  totals?: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
}

const FEED_QUERY = `
query UserFeed($user: Bytes!) {
  feedItems(
    where: { user: $user, revoked: false }
    orderBy: ts
    orderDirection: desc
    first: 30
  ) {
    kind
    source
    ts
    durationSeconds
    distanceMeters
    count
    calories
    proteinG
    carbsG
    fatG
    cid
    photoCid
    analysisCid
  }
}`;

/**
 * Fetch recent activity items from the subgraph for a wallet address.
 */
async function fetchFeedItems(env: Env, wallet: string): Promise<FeedItem[]> {
  if (!env.SUBGRAPH_URL) return [];

  try {
    const res = await fetch(env.SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: FEED_QUERY,
        variables: { user: wallet.toLowerCase() },
      }),
    });

    if (!res.ok) {
      console.warn(`[activity] Subgraph returned ${res.status}`);
      return [];
    }

    const json = (await res.json()) as SubgraphResponse;
    if (json.errors?.length) {
      console.warn("[activity] Subgraph errors:", json.errors[0].message);
      return [];
    }

    return json.data?.feedItems ?? [];
  } catch (e) {
    console.warn("[activity] Subgraph fetch failed:", e);
    return [];
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDistance(meters: number): string {
  const km = meters / 1000;
  return km >= 1 ? `${km.toFixed(1)}km` : `${meters}m`;
}

function relativeTime(tsSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - tsSeconds;
  if (diff < 3600) return `${Math.floor(diff / 60)}min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/**
 * Build a natural-language summary of the user's recent activity.
 * Returns null if no activity data is available.
 */
export async function getActivityContext(env: Env, wallet: string): Promise<string | null> {
  const items = await fetchFeedItems(env, wallet);
  if (items.length === 0) return null;

  const sleep: string[] = [];
  const runs: string[] = [];
  const musicItems: FeedItem[] = [];
  const mealItems: FeedItem[] = [];

  for (const item of items) {
    switch (item.kind) {
      case "MUSIC":
        musicItems.push(item);
        break;
      case "SLEEP": {
        const when = relativeTime(parseInt(item.ts));
        const dur = item.durationSeconds ? formatDuration(item.durationSeconds) : "?";
        sleep.push(`${dur} (${when})`);
        break;
      }
      case "RUN": {
        const when = relativeTime(parseInt(item.ts));
        const dist = item.distanceMeters ? formatDistance(item.distanceMeters) : "?";
        const dur = item.durationSeconds ? formatDuration(item.durationSeconds) : "";
        runs.push(`${dist}${dur ? " in " + dur : ""} (${when})`);
        break;
      }
      case "MEAL":
        mealItems.push(item);
        break;
    }
  }

  // Resolve meal analysis from IPFS (description + macros) and scrobble tracks in parallel
  const mealCids = mealItems.filter((m) => m.analysisCid).slice(0, 5);
  const musicCids = musicItems.filter((m) => m.cid).slice(0, 3);

  const [mealAnalyses, trackResults] = await Promise.all([
    Promise.all(mealCids.map((m) => fetchMealAnalysis(m.analysisCid!))),
    Promise.all(musicCids.map((m) => fetchScrobbleTracks(m.cid!))),
  ]);

  // Build meal sections
  const meals: string[] = [];
  for (let i = 0; i < mealItems.length && meals.length < 5; i++) {
    const item = mealItems[i];
    const when = relativeTime(parseInt(item.ts));
    const cidIdx = mealCids.indexOf(item);
    const analysis = cidIdx >= 0 ? mealAnalyses[cidIdx] : null;

    if (analysis?.description) {
      const parts: string[] = [analysis.description];
      if (analysis.totals && (analysis.totals.calories > 0 || analysis.totals.protein_g > 0)) {
        let macros = `~${analysis.totals.calories} cal`;
        if (analysis.totals.protein_g) macros += `, ${analysis.totals.protein_g}g protein`;
        if (analysis.totals.carbs_g) macros += `, ${analysis.totals.carbs_g}g carbs`;
        if (analysis.totals.fat_g) macros += `, ${analysis.totals.fat_g}g fat`;
        parts.push(macros);
      }
      meals.push(`${parts.join(" — ")} (${when})`);
    } else if (item.calories != null && item.calories > 0) {
      meals.push(`~${item.calories} cal (${when})`);
    } else {
      meals.push(`photo logged (${when})`);
    }
  }

  // Build music sections
  const musicSections: string[] = [];
  for (let i = 0; i < musicCids.length; i++) {
    const item = musicCids[i];
    const tracks = trackResults[i];
    const when = relativeTime(parseInt(item.ts));

    if (tracks.length > 0) {
      const trackList = tracks.slice(0, 5).map((t) => `${t.artist} – ${t.title}`).join(", ");
      musicSections.push(`${trackList} (${when})`);
    } else {
      musicSections.push(`${item.count ?? 0} tracks (${when})`);
    }
  }

  const sections: string[] = [];

  if (meals.length > 0) {
    sections.push(`Meals: ${meals.join("; ")}`);
  }
  if (musicSections.length > 0) {
    sections.push(`Music listened to: ${musicSections.join("; ")}`);
  }
  if (sleep.length > 0) {
    sections.push(`Sleep: ${sleep.slice(0, 5).join(", ")}`);
  }
  if (runs.length > 0) {
    sections.push(`Runs: ${runs.slice(0, 5).join(", ")}`);
  }

  if (sections.length === 0) return null;

  return sections.join("\n");
}

/**
 * Fetch track list from an IPFS CID (Filebase gateway).
 * Best-effort with a short timeout.
 */
async function fetchScrobbleTracks(cid: string): Promise<ScrobbleTrack[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://ipfs.filebase.io/ipfs/${cid}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const batch = (await res.json()) as ScrobbleBatch;
    if (!batch.tracks) return [];

    // Handle both v2 (flat) and v3 (wrapped in .raw) formats
    return batch.tracks.map((t) => {
      if (t.raw) return { artist: t.raw.artist, title: t.raw.title, album: t.raw.album };
      return { artist: t.artist ?? "", title: t.title ?? "", album: t.album };
    }).filter((t) => t.artist && t.title);
  } catch {
    return [];
  }
}

/**
 * Fetch meal analysis JSON from IPFS (has description + items + macros).
 * Best-effort with a short timeout.
 */
async function fetchMealAnalysis(analysisCid: string): Promise<MealAnalysis | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://ipfs.filebase.io/ipfs/${analysisCid}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const json = (await res.json()) as MealAnalysis;
    return json.description ? json : null;
  } catch {
    return null;
  }
}
