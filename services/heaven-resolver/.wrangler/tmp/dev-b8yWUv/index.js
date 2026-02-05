var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-Wdc7j4/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/index.ts
var CACHE_TTL_POSITIVE = 60 * 60 * 24 * 30;
var CACHE_TTL_NEGATIVE = 60 * 60;
var lastMbRequest = 0;
async function mbFetch(url, env) {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastMbRequest));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastMbRequest = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": env.MB_USER_AGENT,
      Accept: "application/json"
    }
  });
}
__name(mbFetch, "mbFetch");
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}
__name(jsonResponse, "jsonResponse");
async function handleRecording(mbid, env) {
  const cacheKey = `recording:${mbid}`;
  const cached = await env.CACHE.get(cacheKey, "json");
  if (cached) return jsonResponse(cached);
  const url = `https://musicbrainz.org/ws/2/recording/${mbid}?inc=artists&fmt=json`;
  const res = await mbFetch(url, env);
  if (res.status === 404) {
    const neg = { error: "not_found", mbid };
    await env.CACHE.put(cacheKey, JSON.stringify(neg), { expirationTtl: CACHE_TTL_NEGATIVE });
    return jsonResponse(neg, 404);
  }
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("Location");
    if (location) {
      const newMbid = location.match(/recording\/([a-f0-9-]{36})/)?.[1];
      if (newMbid) {
        const redirect = { redirect: newMbid };
        await env.CACHE.put(cacheKey, JSON.stringify(redirect), { expirationTtl: CACHE_TTL_POSITIVE });
        return handleRecording(newMbid, env);
      }
    }
  }
  if (!res.ok) {
    return jsonResponse({ error: "upstream_error", status: res.status }, 502);
  }
  const data = await res.json();
  const result = {
    recording: { mbid: data.id, title: data.title },
    artists: (data["artist-credit"] ?? []).map((ac) => ({
      mbid: ac.artist.id,
      name: ac.artist.name,
      sortName: ac.artist["sort-name"]
    }))
  };
  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_POSITIVE });
  return jsonResponse(result);
}
__name(handleRecording, "handleRecording");
async function handleArtist(mbid, env) {
  const cacheKey = `artist:${mbid}`;
  const cached = await env.CACHE.get(cacheKey, "json");
  if (cached) return jsonResponse(cached);
  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=genres+url-rels&fmt=json`;
  const res = await mbFetch(url, env);
  if (res.status === 404) {
    const neg = { error: "not_found", mbid };
    await env.CACHE.put(cacheKey, JSON.stringify(neg), { expirationTtl: CACHE_TTL_NEGATIVE });
    return jsonResponse(neg, 404);
  }
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("Location");
    if (location) {
      const newMbid = location.match(/artist\/([a-f0-9-]{36})/)?.[1];
      if (newMbid) {
        await env.CACHE.put(cacheKey, JSON.stringify({ redirect: newMbid }), { expirationTtl: CACHE_TTL_POSITIVE });
        return handleArtist(newMbid, env);
      }
    }
  }
  if (!res.ok) {
    return jsonResponse({ error: "upstream_error", status: res.status }, 502);
  }
  const data = await res.json();
  const links = {};
  for (const rel of data.relations ?? []) {
    if (rel.url?.resource) {
      if (rel.type === "wikidata") links.wikidata = rel.url.resource;
      else if (rel.type === "image") links.image = rel.url.resource;
      else if (rel.type === "official homepage") links.website = rel.url.resource;
      else if (rel.type === "social network") {
        const u = rel.url.resource;
        if (u.includes("twitter.com") || u.includes("x.com")) links.twitter = u;
        else if (u.includes("instagram.com")) links.instagram = u;
        else if (u.includes("facebook.com")) links.facebook = u;
      } else if (rel.type === "streaming music" || rel.type === "free streaming") {
        const u = rel.url.resource;
        if (u.includes("spotify.com")) links.spotify = u;
        else if (u.includes("soundcloud.com")) links.soundcloud = u;
      }
    }
  }
  const result = {
    mbid: data.id,
    name: data.name,
    sortName: data["sort-name"],
    type: data.type ?? null,
    disambiguation: data.disambiguation ?? null,
    country: data.country ?? null,
    area: data.area?.name ?? null,
    lifeSpan: data["life-span"] ?? null,
    genres: (data.genres ?? []).sort((a, b) => b.count - a.count).slice(0, 10).map((g) => g.name),
    links
  };
  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_POSITIVE });
  return jsonResponse(result);
}
__name(handleArtist, "handleArtist");
async function handleSearchArtist(query, env) {
  if (!query || query.length < 2) {
    return jsonResponse({ error: "query too short" }, 400);
  }
  const cacheKey = `search:artist:${query.toLowerCase().trim()}`;
  const cached = await env.CACHE.get(cacheKey, "json");
  if (cached) return jsonResponse(cached);
  const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(query)}&limit=5&fmt=json`;
  const res = await mbFetch(url, env);
  if (!res.ok) {
    return jsonResponse({ error: "upstream_error", status: res.status }, 502);
  }
  const data = await res.json();
  const result = {
    artists: (data.artists ?? []).map((a) => ({
      mbid: a.id,
      name: a.name,
      sortName: a["sort-name"],
      score: a.score,
      type: a.type ?? null,
      disambiguation: a.disambiguation ?? null,
      country: a.country ?? null
    }))
  };
  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 });
  return jsonResponse(result);
}
__name(handleSearchArtist, "handleSearchArtist");
var MAX_BATCH_SIZE = 50;
var MIN_SCORE = 80;
var EMPTY_RESULT = {
  recording_mbid: null,
  recording_name: null,
  artist_mbids: [],
  artist_credit_name: null,
  release_mbid: null,
  release_name: null,
  score: 0
};
async function resolveOne(item, env) {
  const parts = [
    `recording:"${luceneEscape(item.title)}"`,
    `artist:"${luceneEscape(item.artist)}"`
  ];
  if (item.release) {
    parts.push(`release:"${luceneEscape(item.release)}"`);
  }
  const q = parts.join(" AND ");
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&limit=1&fmt=json`;
  const res = await mbFetch(url, env);
  if (!res.ok) return EMPTY_RESULT;
  const data = await res.json();
  const top = data.recordings?.[0];
  if (!top || top.score < MIN_SCORE) return EMPTY_RESULT;
  return {
    recording_mbid: top.id,
    recording_name: top.title,
    artist_mbids: (top["artist-credit"] ?? []).map((ac) => ac.artist.id),
    artist_credit_name: (top["artist-credit"] ?? []).map((ac) => ac.artist.name).join(", ") || null,
    release_mbid: top.releases?.[0]?.id ?? null,
    release_name: top.releases?.[0]?.title ?? null,
    score: top.score
  };
}
__name(resolveOne, "resolveOne");
async function handleResolveBatch(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  if (!Array.isArray(body.recordings) || body.recordings.length === 0) {
    return jsonResponse({ error: "recordings array required" }, 400);
  }
  if (body.recordings.length > MAX_BATCH_SIZE) {
    return jsonResponse({ error: `max ${MAX_BATCH_SIZE} recordings per batch` }, 400);
  }
  const items = body.recordings;
  for (const item of items) {
    if (!item.artist || !item.title) {
      return jsonResponse({ error: "each item needs artist and title" }, 400);
    }
  }
  const cacheKeys = items.map(
    (item) => `resolve:${item.artist.toLowerCase().trim()}::${item.title.toLowerCase().trim()}`
  );
  const cached = await Promise.all(
    cacheKeys.map((key) => env.CACHE.get(key, "json"))
  );
  const results = new Array(items.length);
  const uncachedIndices = [];
  for (let i = 0; i < items.length; i++) {
    if (cached[i] !== null) {
      results[i] = cached[i];
    } else {
      uncachedIndices.push(i);
    }
  }
  for (const idx of uncachedIndices) {
    const resolved = await resolveOne(items[idx], env);
    results[idx] = resolved;
    const ttl = resolved.recording_mbid ? CACHE_TTL_POSITIVE : CACHE_TTL_NEGATIVE;
    await env.CACHE.put(cacheKeys[idx], JSON.stringify(resolved), { expirationTtl: ttl });
  }
  return jsonResponse({ results });
}
__name(handleResolveBatch, "handleResolveBatch");
async function handleResolveSpotifyArtist(spotifyId, env) {
  const cacheKey = `spotify-artist:${spotifyId}`;
  const cached = await env.CACHE.get(cacheKey, "json");
  if (cached) return jsonResponse(cached);
  const spotifyUrl = `https://open.spotify.com/artist/${spotifyId}`;
  const url = `https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(spotifyUrl)}&inc=artist-rels&fmt=json`;
  const res = await mbFetch(url, env);
  if (res.status === 404) {
    const neg = { error: "not_found", spotifyId };
    await env.CACHE.put(cacheKey, JSON.stringify(neg), { expirationTtl: CACHE_TTL_NEGATIVE });
    return jsonResponse(neg, 404);
  }
  if (!res.ok) {
    return jsonResponse({ error: "upstream_error", status: res.status }, 502);
  }
  const data = await res.json();
  const artistRel = data.relations?.find((r) => r.artist);
  if (!artistRel?.artist) {
    const neg = { error: "no_artist_relation", spotifyId };
    await env.CACHE.put(cacheKey, JSON.stringify(neg), { expirationTtl: CACHE_TTL_NEGATIVE });
    return jsonResponse(neg, 404);
  }
  const result = {
    mbid: artistRel.artist.id,
    name: artistRel.artist.name,
    sortName: artistRel.artist["sort-name"],
    spotifyId
  };
  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_POSITIVE });
  return jsonResponse(result);
}
__name(handleResolveSpotifyArtist, "handleResolveSpotifyArtist");
function luceneEscape(s) {
  return s.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
}
__name(luceneEscape, "luceneEscape");
var UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
var SPOTIFY_ID_RE = /^[a-zA-Z0-9]{22}$/;
var src_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "POST") {
      if (path === "/resolve/batch") {
        return handleResolveBatch(request, env);
      }
      return jsonResponse({ error: "not found" }, 404);
    }
    if (request.method !== "GET") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }
    const recordingMatch = path.match(/^\/recording\/([a-f0-9-]{36})$/);
    if (recordingMatch) {
      const mbid = recordingMatch[1];
      if (!UUID_RE.test(mbid)) return jsonResponse({ error: "invalid mbid" }, 400);
      return handleRecording(mbid, env);
    }
    const artistMatch = path.match(/^\/artist\/([a-f0-9-]{36})$/);
    if (artistMatch) {
      const mbid = artistMatch[1];
      if (!UUID_RE.test(mbid)) return jsonResponse({ error: "invalid mbid" }, 400);
      return handleArtist(mbid, env);
    }
    if (path === "/search/artist") {
      const q = url.searchParams.get("q");
      if (!q) return jsonResponse({ error: "missing q parameter" }, 400);
      return handleSearchArtist(q, env);
    }
    const spotifyMatch = path.match(/^\/resolve\/spotify-artist\/([a-zA-Z0-9]+)$/);
    if (spotifyMatch) {
      const spotifyId = spotifyMatch[1];
      if (!SPOTIFY_ID_RE.test(spotifyId)) return jsonResponse({ error: "invalid spotify id" }, 400);
      return handleResolveSpotifyArtist(spotifyId, env);
    }
    if (path === "/" || path === "/health") {
      return jsonResponse({ ok: true, service: "heaven-resolver" });
    }
    return jsonResponse({ error: "not found" }, 404);
  }
};

// ../../../../../../../home/t42/.nvm/versions/node/v22.17.0/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../../home/t42/.nvm/versions/node/v22.17.0/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Wdc7j4/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../../../../home/t42/.nvm/versions/node/v22.17.0/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Wdc7j4/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
