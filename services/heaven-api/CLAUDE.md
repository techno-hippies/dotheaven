# Heaven API Worker

Cloudflare Worker providing the Heaven Names Registry API, claim/matching endpoints, scrobble submission, and photo pipeline.

## Claim Flow

Claim logic: `src/routes/claim.ts`. Frontend: `apps/frontend/src/pages/ClaimPage.tsx`.

- `POST /api/claim/start` — protected by `CLAIM_START_SECRET`. Creates claim token + verification code.
- `POST /api/claim/verify-dm` — validates DM verification code (enforces `method = 'dm'`).
- `POST /api/claim/complete` — requires signed claimant payload (`claimId`, `address`, `signature`, `timestamp`, `nonce`). Atomic DB updates via `DB.batch(...)`.
- Bio-edit verification is still a stub (always succeeds); DM code flow is the tested path.

## Deployment

```bash
# Create D1 database (one-time)
wrangler d1 create heaven-api

# Run schema migration
wrangler d1 execute heaven-api --remote --file=./schema.sql

# Set secrets
wrangler secret put DNS_SHARED_SECRET
wrangler secret put FILEBASE_ACCESS_KEY
wrangler secret put FILEBASE_SECRET_KEY
wrangler secret put FILEBASE_BUCKET
wrangler secret put FAL_KEY
wrangler secret put WATERMARK_SECRET

# Create R2 buckets (one-time)
wrangler r2 bucket create heaven-raw
wrangler r2 bucket create heaven-orig
wrangler r2 bucket create heaven-anime
wrangler r2 bucket create heaven-reveal
wrangler r2 bucket create heaven-wm

# Run photo schema migration
wrangler d1 execute heaven-api --remote --file=./migrations/0001_photos.sql

# Run EAS scrobble migration
wrangler d1 execute heaven-api --remote --file=./migrations/0002_scrobble_eas.sql

# Set relay wallet private key for EAS attestations
wrangler secret put BASE_SEPOLIA_RELAY_PK

# Meal tracking secrets
wrangler secret put FILEBASE_FOOD_ACCESS_KEY
wrangler secret put FILEBASE_FOOD_SECRET_KEY
wrangler secret put FILEBASE_FOOD_BUCKET
wrangler secret put OPENROUTER_API_KEY

# Run meal photos migration
wrangler d1 execute heaven-api --remote --file=./migrations/0003_meal_photos.sql

# Deploy
npx wrangler deploy
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ENVIRONMENT` | No | `development` or `production` (affects auth gating) |
| `DNS_SHARED_SECRET` | Yes* | Shared secret for DNS resolver auth (*required in production) |
| `FILEBASE_ACCESS_KEY` | Yes* | Filebase S3 access key (*required for scrobbles) |
| `FILEBASE_SECRET_KEY` | Yes* | Filebase S3 secret key (*required for scrobbles) |
| `FILEBASE_BUCKET` | Yes* | Filebase bucket name (*required for scrobbles) |
| `FAL_KEY` | Yes* | fal.ai API key (*required for photo anime generation) |
| `WATERMARK_SECRET` | Yes* | HMAC secret for watermark fingerprints (*required for photo reveal) |
| `BASE_SEPOLIA_RELAY_PK` | Yes* | Private key for EAS attestation relay (*required for on-chain scrobbles) |
| `FILEBASE_FOOD_ACCESS_KEY` | Yes* | Filebase S3 access key for food bucket (*required for meal tracking) |
| `FILEBASE_FOOD_SECRET_KEY` | Yes* | Filebase S3 secret key for food bucket (*required for meal tracking) |
| `FILEBASE_FOOD_BUCKET` | Yes* | Filebase bucket name for food photos (e.g., `heaven-food`) |
| `OPENROUTER_API_KEY` | Yes* | OpenRouter API key for AI food analysis - uses `bytedance-seed/seed-1.6-flash` (*required for meal tracking) |

