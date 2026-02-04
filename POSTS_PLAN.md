# Posts, Feed & Matchmaking — Implementation Plan

## Product Thesis

**Anime as a privacy layer.** In a deepfake/AI world, users want to share their lives without exposing their real faces. AI-generated anime versions protect identity while enabling social expression. The public feed enforces **no realistic faces** — all photo posts go through anime conversion (or filter selection in the Studio), creating a distinctive visual identity and privacy-first culture.

**Real photos are for matchmaking, not feeds.** Original photos are never shown in the public feed. Instead, they're revealed through the matchmaking system: when two users mutually like each other, they get a single-view reveal (not 24h window). These revealed photos live in a private section of each profile, separate from the public feed.

**Music taste drives connections.** Scrobble history powers the matching algorithm, suggesting users with compatible music tastes for karaoke duets. AI initiates conversations in XMTP group chats, and users can book karaoke sessions with payment escrow.

**Artist fan clubs reward engagement.** Scrobble counts gate access to per-artist groups (e.g., 100 Kanye scrobbles = Kanye fan club). These are social spaces for superfans.

---

## Core Pillars

### 1. Feed (Anime-Only)

| Aspect | Design |
|--------|--------|
| **Real faces** | ❌ Never in feed — all photos anime-converted or filtered |
| **Reveals** | ❌ Not in feed — moved to matchmaking/DMs |
| **Anti-spam** | Self.xyz verification OR proof-of-work (scrobbles, activity) to post |
| **Post Studio** | Users choose filters/styles before posting (not auto-default) |
| **Content types** | Text, anime photos, song shares, memes |

### 2. Matchmaking (Where Reveals Happen)

| Aspect | Design |
|--------|--------|
| **Matching criteria** | Profile data + scrobble history (music taste compatibility) |
| **Reveal trigger** | Mutual like → single-view reveal (not 24h window) |
| **Photo storage** | Revealed photos stored in private profile section (not feed) |
| **Payment flow** | Pay-to-reveal happens in DMs, not in feed |
| **Watermarking** | Still applies — accountability for leaks |

### 3. Karaoke Matchmaking

| Aspect | Design |
|--------|--------|
| **AI matchmaker** | Suggests compatible users via XMTP group chat |
| **Conversation starter** | AI messages both users: "You both love [artist], want to karaoke?" |
| **Booking** | Either user can book the other at available times |
| **Payment** | Deposit for karaoke room (escrow), typically initiator pays |
| **Availability** | Users set their karaoke availability in profile |

### 4. Artist Fan Clubs (Groups)

| Aspect | Design |
|--------|--------|
| **Gating** | Scrobble threshold per artist (e.g., 100 plays = entry) |
| **Membership** | Automatic based on on-chain scrobble history |
| **Content** | Group chat, shared playlists, fan discussions |
| **Per-artist** | Each artist has their own club (Kanye fans, Taylor fans, etc.) |
| **Architecture** | TBD — XMTP group chats? On-chain membership NFTs? |

---

## Content Strategy

### Content Types (Feed)

| Type | Visibility | Gating | Notes |
|------|-----------|--------|-------|
| **Text post** | Everyone | Self.xyz OR activity proof | No faces |
| **Photo post** | Anime/filtered only | Self.xyz OR activity proof | No real faces in feed |
| **Song post** | Preview clip | None | Links to full audio |
| **Shared content** | Same as original | Attribution required | Memes, reposts |

### Post Studio Flow

Users don't just upload → auto-anime. They get a **Studio experience**:

1. Upload photo
2. Safety check (reject illegal content)
3. **Choose filter/style**: Anime, illustration, watercolor, sketch, etc.
4. Preview result
5. Post to feed

This gives users creative control instead of forcing a single anime style.

### Photo Access Model (Revised)

**Feed photos**: Always converted/filtered. No reveal option in feed.

**Profile photos (matchmaking)**:
- Public: Anime/converted avatar + photos
- Private: Original photos revealed only via mutual match

| Context | What's shown | Reveal mechanism |
|---------|-------------|------------------|
| Feed | Anime only | ❌ No reveals |
| Profile (public) | Anime avatar + converted photos | ❌ No reveals |
| Profile (private) | Original photos | Mutual match → single view |
| DMs | Can share additional reveals | Pay-to-reveal with watermark |

### Photo Protection Stack

Still applies for matchmaking/DM reveals:

| Layer | Purpose |
|-------|---------|
| **Self.xyz identity** | One human = one account |
| **Single-view reveals** | No 24h window — see once, gone |
| **Multi-layer watermark** | Accountability for leaks |
| **Nullifier bans** | Permanent ban for leakers |
| **Screenshot protection** | FLAG_SECURE (Android), capture detection (iOS) |

### Proof of Work for Posting

To prevent bot spam, posting requires EITHER:

1. **Self.xyz verification** — Verified human identity
2. **Activity proof** — Minimum scrobble count, profile completeness, account age

This ensures the feed has real users, not fake accounts.

---

## Architecture Overview

| Layer | Chain / Service | Purpose |
|---|---|---|
| **Content/IP** | Story Protocol (mainnet, chain 1514) | Original content registered as IP Assets. Licensing, disputes, derivatives, royalties. |
| **Social/Identity** | MegaETH (chain 6343) | Posts, profiles, names, scrobbles, playlists, likes, comments, matches, reveals. |
| **Messaging** | XMTP | DMs, group chats (AI matchmaker conversations, artist fan clubs). |
| **Storage** | Filebase IPFS | Public content (filtered photos, covers, metadata). Encrypted originals (Lit-gated). |
| **Compute** | Lit Protocol | AI filters, face detection, Filebase uploads, tx signing, photo reveals. |
| **AI/ML** | OpenRouter + fal.ai | Safety checks, matchmaking suggestions, image transformation. |

