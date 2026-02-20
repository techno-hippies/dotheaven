# Metadata Resolver

Cloudflare Worker for MusicBrainz API proxy + external image rehosting.

## Features

### MusicBrainz API Proxy
- **Rate limiting**: Enforces MB's 1 req/sec limit per isolate
- **KV caching**: 30-day positive cache, 1-hour negative cache
- **MBID redirects**: Follows merged entities automatically
- **Wikimedia resolution**: Converts Commons file pages to direct image URLs

### External Image Rehosting
- **Progressive caching**: Fetch external images once, upload to Filebase IPFS
- **Global dedupe**: URL hash → CID mapping cached for 1 year
- **Batch support**: Rehost up to 50 images per request
- **Graceful fallback**: Returns original URL if rehost fails

## Endpoints

### MusicBrainz
- `GET /recording/:mbid` - Recording metadata + artist + release-group
- `GET /artist/:mbid` - Artist metadata (name, genres, image, links)
- `GET /release-group/:mbid` - Album metadata (title, artists, cover art)
- `GET /search/artist?q=name` - Search artists by name
- `POST /resolve/batch` - Batch resolve `{artist, title}` → MBIDs
- `GET /resolve/spotify-artist/:id` - Spotify ID → MB artist MBID

### Image Rehosting
- `POST /rehost/image` - Batch rehost external images to Filebase IPFS

## Usage

### Rehost External Images

```typescript
import { rehostImages } from './lib/resolver-client'

const result = await rehostImages([
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/The_Beatles.jpg/400px-The_Beatles.jpg',
  'https://coverartarchive.org/release-group/abc123/front-250',
])

// result.results[0].ipfsUrl → "ipfs://Qm..."
// result.results[0].cached → true (if was already in cache)
```

### Request Format

```json
POST /rehost/image
{
  "urls": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.png"
  ]
}
```

### Response Format

```json
{
  "results": [
    {
      "url": "https://example.com/image1.jpg",
      "ipfsUrl": "ipfs://QmXxx...",
      "cid": "QmXxx...",
      "error": null,
      "cached": true
    },
    {
      "url": "https://example.com/image2.png",
      "ipfsUrl": null,
      "cid": null,
      "error": "Fetch failed: 404",
      "cached": false
    }
  ]
}
```

## Architecture

### Image Rehosting Flow

```
Frontend (ArtistPage) → image-cache.ts detects Wikipedia URL
                      ↓
                      → POST /rehost/image
                      ↓
metadata-resolver → Check KV cache (rehost:{sha256(url)})
               ↓ (cache miss)
               → Fetch Wikipedia image
               → Upload to Filebase S3
               → Store URL → CID in KV (1 year TTL)
               → Return ipfs://QmXxx...
               ↓
Frontend      → Display Filebase gateway URL
               → No more 429 errors!
```

### Artist Endpoint Background Rehosting

The `/artist/:mbid` and `/release-group/:mbid` endpoints perform background rehosting via `ctx.waitUntil()`. **Client-side rehosting via `image-cache.ts` is the preferred approach** for explicit rehosting, but the background path still runs as a best-effort warm-up.

**Cache key**: `rehost:{sha256(url)}`
**Cache TTL**: 1 year (images are immutable)

## Development and Deploy

```bash
cd services/metadata-resolver
bun install
cp .dev.vars.example .dev.vars
# Add FILEBASE_API_KEY to .dev.vars
bun run dev
bun run deploy
```

## Environment Variables

- `FILEBASE_API_KEY` - Base64 encoded `accessKey:secretKey:bucket` (secret)
- `MB_USER_AGENT` - MusicBrainz User-Agent (public var)
- `ENVIRONMENT` - `development` (public var)

## KV Namespaces

- **Active**: `53e3dd232b4e45ae9c21e8a756136c64`

## Cache Keys

| Prefix | Format | Example | TTL |
|--------|--------|---------|-----|
| `recording:` | `recording:{mbid}` | `recording:abc-123...` | 30 days |
| `artist:` | `artist:{mbid}` | `artist:def-456...` | 30 days |
| `release-group:` | `release-group:{mbid}` | `release-group:ghi-789...` | 30 days |
| `resolve:` | `resolve:{artist}::{title}` | `resolve:beatles::help` | 30 days (hit), 1 hour (miss) |
| `commons:` | `commons:{filename}` | `commons:The_Beatles.jpg` | 30 days |
| `rehost:` | `rehost:{sha256(url)}` | `rehost:a3f2...` | 1 year |
| `search:artist:` | `search:artist:{query}` | `search:artist:beatles` | 24 hours |
| `spotify-artist:` | `spotify-artist:{id}` | `spotify-artist:3WrFJ7ztbogyGnTHbHJFl2` | 30 days (hit), 1 hour (miss) |

## Frontend Integration

The frontend automatically rehosts external images via `apps/web/src/lib/image-cache.ts`:
- Artist background images (Wikipedia/Wikimedia Commons)
- Album cover art (coverartarchive.org)
- Any external image URLs

**Flow:**
1. Page loads with external URL
2. `image-cache.ts` detects external URL → calls `/rehost/image`
3. Worker checks KV cache → returns cached CID or uploads to Filebase
4. Frontend displays IPFS URL (no more 429 errors!)
5. Subsequent loads use cached IPFS URL immediately

All external URLs are automatically rehosted to IPFS with global dedupe across all users.

## Rate Limiting

- **MusicBrainz**: 1 req/sec per isolate (enforced in code)
- **External image fetches**: 15s timeout per image
- **Batch size**: Max 50 URLs per `/rehost/image` request

## Error Handling

- **429 from external source**: Returns error in result, does not cache
- **Network timeout**: Returns error, graceful fallback to original URL
- **Invalid image**: Returns error with details
- **Missing FILEBASE_API_KEY**: Returns 500 with clear error message

## Cost Estimate

- **Cloudflare Workers**: Free tier (100k requests/day)
- **Cloudflare KV**: $0.50/million reads, $5/million writes
- **Filebase**: ~$5/month storage for ~10k cached images
- **Total**: ~$10/month for moderate usage