## Heaven Names Registry API

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/names/available/:label` | GET | Check if a .heaven name is available |
| `/api/names/reverse/:pkp` | GET | Lookup name by PKP address |
| `/api/names/:label` | GET | Get name details |
| `/api/names/register` | POST | Register a new .heaven name |
| `/api/names/renew` | POST | Renew an existing name |
| `/api/names/update` | POST | Update profile CID for a name |

### DNS Resolution Endpoint (Protected)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/names/dns/resolve` | GET | Bearer token | DNS resolution for .heaven names |

**Auth requirement**: The `/dns/resolve` endpoint requires a `Authorization: Bearer <token>` header where `<token>` matches the `DNS_SHARED_SECRET` secret.

In development (`ENVIRONMENT=development`), auth is skipped for local testing.

**Query parameters**:
- `label` - The name to resolve (e.g., `alice`)
- `tld` - The TLD (must be `heaven`)

**Response**:
```json
{
  "tld": "heaven",
  "label": "alice",
  "status": "active" | "expired" | "unregistered" | "reserved",
  "records": {
    "A": ["144.126.205.242"],
    "TXT": ["profile_cid=bafyabc..."],
    "AAAA": []
  },
  "ttl_positive": 300,
  "ttl_negative": 60
}
```

## Registration Flow

1. Client generates nonce locally (`crypto.getRandomValues`)
2. Client builds canonical message with `heaven-registry:v1` prefix
3. Client signs with PKP using EIP-191 personal_sign
4. Client POSTs to `/api/names/register` with signature

**Signature message format**:
```
heaven-registry:v1
action=register
tld=heaven
label=<label>
pkp=<pkp_address>
nonce=<random_hex>
issued_at=<unix_timestamp>
expires_at=<timestamp+120>
profile_cid=<optional_cid>
```

## D1 Schema

Key tables for names registry:

- `heaven_names` - Label to PKP ownership mapping
- `heaven_reserved` - Policy-reserved names (premium, profanity, trademark)
- `heaven_nonces` - Anti-replay nonces for signatures

See `schema.sql` for full schema.

### Additional Route Modules

| Prefix | Source | Description |
|--------|--------|-------------|
| `/api/candidates` | `src/routes/candidates.ts` | Candidate profiles for swiping |
| `/api/likes` | `src/routes/likes.ts` | Likes + match detection |
| `/api/self` | `src/routes/self.ts` | Self.xyz verification endpoints |
| `/api/sleep` | `src/routes/sleep.ts` | Sleep tracking |
| `/api/wallet` | `src/routes/wallet.ts` | Wallet endpoints |

### Additional Migrations

| File | Description |
|------|-------------|
| `migrations/0004_ipfs_cids.sql` | IPFS CID storage |
| `migrations/0005_self_verifications.sql` | Self.xyz verification records |
| `migrations/0006_scrobble_track_events.sql` | Scrobble track events |
| `migrations/0007_wallet_rate_limits.sql` | Wallet rate limiting |

## Scrobble API

### POST /api/scrobble/submit

Submit a batch of music scrobbles to be pinned to IPFS.

**Auth:** In development, use `X-User-Pkp` header. In production, use `Authorization: Bearer <jwt>`.

**Request:**
```json
{
  "tracks": [
    {
      "artist": "Radiohead",
      "title": "Karma Police",
      "album": "OK Computer",
      "duration": 263,
      "playedAt": 1737200167,
      "source": "spotify"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "cid": "QmXyz...",
  "count": 25,
  "startTs": 1737200000,
  "endTs": 1737203600
}
```

**Flow:**
1. Validate tracks (artist, title, playedAt required)
2. Pin batch JSON to Filebase IPFS
3. Store batch metadata in D1 `scrobble_batches` table
4. Create EAS attestation on Base Sepolia (ScrobbleBatchV1 schema)
5. Return CID + attestation UID for client

**On-chain attestation:**
- Uses EAS predeploy at `0x4200000000000000000000000000000000000021`
- Schema UID: `0x6a31b6c6ed2c423297bd53d6df387d04cf69cecb961eb57f1dfc44ba374d95f0`
- Relay wallet pays gas (set via `BASE_SEPOLIA_RELAY_PK` secret)
- Attestation data: `(uint64 startTs, uint64 endTs, uint32 count, string cid)`
- Recipient: user's PKP address

