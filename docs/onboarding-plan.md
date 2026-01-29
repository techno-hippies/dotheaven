# Onboarding & Identity Plan

## Overview

After WebAuthn signup, users go through a 2-step onboarding flow to claim their identity:
1. **Choose a name** → registers `name.heaven` on Base via MultiTldSubnameRegistrarV3
2. **Upload avatar** → Lit Action uploads to Filebase IPFS, writes CID to profile

Both write to on-chain storage (registrar + ProfileV1/RecordsV2), making identity fully decentralized and portable.

---

## Architecture

```
Signup (WebAuthn/Passkey)
  → PKP minted (wallet address created)
  → Redirect to /onboarding

/onboarding (2 steps)
  ├─ Step 1: Name
  │   ├─ Input: desired username
  │   ├─ Live availability check: registrar.available(parentNode, name)
  │   ├─ Show: "name.heaven" preview
  │   ├─ Register: registrar.register(parentNode, name, duration)
  │   │   └─ Platform-sponsored gas for 5+ char names (free on Base)
  │   └─ Write displayName to ProfileV1
  │
  └─ Step 2: Avatar
      ├─ Input: image file (crop/resize client-side)
      ├─ Hash image (SHA-256)
      ├─ PKP signs: heaven:avatar:${hash}:${timestamp}:${nonce}
      ├─ Lit Action: verify sig → decrypt Filebase key → upload → return CID
      └─ Write photoURI (ipfs://${cid}) to ProfileV1
```

---

## Contracts Involved

### MultiTldSubnameRegistrarV3 (Base) — already deployed
- `available(parentNode, name)` → bool
- `register(parentNode, name, duration)` → tokenId
- Free for 5+ chars on Base, tiered pricing for shorter names
- Parent nodes: `.heaven`, `.⭐`, `.🌀`

### ProfileV1 (needs deployment)
- `upsertProfile(ProfileInput)` — sets displayName, photoURI, nameHash, etc.
- `getProfile(address)` — read profile
- Already written, not yet deployed or wired to frontend

### RecordsV2 (Base) — already deployed
- ENS-compatible key-value records
- Can store avatar, url, description, etc. as ENS text records
- Readable by any ENS-aware client

---

## New Lit Action: Avatar Upload

Follow the proven song-upload-v1 pattern:

```
actions/avatar-upload-v1.js

Input:
  - imageUrl: data URL or blob URL of cropped image
  - contentHash: SHA-256 of image bytes
  - signature: PKP signature over "heaven:avatar:{hash}:{timestamp}:{nonce}"
  - timestamp, nonce

Process:
  1. Fetch image from URL
  2. Compute SHA-256, verify matches contentHash
  3. Recover signer from signature, verify it matches the PKP
  4. Decrypt Filebase API key (runOnce)
  5. Upload image to Filebase S3 (key: avatars/{address}.{ext})
  6. Return IPFS CID

Output:
  - cid: string (IPFS content hash)
```

---

## Name Resolution & ENS Compatibility

### How .heaven names work with ENS
- Resolver.sol implements ENSIP-10 (wildcard resolution)
- `name.heaven` resolves to the owner's ETH address
- Any ENS-aware dapp/protocol can resolve `.heaven` names

### XMTP Integration
- XMTP resolves ENS names → ETH addresses for messaging
- `name.heaven` should work out of the box IF the resolver is registered with ENS
- Users can message each other by `.heaven` name instead of raw address
- Display `.heaven` name in chat UI when available

### Handshake TLD Ownership
- You own `.heaven` TLD on Handshake + 2 emoji TLDs
- Bridge path: Handshake DNS → ENS L2 resolver → on-chain resolution
- The wildcard resolver already handles this on the contract side
- Need DNS records pointing `.heaven` to the ENS resolver for full HNS→ENS bridge

### ENS Name Support
- Users who already have ENS names (e.g. `alice.eth`) can link them
- Reverse resolution: show ENS name if set, fall back to `.heaven` name
- For XMTP: accept both `name.heaven` and `name.eth` as recipients

---

## Frontend Implementation

### New Files
```
apps/frontend/src/
├── pages/OnboardingPage.tsx          # 2-step onboarding flow
├── lib/contracts/
│   ├── registrar.ts                  # MultiTldSubnameRegistrarV3 interactions
│   ├── profile.ts                    # ProfileV1 read/write
│   └── abis/                         # Contract ABIs
│       ├── registrar.json
│       └── profile.json
```

### Modified Files
```
apps/frontend/src/
├── providers/AuthContext.tsx          # Add isNewUser flag, redirect logic
├── App.tsx                           # Add /onboarding route
├── components/profile/
│   ├── profile-page.tsx              # Wire to ProfileV1 reads
│   └── profile-header.tsx            # Show real name + avatar from chain
```

### New Lit Action
```
lit-actions/
├── actions/avatar-upload-v1.js       # Avatar upload action
└── scripts/setup.ts                  # Add avatarUpload setup command
```

---

## Onboarding UX Flow

```
1. User completes WebAuthn registration
   └─ AuthContext sets isNewUser = true
   └─ Router redirects to /onboarding

2. /onboarding — Step 1: Name
   ┌─────────────────────────────────┐
   │  Choose your name               │
   │                                  │
   │  [____________] .heaven          │
   │  ✓ Available                     │
   │                                  │
   │  Also available:                 │
   │  name.⭐  name.🌀               │
   │                                  │
   │           [Claim Name →]         │
   └─────────────────────────────────┘
   - Debounced availability check as user types
   - Show pricing if <5 chars
   - TX: register() on Base (platform sponsors gas for free names)

3. /onboarding — Step 2: Avatar
   ┌─────────────────────────────────┐
   │  Add a profile photo             │
   │                                  │
   │       ┌──────────┐              │
   │       │  Upload   │              │
   │       │  Photo    │              │
   │       └──────────┘              │
   │                                  │
   │  [Skip]        [Complete →]     │
   └─────────────────────────────────┘
   - Client-side crop to square
   - Upload via Lit Action → Filebase IPFS
   - Write CID to ProfileV1.photoURI

4. Redirect to / (feed)
   - Profile now shows real name + avatar everywhere
```

---

## Gas & Cost Strategy

- **Name registration (5+ chars):** FREE on Base — platform can sponsor gas
- **Name registration (<5 chars):** User pays ETH on Base (cheap L2 gas)
- **Avatar upload:** Off-chain via Lit Action (no gas for upload itself)
- **Profile write:** Single TX to ProfileV1 on whichever chain it's deployed
- **Future:** Could batch name registration + profile write into one TX

---

## Open Questions

1. **Which chain for ProfileV1?** Base (same as registrar) makes sense for atomic name+profile updates
2. **Avatar resize dimensions?** 256x256 or 512x512 for the on-chain reference, higher res optional
3. **Skip allowed?** Can users skip avatar and add later from profile page?
4. **Name changes?** Allow renaming or is the first registration permanent? (Registrar supports renewals but not renames by default)
5. **Emoji TLD registration:** Same flow but different parentNode? Show all 3 options?
6. **ENS bridge priority:** Is HNS→ENS resolution needed now or future work?
7. **Profile contract chain:** Deploy ProfileV1 to Base alongside registrar?