### Key Systems

| System | Purpose | Key Components |
|--------|---------|----------------|
| **Feed** | Anime-only social posts | PostsV1, Post Studio, engagement |
| **Matchmaking** | Music-based connections | Scrobble analysis, profile matching, reveals |
| **Karaoke Booking** | Session scheduling | Availability, payments, escrow |
| **Artist Fan Clubs** | Scrobble-gated communities | XMTP groups, membership NFTs |

### Key Identifier Architecture

| ID | Where | Purpose |
|---|---|---|
| `postIdBytes32` | MegaETH (PostsV1, EngagementV2) | Universal social key — all posts, all engagement |
| `matchId` | MegaETH (MatchingV1) | Mutual match record (two users) |
| `groupId` | XMTP | Artist fan club chat identifier |
| `storyIpId` | Story Protocol | IP provenance — only for original content |
| `contentIdBytes32` | Subgraph (computed) | Content clustering — same for identical images |

---

## Content Flow

### Photo Post (Studio Flow)

User experience: **Choose your style, not forced auto-conversion.**

```
User opens Post Studio:
  1. Upload photo(s)
  2. Client resizes to max 2048px JPEG 90%
  3. Safety check (Gemini 3 Flash):
     - Reject illegal content (CSAM, gore, violence, PII)
     - Returns { safe, hasFace, isAnime, isAdult }
  4. If hasFace=true: REQUIRE filter selection (no real faces allowed)
     If hasFace=false: filter optional
  5. User chooses filter style:
     - Anime (Klein 9B)
     - Watercolor
     - Sketch
     - Illustration
     - Ghibli
     - Custom (future: model marketplace)
  6. Preview result, adjust if needed
  7. Post to feed

Technical flow (post-studio-v1.js):
  → Validate + sign binding message
  → Apply selected filter via fal.ai
  → Strip EXIF metadata
  → Upload filtered result to Filebase (public)
  → Encrypt original if face detected (for matchmaking reveals)
  → Emit PostCreated event on MegaETH
  → Optional: Register on Story Protocol (if ownership="mine")
```

**Key change**: Users see preview and choose filters. No surprise auto-conversion.

### Song Post

```
Existing song-publish-v1.js pipeline:
  → Upload audio/preview/cover/metadata to Filebase
  → Lyrics alignment (ElevenLabs) + translation (OpenRouter)
  → Story IP registration with PIL Commercial Remix terms (default ON)
```

### Text Post

```
Text stored in event data (no CID needed for short text).
Registered as IP Asset on Story Protocol.
No face detection.
```

---

## Matchmaking System

### Overview

Reveals happen through **matchmaking**, not the feed. Music taste (scrobbles) drives compatibility scoring.

### Matching Flow

```
1. User browses Suggested Matches (profiles with compatibility scores)
   - Score based on: scrobble overlap, profile criteria, activity
   - Shows: anime avatar, name, top artists, compatibility %

2. User "likes" a match
   - Recorded on-chain: MatchingV1.like(targetAddress)
   - Target notified (push notification / XMTP message)

3. If mutual like → Match created
   - MatchingV1.createMatch(user1, user2) emits Match event
   - Both users get single-view reveal access to each other's original photos
   - Revealed photos stored in private profile section (not feed)

4. Single-view reveal (not 24h window)
   - One view per photo, then gone (screenshot protection active)
   - Watermarked for accountability
   - Stored in "Matches" tab on profile (only visible to matched users)
```

### Compatibility Scoring

```
Base score = scrobble_overlap_score(user1, user2)

Factors:
- Shared artists (weighted by play count)
- Similar genres/tags
- Listening time overlap (same songs, same artists)
- Profile criteria match (location, language, interests)

Algorithm runs off-chain (or in Lit Action), queries subgraph for scrobbles.
```

### Photo Reveal (Matchmaking Context)

**Key change**: Reveals are triggered by mutual match, not payment.

```
Mutual match achieved:
  → Both users granted single-view access to each other's original photos
  → Lit Action: match-reveal-v1.js:
    1. Verify mutual match on-chain (MatchingV1.isMatched(user1, user2))
    2. Check viewer hasn't already viewed (revealViewed[matchId][viewer])
    3. Decrypt original photo inside Lit enclave
    4. Apply watermark (accountability)
    5. Mark as viewed: revealViewed[matchId][viewer] = true
    6. Return watermarked image (single view, then expires)

Properties:
- Single view: see once, then gone
- Watermarked: accountability for leaks
- Mutual consent: both users must like each other
- No payment: matching is free, reveals are free (charity model removed)
```

### DM Reveals (Pay-to-Reveal)

In DMs, users can share additional photos with pay-to-reveal:

```
User A sends photo to User B in DM:
  → Photo encrypted, stored on IPFS
  → User A sets price (or free for matched users)
  → User B pays to reveal (EngagementV2.payReveal in DM context)
  → Same watermarking + accountability as before
  → 24h viewing window (consistent with existing system)
```

---

## Karaoke Matchmaking

### Overview

AI matchmaker suggests compatible users for karaoke sessions via XMTP group chat.

### Flow