### GET /api/scrobble/batches

Get user's scrobble batch history.

**Auth:** Same as /submit

**Response:**
```json
{
  "batches": [
    {
      "cid": "QmXyz...",
      "count": 25,
      "startTs": 1737200000,
      "endTs": 1737203600,
      "createdAt": 1737200500
    }
  ]
}
```

## Meal Tracking API

Upload meal photos → AI analysis → IPFS pin → EAS attestation.

### POST /api/meal/analyze

Upload a meal photo for AI-powered nutritional analysis.

**Auth:** In development, use `X-User-Pkp` header. In production, use `Authorization: Bearer <jwt>`.

**Request:** multipart/form-data with:
- `photo` - Meal photo (JPEG/PNG/WebP, max 10MB)
- `capturedAt` - Unix timestamp when photo was taken (optional, defaults to now)

**Response:**
```json
{
  "success": true,
  "photoCid": "QmXyz...",
  "analysisCid": "QmAbc...",
  "description": "Burger with fries and Coke",
  "items": [
    {"name": "Cheeseburger", "calories": 540, "protein_g": 28, "carbs_g": 45, "fat_g": 28},
    {"name": "French fries (medium)", "calories": 320, "protein_g": 4, "carbs_g": 42, "fat_g": 16},
    {"name": "Coca-Cola (can)", "calories": 140, "protein_g": 0, "carbs_g": 39, "fat_g": 0}
  ],
  "totals": {"calories": 1000, "protein_g": 32, "carbs_g": 126, "fat_g": 44},
  "attestationUid": "0x...",
  "txHash": "0x..."
}
```

**Flow:**
1. Validate image (type, size)
2. Pin photo to Filebase IPFS (heaven-food bucket)
3. Call OpenRouter with glm-4v-flash for AI analysis
4. Pin analysis JSON to IPFS
5. Create EAS attestation (MealPhotoV1 schema)
6. Store in D1 `meal_photos` table
7. Return CIDs + analysis + attestation

### POST /api/meal/anime

Convert an already-uploaded meal photo to anime style via fal.ai FLUX.2 edit.

**Auth:** In development, use `X-User-Pkp` header. In production, use `Authorization: Bearer <jwt>`.

**Request:** JSON body:
```json
{
  "photoCid": "QmXyz..."
}
```

**Response:**
```json
{
  "success": true,
  "animeCid": "QmAbc..."
}
```

**Flow:**
1. Fetch photo from IPFS gateway (`ipfs.filebase.io`)
2. Convert to base64 data URI
3. Call fal.ai FLUX.2 edit with Ghibli-style prompt (guidance_scale: 7.0)
4. Download result, pin to Filebase IPFS
5. Return anime CID

