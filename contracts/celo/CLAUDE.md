# Heaven Contracts — Celo (Self.xyz Verification)

## Overview

Self.xyz passport verification for Heaven profiles. Deployed on Celo because Self's IdentityVerificationHub V2 only exists on Celo chains.

## Architecture

```
User scans QR → Self app → Self Hub (Celo) → SelfProfileVerifier.customVerificationHook()
                                                    ↓
                                              verifiedAt[user] = timestamp
                                              nationality[user] = "GBR"
                                                    ↓
                                        Lit Action reads Celo state
                                                    ↓
                                        Sponsor PKP writes to MegaETH
                                           VerificationMirror.mirror()
```

- **Celo**: Source of truth. Self hub calls `verifySelfProof()` on your contract.
- **MegaETH**: Mirror. Lit Action reads Celo, sponsor PKP writes locally. MegaETH contracts can gate on `verifiedAt(user) != 0`.
- **No backend**: Verification is fully on-chain (Celo hub → your contract). Mirror sync is user-driven via Lit Action.

## Contracts

| Contract | Chain | Address | Description |
|----------|-------|---------|-------------|
| `SelfProfileVerifier.sol` | Celo Sepolia (11142220) | `0x9F0fFF861b502118336bCf498606fEa664a8DAdA` | Stores `verifiedAt[user]`, `nationality[user]` + nullifier dedup. |
| `VerificationMirror.sol` | MegaETH (6343) | `0xb0864603A4d6b62eACB53fbFa32E7665BADCc7Fb` | Oracle-style mirror. Sponsor PKP writes `verifiedAt`, `nationality` after reading Celo. In `contracts/megaeth/src/`. |

## Self.xyz Hub Addresses

| Network | Chain ID | Hub Address |
|---------|----------|-------------|
| Celo Mainnet | 42220 | `0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF` |
| Celo Sepolia | 11142220 | `0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74` |

## Stored Data

| Field | Type | Source |
|-------|------|--------|
| `verifiedAt[user]` | uint64 | `block.timestamp` at verification |
| `nationality[user]` | string | 3-letter ISO from passport (e.g. "GBR", "USA") |
| `nullifierOwner[nullifier]` | address | Prevents same passport verifying multiple accounts |

## Verification Config

- `olderThan: 18` (minimum age — binary gate, proof fails if under 18)
- No forbidden countries
- OFAC disabled
- No date_of_birth disclosure (privacy: age is self-reported via ProfileV2)
- `scopeSeed: "heaven-profile-verify"`

**Scope is derived from contract address + scopeSeed.** Redeploying changes the scope — frontend config must be updated.

## Frontend Disclosures

The frontend `SelfAppBuilder` requests:
- `minimumAge: 18` (binary gate — no DOB disclosed)
- `nationality: true`

**SDK quirk**: `endpointType` must be `'staging_celo'` (not `'celo-staging'` as the docs say). The SDK v1.0.0 uses `staging_celo` internally to set `chainID: 11142220`.

## Nullifier

One passport → one verified address. `nullifierOwner[nullifier]` prevents the same passport from verifying multiple accounts. Same wallet can re-verify (updates timestamp/nationality). Nullifier is scope-bound (different apps get different nullifiers for the same passport).

## Commands

```bash
# Install dependencies
bun install
forge install foundry-rs/forge-std --no-commit  # if lib/forge-std missing

# Build
forge build

# Deploy to Celo Sepolia
source .env
forge script script/DeploySelfProfileVerifier.s.sol \
  --rpc-url https://forno.celo-sepolia.celo-testnet.org \
  --broadcast

# Deploy to Celo Mainnet
SELF_HUB=0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF \
forge script script/DeploySelfProfileVerifier.s.sol \
  --rpc-url celo_mainnet \
  --broadcast

# Verify on Celoscan
forge verify-contract <ADDRESS> src/SelfProfileVerifier.sol:SelfProfileVerifier \
  --chain-id 11142220 \
  --verifier etherscan \
  --verifier-url https://api-sepolia.celoscan.io/api
```

## Environment Variables

```bash
PRIVATE_KEY=         # Deployer private key
CELOSCAN_API_KEY=    # For contract verification
SELF_HUB=            # Override hub address (default: Celo Sepolia)
```

## Frontend Integration

After deploying, set in frontend `.env`:
```bash
VITE_SELF_VERIFIER_CELO=0x9F0fFF861b502118336bCf498606fEa664a8DAdA
VITE_VERIFICATION_MIRROR_MEGAETH=0xb0864603A4d6b62eACB53fbFa32E7665BADCc7Fb
VITE_SELF_MIRROR_ACTION_CID=           # IPFS CID of self-verify-mirror-v1.js (optional, dev fallback used if empty)
```

Frontend reads `verifiedAt(user)` and `nationality(user)` from Celo for badge display and profile override. Verified nationality overrides self-reported ProfileV2 value. Age is always self-reported. Mirror sync to MegaETH is triggered on-demand.

See: `apps/web/src/lib/heaven/verification.ts`

## Frontend Flow

1. **Own profile**: "Verify Identity" button shown next to "Edit Profile" when unverified
2. Click opens `VerifyIdentityDialog` with QR code (Self.xyz universal link)
3. User scans with Self app → Self submits proof to Celo (Self pays gas)
4. Frontend polls `verifiedAt(user)` on Celo every 5s
5. On verification: mirrors to MegaETH via Lit Action (sponsor PKP pays gas), shows success
6. Badge appears next to display name, nationality field shows verified value

## Files

```
contracts/celo/
├── src/
│   └── SelfProfileVerifier.sol     # Self.xyz verifier (Celo)
├── script/
│   └── DeploySelfProfileVerifier.s.sol
├── foundry.toml
├── remappings.txt
├── package.json                     # @selfxyz/contracts dependency
└── .env.example
```

Related files in other packages:
```
contracts/megaeth/src/VerificationMirror.sol              # MegaETH mirror contract
lit-actions/features/verification/self-verify-mirror-v1.js # Lit Action for Celo→MegaETH sync
apps/web/src/lib/heaven/verification.ts              # Frontend verification helpers
apps/web/src/pages/ProfilePage.tsx                   # Verification dialog + polling wiring
packages/ui/src/composite/profile/verify-identity-dialog.tsx  # QR code dialog component
packages/ui/src/composite/profile/verification-badge.tsx     # Verified/unverified badge
apps/web/src/components/profile/profile-header.tsx   # "Verify Identity" button
```