```
1. AI identifies compatible pair:
   - High scrobble overlap
   - Both have karaoke availability set
   - Similar music preferences

2. AI creates XMTP group chat with both users:
   - AI introduces: "You both love [Artist]! Want to karaoke together?"
   - AI suggests songs based on shared scrobbles

3. Either user can propose a booking:
   - Select available time slot (from other user's availability)
   - Deposit payment for karaoke room (escrow)

4. Other user accepts or declines:
   - Accept: booking confirmed, both calendars updated
   - Decline: deposit refunded, AI may suggest alternative times

5. Session happens:
   - Link to karaoke room provided at scheduled time
   - Payment released from escrow to venue
```

### Booking Contract (KaraokeV1)

```solidity
contract KaraokeV1 {
    struct Booking {
        address initiator;
        address invitee;
        uint64 startTime;
        uint64 endTime;
        uint256 depositWei;
        BookingStatus status;
    }

    enum BookingStatus { Proposed, Accepted, Completed, Cancelled }

    // Initiator creates booking with deposit
    function proposeBooking(address invitee, uint64 startTime, uint64 endTime)
        external payable;

    // Invitee accepts → deposit held
    function acceptBooking(uint256 bookingId) external;

    // After session: release to venue
    function completeBooking(uint256 bookingId) external onlyVenue;

    // Cancel: refund initiator
    function cancelBooking(uint256 bookingId) external;
}
```

### Availability

Users set availability in profile:

```typescript
interface KaraokeAvailability {
  timezone: string;
  slots: {
    dayOfWeek: 0-6;
    startHour: number;
    endHour: number;
  }[];
}
```

---

## Artist Fan Clubs (Groups)

### Overview

Scrobble-gated communities for superfans of specific artists.

### Membership Criteria

```
Join Kanye fan club: 100+ Kanye scrobbles (on-chain verified)
Join Taylor fan club: 100+ Taylor Swift scrobbles
...etc

Threshold configurable per artist (popular artists = higher threshold).
```

### Implementation Options

**Option A: XMTP Group Chats**
- One XMTP group per artist
- Membership gated by subgraph query (scrobble count)
- Pros: Real-time chat, existing infrastructure
- Cons: No on-chain membership proof

**Option B: Membership NFTs**
- Mint membership NFT when threshold reached
- NFT gates access to group chat
- Pros: On-chain proof, tradeable/transferable membership
- Cons: Extra complexity, gas costs

**Option C: Hybrid**
- XMTP groups for chat
- On-chain membership registry (no NFT, just mapping)
- Membership verified at group join time
- Pros: Simple, gas-efficient, real-time

**Recommended: Option C (Hybrid)**

### Fan Club Features

| Feature | Description |
|---------|-------------|
| **Group chat** | XMTP-based, all verified fans |
| **Shared playlists** | Collaborative playlists for the artist |
| **Exclusive content** | Artist drops, early access (future) |
| **Fan rankings** | Leaderboard by scrobble count |
| **Events** | Group karaoke sessions, listening parties |

### Contract (ArtistClubV1)

```solidity
contract ArtistClubV1 {
    // artistId = keccak256(abi.encode(artistName))
    mapping(bytes32 => uint256) public membershipThreshold;
    mapping(bytes32 => mapping(address => bool)) public isMember;

    event MemberJoined(bytes32 indexed artistId, address indexed member, uint256 scrobbleCount);
    event MemberLeft(bytes32 indexed artistId, address indexed member);

    // Join club (verified via scrobble count from subgraph)
    function joinClub(bytes32 artistId, uint256 scrobbleCount, bytes calldata proof)
        external;

    // Leave club
    function leaveClub(bytes32 artistId) external;

    // Admin: set threshold for artist
    function setThreshold(bytes32 artistId, uint256 threshold) external onlyAdmin;
}
```

### Proof of Scrobbles

Membership requires proving scrobble count. Options:

1. **Subgraph query + signature**: Backend queries subgraph, signs attestation, user submits on-chain
2. **Lit Action verification**: Lit Action queries subgraph, signs if threshold met
3. **Periodic snapshots**: Backend takes snapshots, publishes merkle root, users prove inclusion

**Recommended: Option 2 (Lit Action)**
- Decentralized verification
- No backend dependency
- Real-time (not snapshot-based)

---

### Video Post (Future)

```
Same face detection gate as photos.
Short-form vertical (9:16, 10-60s) — small enough to pin in full.
Longer videos: preview + thumbnail pinned, full video BYOS or gated.
```

---

## AI Model System

### V1: Klein 9B (Fits 30s Lit Action Timeout)

| Model | Endpoint | Speed | Cost |
|---|---|---|---|
| Flux 2 Klein 9B | `fal-ai/flux-2/klein/9b/edit` | ~4s | $0.009/MP |

### V2: Slower Models (Two-Action Split Pattern)

| Model | Endpoint | Speed | Notes |
|---|---|---|---|
| SeedDream v4.5 | `fal-ai/bytedance/seedream/v4.5/edit` | 35-50s | Exceeds 30s timeout |
| Nano Banana Pro | `fal-ai/nano-banana-pro/edit` | 35-50s | Exceeds 30s timeout |

Slower models require a submit + finalize two-action pattern:
1. `post-submit-v1.js`: Upload source, submit to fal queue, return requestId
2. Frontend polls fal status (or webhook)
3. `post-finalize-v1.js`: Download result, upload to Filebase, register on Story

### Model Registry

On-chain model registry on Story (or MegaETH) for extensibility:

```solidity
struct Model {
    bytes32 falEndpoint;
    uint128 price;
    bool active;
    bool asyncRequired; // true for models exceeding 30s
}
mapping(bytes16 => Model) public models;
```

Users pay a set price per model. Pre-deposit balance system:

```solidity
mapping(address => uint256) public balance;

function depositFor(address user) external payable;
function createPostFor(...) external onlySponsor {
    require(balance[author] >= models[modelId].price);
    balance[author] -= models[modelId].price;
    // ...
}
```

---

## Story Protocol Integration

### Why Originals Register on Story (Conditional Registration)

**Not all posts go on Story** — only those where user explicitly claims ownership:

| Ownership | Story Registration | Rationale |
|-----------|-------------------|-----------|
| `"mine"` | ✅ Yes | Creator wants IP protection, licensing, royalties |
| `"not-mine"` | ❌ No | Shared content — no IP claim, attribution only |
| Missing/null | ❌ No | Conservative default — unknown ownership |

**Why Story for originals:**
- Gas cost: ~0.009 gwei on mainnet. 1.5M gas registration = ~$0.00004 per post.
- Built-in disputes (UMA arbitration), licensing (PIL), derivative tracking, royalty rails.
- Creates accountability: claiming "mine" = legal assertion of ownership.

### Registration Flow

Original posts = `mintAndRegisterIpAndAttachPILTerms()` on Story mainnet:
- Mints SPG NFT to user
- Registers as IP Asset (gets `storyIpId`)
- Attaches PIL license terms (if enabled)

Shared posts skip Story entirely — only indexed on MegaETH via PostsV1.

### Licensing (User Choice)

- **Songs**: PIL Commercial Remix terms by default (derivatives allowed, rev share enforced).
- **Images/Videos**: Optional. User toggles "License this post" at post time.
  - If enabled: set `commercialRevShare` (user chooses %).
  - If disabled: registered as IP Asset but with no commercial license.
- **Text posts**: No licensing by default.

Retroactive licensing supported: user can register on Story after the fact via `linkStoryIp`.

### Remix / Derivative Chain

When remixing a licensed post:
- Frontend shows: "This post is licensed. Your remix shares X% revenue with the original creator."
- Lit Action registers derivative on Story with parent `ipId` link.
- Royalties enforced automatically by Story's royalty module.

For unlicensed posts: `parentPostId`-style attribution only (social credit, no on-chain royalties).

### Disputes

Story's Dispute Module handles all content disputes:
- `IMPROPER_REGISTRATION` — duplicate/stolen IP
- `CONTENT_STANDARDS_VIOLATION` — no-hate, no-porn, etc.
- `IMPROPER_USAGE` — license term violations

Tagged IP Assets can't mint licenses, can't claim royalties, tag cascades to derivatives.
Frontend checks dispute status via subgraph and hides/flags tagged content.

---

## Social Engagement (MegaETH)

### Universal Content Key: `postIdBytes32`

**All social actions target `postIdBytes32`** — the universal post identifier on MegaETH.
Story `ipId` is an optional provenance field, NOT the engagement key.

This ensures shared content (which has no Story ipId) can still receive likes/comments/reveals.

### EngagementV2 Contract (replaces V1)

Deployed on MegaETH for fast social interactions (10ms blocks).
Includes integrated reveal payment router.

