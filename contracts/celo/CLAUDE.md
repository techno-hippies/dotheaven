# Heaven Contracts — Celo (Self.xyz Verification)

## Overview

Self.xyz passport verification for Heaven profiles. Deployed on Celo because Self's IdentityVerificationHub V2 only exists on Celo chains.

## Architecture

```
User scans QR → Self app → Self Hub (Celo) → SelfProfileVerifier.customVerificationHook()
                                                    ↓
                                              verifiedAt[user] = timestamp
                                                    ↓
                                        Lit Action reads Celo verifiedAt
                                                    ↓
                                        Sponsor PKP writes to MegaETH
                                           VerificationMirror.mirror()
```

- **Celo**: Source of truth. Self hub calls `verifySelfProof()` on your contract.
- **MegaETH**: Mirror. Lit Action reads Celo, sponsor PKP writes locally. MegaETH contracts can gate on `verifiedAt(user) != 0`.
- **No backend**: Verification is fully on-chain (Celo hub → your contract). Mirror sync is user-driven via Lit Action.

## Contracts

| Contract | Chain | Description |
|----------|-------|-------------|
| `SelfProfileVerifier.sol` | Celo Sepolia (11142220) | Inherits `SelfVerificationRoot`. Stores `verifiedAt[user]` + nullifier dedup. |
| `VerificationMirror.sol` | MegaETH (6343) | Oracle-style mirror. Sponsor PKP writes `verifiedAt` after reading Celo. In `contracts/megaeth/src/`. |

## Self.xyz Hub Addresses

| Network | Chain ID | Hub Address |
|---------|----------|-------------|
| Celo Mainnet | 42220 | `0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF` |
| Celo Sepolia | 11142220 | `0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74` |

## Verification Config

- `olderThan: 18` (minimum age)
- No forbidden countries
- OFAC disabled
- `scopeSeed: "heaven-profile-verify"`

**Scope is derived from contract address + scopeSeed.** Redeploying changes the scope — frontend config must be updated.

## Nullifier

One passport → one verified address. `nullifierUsed[nullifier]` prevents the same passport from verifying multiple accounts. Nullifier is scope-bound (different apps get different nullifiers for the same passport).

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
  --rpc-url celo_sepolia \
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
VITE_SELF_VERIFIER_CELO=0x...          # SelfProfileVerifier address on Celo
VITE_VERIFICATION_MIRROR_MEGAETH=0x... # VerificationMirror address on MegaETH
VITE_SELF_MIRROR_ACTION_CID=           # IPFS CID of self-verify-mirror-v1.js
```

Frontend reads `verifiedAt(user)` from Celo for badge display. Mirror sync to MegaETH is triggered on-demand when gated features are accessed.

See: `apps/frontend/src/lib/heaven/verification.ts`

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
contracts/megaeth/src/VerificationMirror.sol    # MegaETH mirror contract
lit-actions/actions/self-verify-mirror-v1.js    # Lit Action for Celo→MegaETH sync
apps/frontend/src/lib/heaven/verification.ts    # Frontend verification helpers
apps/frontend/src/lib/chains.ts                 # Celo Sepolia chain definition
```