**Notes:**
- Prompt is generic ("Convert this photo to anime in the style of Studio Ghibli. Maintain all details, composition, and colors faithfully.") to avoid hallucinating food items
- Takes ~4-5s via fal.ai FLUX.2 edit (much faster than SeedDream's ~35s for avatar grids)
- Called in background after user posts meal (not blocking UX)

### GET /api/meal/history

Get user's meal history.

**Auth:** Same as /analyze

**Response:**
```json
{
  "meals": [
    {
      "photoCid": "QmXyz...",
      "analysisCid": "QmAbc...",
      "description": "Burger with fries and Coke",
      "calories": 1000,
      "protein": 32,
      "carbs": 126,
      "fat": 44,
      "capturedAt": 1737200000,
      "attestationUid": "0x..."
    }
  ]
}
```

## Photo Pipeline API

Upload 4 photos → sanitize (strip EXIF) → generate anime via fal.ai → split into tiles → serve.

**IMPORTANT**: For local development, use `wrangler dev --remote` to test the full pipeline.
The local Images binding only supports basic transforms (width/height/rotate/format).
Features like `trim` and `draw` require remote mode.

### POST /api/photos/pipeline

Upload 4 photos and generate anime tiles. Single step from user's perspective.

**Auth:** In development, use `X-User-Pkp` header. In production, use `Authorization: Bearer <jwt>`.

**Request:** multipart/form-data with:
- `photo1` - First photo (JPEG/PNG/WebP, max 10MB)
- `photo2` - Second photo
- `photo3` - Third photo
- `photo4` - Fourth photo

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "photoIds": ["uuid1", "uuid2", "uuid3", "uuid4"],
  "animeTiles": [
    "/api/photos/anime/{userId}/1",
    "/api/photos/anime/{userId}/2",
    "/api/photos/anime/{userId}/3",
    "/api/photos/anime/{userId}/4"
  ]
}
```

**Flow:**
1. Validate 4 images (type, size)
2. Sanitize: strip EXIF metadata, cap dimensions to 4096px
3. Store originals in R2_ORIG
4. Create ephemeral signed URLs for fal.ai
5. Call fal nano-banana-pro/edit with 4 images → get 2048×2048 grid
6. Split grid into 4 quadrants using Cloudflare Images `trim`
7. Resize each to 500×500, store in R2_ANIME
8. Return anime tile URLs + photo IDs (for later reveal)

### GET /api/photos/pipeline/:jobId

Check status of a photo pipeline job (if async).

**Response:**
```json
{
  "jobId": "uuid",
  "status": "pending" | "processing" | "completed" | "failed",
  "step": "upload" | "fal" | "split" | "done",
  "photoIds": ["..."],
  "animeTiles": ["..."],
  "error": "..."
}
```

### GET /api/photos/anime/:userId/:slot

Serve anime tile (public, cached 1 day).

- `userId` - PKP address
- `slot` - 1-4

Returns WebP image.

### GET /api/photos/reveal/:photoId

Serve real photo with per-viewer wallet watermark (match-only).

**Auth:** Required. Only viewers with a `photo_access` record can access.

**Flow:**
1. Verify viewer has access (mutual match created access record)
2. If cached variant exists in R2_REVEAL, return it
3. Else: load original, resize to 500×500, apply tiled watermark, cache, return

Returns watermarked WebP image.

### POST /api/photos/access (dev only)

Create photo access records on match. Used by matching system.

**Request:**
```json
{
  "matchId": "...",
  "ownerUserId": "0x...",
  "viewerUserId": "0x...",
  "viewerWallet": "0x..."
}
```

Creates access records for all owner's photos with fingerprint codes.

## R2 Buckets

| Bucket | Purpose |
|--------|---------|
| `heaven-raw` | Temporary upload storage (optional) |
| `heaven-orig` | Sanitized originals (EXIF stripped) |
| `heaven-anime` | Anime grid + 500×500 tiles |
| `heaven-reveal` | Per-viewer watermarked variants (cached) |
| `heaven-wm` | Per-viewer watermark tiles (PNG) |

## Photo D1 Tables

- `user_photos` - Original photos metadata (photo_id, user_id, slot, orig_key)
- `anime_assets` - Generated anime assets (user_id, grid_key, tile1-4_keys)
- `photo_access` - Per-viewer reveal permissions (created on match)
- `photo_source_tokens` - Ephemeral signed URLs for fal.ai
- `photo_jobs` - Async job tracking

See `migrations/0001_photos.sql` for full schema.

## Status Notes

### Not Yet Done
- Production auth for reveal endpoint (currently dev-only with `X-User-Pkp`)
- Bio-edit claim verification (stub — always succeeds)

### Test Commands
```bash
# Deploy
npx wrangler deploy

# Test photo reveal with watermark
API_BASE=https://heaven-api.deletion-backup782.workers.dev
OWNER_USER_ID="0x1234567890abcdef1234567890abcdef12345678"
VIEWER_WALLET="0xDeaDbeeF1234567890AbCdEf1234567890aBcDeF"

# Create access record
curl -X POST "$API_BASE/api/photos/access" \
  -H "Content-Type: application/json" \
  -d '{"matchId":"test","ownerUserId":"'"$OWNER_USER_ID"'","viewerUserId":"0xtest","viewerWallet":"'"$VIEWER_WALLET"'"}'

# Fetch revealed photo
curl "$API_BASE/api/photos/reveal/<photoId>" -H "X-User-Pkp: 0xtest" -o revealed.webp
```