```solidity
contract EngagementV2 {
    address public immutable charityWallet;
    uint256 public constant MIN_REVEAL_PRICE = 0.0001 ether;  // global floor

    // ── Reveal Pricing (sponsor-set per post) ────────────────────
    mapping(bytes32 => uint256) public revealPriceWei;

    event RevealPriceSet(bytes32 indexed postId, uint256 priceWei);

    function setRevealPriceFor(bytes32 postId, uint256 priceWei)
        external onlySponsor
    {
        require(revealPriceWei[postId] == 0, "PRICE_ALREADY_SET");  // immutable after first set
        require(priceWei >= MIN_REVEAL_PRICE, "BELOW_MINIMUM");
        revealPriceWei[postId] = priceWei;
        emit RevealPriceSet(postId, priceWei);
    }

    // ── Reveal Payments (permissionless) ─────────────────────────
    mapping(bytes32 => mapping(address => uint64)) public revealPaidAt;
    mapping(bytes32 => mapping(address => uint32)) public revealNonce;

    event RevealPaid(bytes32 indexed postId, address indexed viewer,
                     uint256 amount, uint64 paidAt, uint32 nonce);

    function payReveal(bytes32 postId) external payable nonReentrant {
        uint256 price = revealPriceWei[postId];
        if (price == 0) price = MIN_REVEAL_PRICE;  // fallback to global floor
        require(msg.value >= price, "INSUFFICIENT_PAYMENT");

        // Forward funds to charity (state updated before external call)
        revealPaidAt[postId][msg.sender] = uint64(block.timestamp);
        revealNonce[postId][msg.sender]++;

        (bool ok,) = charityWallet.call{value: msg.value}("");
        require(ok, "TRANSFER_FAILED");

        emit RevealPaid(postId, msg.sender, msg.value,
                        uint64(block.timestamp), revealNonce[postId][msg.sender]);
    }

    // ── Likes (sponsor-gated) ────────────────────────────────────
    mapping(bytes32 => mapping(address => bool)) public liked;
    mapping(bytes32 => uint256) public likeCount;

    event Liked(bytes32 indexed postId, address indexed liker);
    event Unliked(bytes32 indexed postId, address indexed unliker);

    function likeFor(address liker, bytes32 postId) external onlySponsor;
    function unlikeFor(address liker, bytes32 postId) external onlySponsor;

    // ── Comments (sponsor-gated, text in events only) ────────────
    mapping(bytes32 => uint256) public commentCount;

    event CommentAdded(bytes32 indexed postId, address indexed author,
                       uint256 commentId, string text);

    function commentFor(address author, bytes32 postId, string calldata text)
        external onlySponsor;

    // ── Translations (sponsor-gated) ─────────────────────────────
    event TranslationAdded(bytes32 indexed postId, address indexed translator,
                           bytes2 langCode, string text);

    function translateFor(address translator, bytes32 postId,
                         bytes2 langCode, string calldata text)
        external onlySponsor;

    // ── Photo Reveals (sponsor-gated logging) ────────────────────
    // NOTE: nullifierHash is NOT emitted on-chain (privacy).
    // Backend stores (watermarkCode -> nullifierHash) mapping offchain.
    // On leak: watermarkCode -> lookup nullifierHash -> call banNullifierFor()
    event PhotoRevealed(bytes32 indexed postId, address indexed viewer,
                        bytes32 watermarkCode, uint32 nonce);

    function logRevealFor(address viewer, bytes32 postId,
                          bytes32 watermarkCode, uint32 nonce)
        external onlySponsor;

    // ── Nullifier Bans (moderator-gated) ─────────────────────────
    mapping(bytes32 => bool) public bannedNullifiers;

    event NullifierBanned(bytes32 indexed nullifierHash, bytes32 indexed relatedPostId,
                          address indexed moderator, string reason);

    function banNullifierFor(bytes32 nullifierHash, bytes32 relatedPostId, string calldata reason)
        external onlyModerator
    {
        bannedNullifiers[nullifierHash] = true;
        emit NullifierBanned(nullifierHash, relatedPostId, msg.sender, reason);
    }

    function isBanned(bytes32 nullifierHash) external view returns (bool) {
        return bannedNullifiers[nullifierHash];
    }

    // ── Moderation (sponsor-gated) ───────────────────────────────
    event PostFlagged(bytes32 indexed postId, address indexed flagger, uint8 reason);

    function flagFor(address flagger, bytes32 postId, uint8 reason)
        external onlySponsor;
}
```

**Key design:**
- `payReveal()` is permissionless (viewer pays directly, no sponsor needed)
- `payReveal()` enforces on-chain price: `msg.value >= revealPriceWei[postId]`
- `payReveal()` uses `nonReentrant` modifier (state updated before ETH transfer)
- `setRevealPriceFor()` is sponsor-gated, **immutable after first set** (prevents griefing)
- Social actions go through sponsor (gasless for users)
- Nonce tracks payment windows (each payment = new watermark)
- Charity wallet is immutable (set at deploy, can't be changed)
- `bannedNullifiers` mapping enables permanent identity bans for leakers
- **Privacy**: `nullifierHash` is NOT emitted on-chain (prevents activity tracking)
  - Backend stores `(watermarkCode -> nullifierHash)` mapping offchain at reveal time
  - On leak detection: lookup nullifierHash from watermarkCode, then call `banNullifierFor()`

### Translations

Community-contributed translations become shared resources:
- One user translates a post caption/lyrics → all users of that language benefit.
- Subgraph indexes translations per ipId per language.
- Frontend checks user locale, shows best available translation.
- Post author can override with their own translation.
- Auto-translation fallback via OpenRouter (existing lyrics-translate pattern).

---

## Rights & Moderation

### Rights Declaration (Ownership Claim)

**MVP: Binary ownership claim**
```
ownership: "mine" | "not-mine" | null

"mine"     → User explicitly claims they created this → register on Story
"not-mine" → User explicitly says they didn't create this → skip Story, attribution only
null       → Unknown ownership (conservative default) → skip Story
```

UI: Simple checkbox "I created this" (unchecked by default = conservative)

**Advanced (PostCreateDialog power-user flow):**
```
enum RightsMode:
  0 = Original       — "I created this" (eligible for licensing + Story)
  1 = Licensed       — "I have a license" (attach proof)
  2 = Derivative     — "This is a remix" (must reference parent)
  3 = PublicDomain   — "Public domain / CC" (select license type)
```

Advanced mode exposed only when user wants to enable licensing/monetization.
Stored in IPA metadata on Story. Creates structured audit trail.

### Content Safety Gate (All Photo Uploads)

Every photo upload runs an LLM vision check (~2-3s, Gemini 3 Flash via OpenRouter) **before any cost is incurred** (before Klein 9B, before Filebase upload). Single call returns `{ safe, hasFace, isAnime, isAdult, reason }`:
- Nudity / CSAM / violence → **hard reject** (safe=false)
- PII (documents, screens with personal data) → **hard reject**
- `isAnime` classifies the image style (anime/illustration vs real photograph)
- `hasFace` detects realistic human faces
- `isAdult` flags 18+ content (suggestive/sexual but legal) — western standards, AI auto-classifies

**Auto-mode detection** (no user choice needed):
- Real photo + human face → auto-convert to anime (Klein 9B anonymizes the face)
- Already anime/illustration → direct upload (no conversion needed)
- Real photo, no face → direct upload (safe as-is)

**18+ classification** (automatic, stored in metadata):
- `isAdult=true` → anime version gated behind in-app "I'm 18+" gate (MVP)
- `isAdult=true` + original reveal → requires BOTH in-app age gate AND payment (MVP)
- V2: on-chain verification via self.xyz VerificationMirror
- Classification stored in post metadata + PostsV1 event + indexed by subgraph
- Frontend checks `isAdult` flag and gates display accordingly

Songs, text: no vision check needed (text can contain whatever — swearing is fine).
Video (future): same gate applies.

This ensures zero spend on problematic content — the ~$0.01 vision check runs before the ~$0.009 Klein call + Filebase uploads.

### Content Removal

Two paths:

1. **Author self-delete**: User can remove their own post. Triggers Filebase unpin.
2. **Story disputes**: Any user can raise a dispute against an IP Asset. If upheld, IP gets tagged (can't mint licenses, can't claim royalties, tag cascades to derivatives).

For non-Story content (edge case): simple moderator remove + Filebase unpin.

### Takedown Mechanics

- Mark content as removed in subgraph index.
- Unpin from Filebase (S3 DELETE — same AWS Sig V4 pattern already used).
- On-chain audit trail preserved (event exists but content no longer served).
- Encrypted originals: revoke Lit access control conditions.

---

## Storage Strategy

### V1: Platform-Hosted (Filebase for Everything)

| Content | Storage | Visibility |
|---|---|---|
| Anime output (AI-transformed) | Filebase IPFS, public | Public feed |
| Original photo | Filebase IPFS, encrypted (Lit access control) | Owner only (+ allowed viewers) |
| Song preview (30s clip) | Filebase IPFS, public | Public feed |
| Song full audio | Filebase IPFS, encrypted (existing ContentRegistry flow) | Access-gated |
| Cover art / thumbnails | Filebase IPFS, public | Public feed |
| Metadata JSON (IPA + NFT) | Filebase IPFS, public | Story Protocol reference |
| Text post content | On-chain event data | Public |

### V2: Hybrid (When Scale Demands)

- Shift full songs/videos to BYOS (Filecoin) or gated platform hosting for verified creators.
- Keep previews/thumbnails/anime outputs on Filebase for fast feed UX.

---

## Subgraph & Feed

### Indexing Strategy

**MegaETH subgraph** (`dotheaven-activity`) is the primary feed source:
- PostsV1: all posts with `postIdBytes32`, `creator`, `metadataUri`, `isAdult`, `storyIpId`
- EngagementV2: likes, comments, translations, reveals, flags (all keyed by `postIdBytes32`)
- Computed: `contentIdBytes32` from CID extracted from `metadataUri`

**Story subgraph** (separate, queried on-demand):
- Only needed for posts where `storyIpId != address(0)`
- Provides: dispute status, licensing terms, derivative links
- Batch-queried by frontend when rendering feed (not per-post)

### Feed Query Pattern

```graphql
# Primary: MegaETH subgraph (all posts)
query Feed($first: Int, $skip: Int) {
  posts(first: $first, skip: $skip, orderBy: blockTimestamp, orderDirection: desc) {
    postId           # universal key
    creator
    contentType
    metadataUri
    ipfsHash         # computed from metadataUri
    contentId        # keccak256("heaven:content:" + ipfsHash)
    isAdult
    storyIpId        # nullable — address(0) if not on Story
    blockTimestamp
  }
}

# Secondary: Story subgraph (only for posts with storyIpId)
query DisputeStatus($ipIds: [Bytes!]!) {
  ipAssets(where: { id_in: $ipIds }) {
    id
    isDisputed
    disputeTag
  }
}
```

### Dispute Handling

- Frontend collects all non-null `storyIpId` values from feed
- Batch-queries Story subgraph for dispute status
- Joins results client-side (no per-render IPFS fetch)
- Disputed posts: hide/blur + disable licensing + show warning

### Feed Ranking (V1)

Reverse chronological. Mixed content types (posts, scrobbles, playlists).

### Feed Ranking (V2)

Smart/adaptive: boost by engagement, recency decay, social graph proximity, content type diversity.

---

## Lit Actions

| Action | Status | Purpose |
|---|---|---|
| `post-create-v1.js` | ✅ Deployed | Photo → safety check → auto anime conversion → Filebase → Story IP |
| `post-register-v1.js` | ✅ Deployed | Simplified: Media Worker uploads, Lit Action registers (conditional Story) |
| `post-text-v1.js` | ✅ Merged into post-register-v1 | Text posts now use unified post-register-v1.js |
| `post-engage-v1.js` | 🔜 To build | Likes/comments/translations → MegaETH EngagementV2 (uses `postIdBytes32`) |
| `photo-reveal-v1.js` | ✅ Deployed | Check payment (24h window) → decrypt → watermark → return bytes |
| `song-publish-v1.js` | ✅ Existing | Audio/preview/cover/metadata → Filebase + lyrics processing |
| `story-register-sponsor-v1.js` | ✅ Existing | Story IP registration (reuse for songs, retroactive licensing) |
| `content-register-v1.js` | ✅ Existing | Encrypted content registration (ContentRegistry on MegaETH) |
| `content-decrypt-v1.js` | ✅ Existing | Decrypt gated content (songs) |
| `content-access-v1.js` | ✅ Existing | Grant/revoke access to encrypted content |

---

## Contracts to Build

### 1. PostsV1 (MegaETH, chain 6343) — **To Deploy**

MegaETH mirror for all posts (including shared content that skips Story).

```solidity
event PostCreated(
    bytes32 indexed postId,      // universal key (keccak256 of author+timestamp+cid)
    address indexed creator,
    uint8 contentType,           // 0=text, 1=photo
    string metadataUri,
    bool isAdult,
    address storyIpId            // address(0) if Story registration skipped
);

function createPostFor(
    address creator,
    bytes32 postId,
    uint8 contentType,
    string calldata metadataUri,
    bool isAdult,
    address storyIpId
) external onlySponsor;
```

**Key design:**
- Event-only (no storage) — pure indexing mirror
- `storyIpId` is optional (address(0) for shared content)
- `postId` is the universal key for all MegaETH engagement

### 2. EngagementV2 (MegaETH, chain 6343) — **To Deploy**

Replaces EngagementV1. Targets `postIdBytes32` universally (not Story ipId).
Includes integrated reveal payment router.

See "Social Engagement" section above for full contract spec.

**Key changes from V1:**
- All functions use `postIdBytes32` instead of Story `ipId`
- Added `payReveal()` permissionless payment function
- Added `revealPaidAt` / `revealNonce` tracking for 24h windows
- Added `PhotoRevealed` event with nonce

### 3. EngagementV1 (Legacy) — **Already Deployed**

- Address: `0x2A3beA895AE5bb4415c436155cbA15a97ACc2C77`
- **Deprecated**: Uses Story `ipId` as key, doesn't support shared content
- Keep for existing data, migrate to V2 for new posts

### 4. Model Registry (Future)

- Could live on MegaETH (where balance/payment logic is) or Story.
- Maps `modelId` → `(endpoint, price, active, asyncRequired)`.
- User balance deposit/withdraw.
- Lit Action checks balance + model validity before calling fal.ai.

### Story Protocol as IP Registry

Story Protocol handles IP registration for original content:
- `storyIpId` (deterministic from chain + NFT contract + tokenId)
- IPA metadata (content CIDs, rights mode, model used, parent reference)
- PIL license terms (if licensing enabled)
- Dispute status

**But not all posts go on Story** — shared content is indexed only on MegaETH.

---

## Architectural Decisions (Feb 2026)

### 1. Dual ID System

Two distinct identifiers for different purposes:

| ID | Formula | Purpose |
|---|---|---|
| `ipIdBytes32` (Post ID) | `keccak256("heaven:post:" + author + ":" + timestamp + ":" + cid)` | Unique per post. Same image uploaded twice = two different posts. |
| `contentIdBytes32` (Content ID) | `keccak256("heaven:content:" + cid)` | Same for identical content. Enables clustering, dedup, derivative detection. |

**Rationale**: If Alice uploads a photo and Bob shares the same photo, they have different `ipIdBytes32` (different posts) but the same `contentIdBytes32` (same content). This allows:
- Feed deduplication (show one version, link to others)
- Derivative tracking (who else posted this image?)
- Original attribution (who uploaded first?)

### 2. Conditional Story Protocol Registration

Not all posts register on Story Protocol:

| Ownership claim | Story registration | Use case |
|---|---|---|
| `"mine"` | ✅ Yes | Original content — creator wants IP protection |
| `"not-mine"` | ❌ No | Shared content — attribution only, no IP claim |
| Missing/null | ❌ No (conservative default) | Unknown ownership — safer to skip Story |

**Rationale**: Claiming IP ownership on Story Protocol for content you didn't create is legally problematic. By requiring an explicit "mine" claim, we:
- Avoid accidental false IP registration
- Create an accountability paper trail
- Still allow sharing with proper attribution

### 3. Subgraph-Computed contentId

`contentIdBytes32` is NOT stored on-chain. It's computed by the subgraph:

```
PostCreated event → extract CID from metadataUri → keccak256("heaven:content:" + cid)
```

**Rationale**: Avoids contract upgrade. The subgraph already has the metadataUri, so it can deterministically compute the same hash. No gas cost, no storage cost.

### 4. PostsV1 as MegaETH Mirror

Why mirror posts on MegaETH when Story is the source of truth?

- **Speed**: MegaETH has 10ms blocks vs Story's ~2s. Feed queries are faster.
- **Unified indexing**: Single subgraph indexes posts + scrobbles + playlists + engagement.
- **Shared content**: Posts that skip Story registration still get indexed via MegaETH events.

PostsV1 is event-only (no storage) — pure indexing mirror.

### 5. Nullable Story Fields

When `skipStoryRegistration: true`, the Lit Action returns:
- `ipId: null`
- `tokenId: null`
- `txHash: null`
- `megaTxHash: string` (MegaETH mirror tx always fires)

Frontend conditionally shows Story Protocol UI only when `ipId` is present.

---

## Implementation Order (Revised Feb 2026)

### Completed Infrastructure ✅

- **EngagementV2 contract** — `0xAF769d204e51b64D282083Eb0493F6f37cd93138`
- **PostsV1 contract** — `0xFe674F421c2bBB6D664c7F5bc0D5A0204EE0bFA6`
- **photo-reveal-v1.js** — Watermarking Lit Action deployed
- **post-register-v1.js** — Unified text/photo registration
- **Subgraph** — dotheaven-activity/6.0.0

### Phase A: Post Studio (Current Priority)

1. **Frontend: Post Studio UI**
   - Replace auto-convert with filter selection (user chooses style)
   - Filter options: Anime, Watercolor, Sketch, Illustration, Ghibli
   - Preview before posting
   - Proof-of-work gate: Self.xyz verified OR minimum activity threshold
   - Wire to post-studio-v1.js Lit Action

2. **post-studio-v1.js Lit Action**
   - Safety check (reject illegal content)
   - Apply user-selected filter via fal.ai
   - Store encrypted original (for matchmaking reveals)
   - Upload filtered result to Filebase
   - Emit PostCreated event

3. **Remove reveal from feed**
   - Remove EngagementBar reveal button from feed posts
   - Reveals only in matchmaking/DMs

### Phase B: Matchmaking System

4. **MatchingV1 contract** (MegaETH)
   - `like(targetAddress)` — record one-way like
   - `isMatched(user1, user2)` — check mutual like
   - `createMatch()` — emit Match event when mutual
   - `revealViewed[matchId][viewer]` — track single-view reveals

5. **match-reveal-v1.js Lit Action**
   - Verify mutual match on-chain
   - Single-view (not 24h window): mark as viewed after decrypt
   - Apply watermark for accountability
   - Return watermarked image bytes

6. **Frontend: Matchmaking UI**
   - Suggested Matches page (based on scrobble compatibility)
   - Like/pass swipe interface
   - Match notification + reveal flow
   - "Matches" tab on profile (revealed photos)

7. **Compatibility scoring service**
   - Query scrobbles from subgraph
   - Calculate music taste overlap
   - Factor in profile criteria (location, interests)
   - Return ranked match suggestions

### Phase C: Karaoke Booking

8. **KaraokeV1 contract** (MegaETH)
   - `proposeBooking(invitee, startTime, endTime)` payable
   - `acceptBooking(bookingId)`
   - `completeBooking(bookingId)` — release escrow
   - `cancelBooking(bookingId)` — refund

9. **AI Matchmaker (XMTP)**
   - Identify compatible pairs (high scrobble overlap + availability)
   - Create group chat, send introduction message
   - Suggest songs based on shared listening history

10. **Frontend: Karaoke booking UI**
    - Availability settings in profile
    - Booking proposal interface
    - Session calendar
    - Payment/escrow status

### Phase D: Artist Fan Clubs

11. **ArtistClubV1 contract** (MegaETH)
    - `joinClub(artistId, scrobbleCount, proof)`
    - `leaveClub(artistId)`
    - `setThreshold(artistId, count)` — admin
    - `isMember(artistId, user)` — check membership

12. **club-verify-v1.js Lit Action**
    - Query subgraph for user's scrobble count per artist
    - Sign attestation if threshold met
    - Return proof for on-chain join

13. **Frontend: Fan Clubs UI**
    - Browse available clubs
    - See membership requirements (scrobble threshold)
    - Join club flow (triggers Lit Action verification)
    - Club chat (XMTP group)
    - Leaderboard (top fans by scrobble count)

14. **Subgraph: Club membership indexing**
    - MemberJoined / MemberLeft events
    - Per-artist member counts
    - Membership history

### Phase E: Production

15. **Story mainnet deployment** — chain 1514
16. **Screenshot protection** — FLAG_SECURE (Android), capture detection (iOS)
17. **Steganographic watermark** — invisible watermark layer
18. **Mobile-only reveals** — web shows "download app"

---

## Key References

### Story Protocol

**Mainnet (chain 1514)**
| | Value |
|---|---|
| Chain ID | 1514 |
| RPC | `https://mainnet.storyrpc.io` |
| Gas Price | ~0.009 gwei |
| $IP Price | ~$1.40 (as of Feb 2026) |
| Cost per registration | ~$0.00004 |

**Aeneid Testnet (chain 1315)**
| | Value |
|---|---|
| Chain ID | 1315 |
| RPC | `https://aeneid.storyrpc.io` |

Contracts (Aeneid testnet — update for mainnet):

| Contract | Aeneid Address |
|---|---|
| LicenseAttachmentWorkflows | `0xcC2E862bCee5B6036Db0de6E06Ae87e524a79fd8` |
| LicensingModule | `0x04fbd8a2e56dd85CFD5500A4A4DfA955B9f1dE6f` |
| PILicenseTemplate | `0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316` |
| SPG NFT (Heaven Songs) | `0xb1764abf89e6a151ea27824612145ef89ed70a73` |

### MegaETH (Testnet)

| Contract | Address | Status |
|---|---|---|
| ScrobbleV3 | `0x144c450cd5B641404EEB5D5eD523399dD94049E0` | ✅ Deployed |
| PlaylistV1 | `0xF0337C4A335cbB3B31c981945d3bE5B914F7B329` | ✅ Deployed |
| ProfileV1 | `0x0A6563122cB3515ff678A918B5F31da9b1391EA3` | ✅ Deployed |
| RegistryV1 | `0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2` | ✅ Deployed |
| RecordsV1 | `0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3` | ✅ Deployed |
| EngagementV1 | `0x2A3beA895AE5bb4415c436155cbA15a97ACc2C77` | ⚠️ Deprecated (uses Story ipId) |
| PostsV1 | `0xFe674F421c2bBB6D664c7F5bc0D5A0204EE0bFA6` | ✅ Deployed |
| EngagementV2 | `0xAF769d204e51b64D282083Eb0493F6f37cd93138` | ✅ Deployed |

### fal.ai

| Model | Endpoint | Speed |
|---|---|---|
| Flux 2 Klein 9B | `fal-ai/flux-2/klein/9b/edit` | ~4s |

### Sponsor PKP

| | Value |
|---|---|
| Public Key | `044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08` |
| Address | `0x089fc7801D8f7D487765343a7946b1b97A7d29D4` |
