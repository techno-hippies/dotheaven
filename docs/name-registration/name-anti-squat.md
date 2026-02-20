# Name Anti-Squat Plan (Tempo Only)

## Scope

Tempo-only name anti-squat policy.

- Chain: Tempo only
- Registration path: store/operator path only for anti-squat policy enforcement
- Identity provider for short names: Self
- Name cap model: lifetime purchases per verified identity nullifier

## Goals

1. Stop bot squatting for free/cheap names.
2. Keep long-name onboarding usable for normal users.
3. Enforce policy on-chain (not only in UI/backend).
4. Preserve privacy by storing only hashed identity nullifiers on-chain.

## Policy

- `len <= 5`: paid, store-only, Self-verified, max `3` lifetime purchases per identity.
- `len >= 6`: PoW ticket required, store-only.
- Reserved/premium names: store listing required.
- Short-name cap is shared across both `.heaven` and `.pirate` in v1.

## Key Constraint

IP/device/rate-limit signals cannot be enforced by smart contracts. They are backend checks.

Contract enforces only cryptographic attestations from the trusted backend signer:

- policy permit signature
- expiry/deadline
- replay nonce
- exact label/tld/recipient/duration binding
- short-name lifetime cap by nullifier hash

## Architecture

```
Client -> Policy backend -> Store contract -> Registry.operatorRegister
```

### Backend responsibilities

- Verify Self proof for short-name flow.
- Verify PoW for long-name flow.
- Apply off-chain abuse controls: IP/device/wallet rate limits.
- Issue short-lived signed permit bound to purchase parameters.

### Contract responsibilities

- Verify backend signature over typed permit data.
- Reject expired/replayed permits.
- Enforce lifetime cap for `len <= 5` using nullifier hash.
- Collect payment token (AlphaUSD) and mint via `operatorRegister`.

## On-Chain Model

Store contract additions:

- `mapping(bytes32 => uint16) public shortPurchasesByNullifier;`
- `mapping(address => mapping(uint256 => bool)) public usedPermitNonces;`
- `address public policySigner;`

Permit payload (EIP-712 recommended):

- `buyer`
- `policyType` (`SHORT_SELF` or `LONG_POW`)
- `parentNode`
- `labelHash` (`keccak256(bytes(label))`)
- `recipient`
- `duration`
- `maxPrice` (buyer-protecting ceiling, not necessarily exact listing price)
- `nullifierHash` (required for `SHORT_SELF`, zero for `LONG_POW`)
- `nonce`
- `deadline`

Notes:

- Sign hashes, not raw strings, for deterministic binding and lower calldata overhead.
- EIP-712 domain should include chain id and verifying contract.

### Nonce Strategy (Tempo-safe)

Tempo supports parallelizable transaction nonces, so permit replay protection must not rely on a strictly sequential tx nonce model.

- Permit nonce domain: per wallet (`usedPermitNonces[wallet][nonce]`).
- Nonces are random unique values (not monotonic counters).
- The backend signs over `(buyer, nonce, labelHash, parentNode, recipient, duration, deadline, ...)`.
- This allows multiple concurrent purchases while still preventing replay.

Checks:

1. Enforce caller binding: `msg.sender == permit.buyer`.
2. Verify signature from `policySigner`.
3. Enforce `block.timestamp <= deadline`.
4. Enforce nonce unused, then mark used.
5. Compute `labelHash` from input `label` and match signed `permit.labelHash`.
6. Enforce canonical label character rules.
7. If `label.length <= 5`:
   - `nullifierHash != 0`
   - `shortPurchasesByNullifier[nullifierHash] < 3`
   - increment counter
8. Compute required on-chain price and enforce `requiredPrice <= permit.maxPrice`.
9. Collect payment token from `permit.buyer` to treasury when `requiredPrice > 0`.
10. Call registry operator mint (`operatorRegister` / `operatorRegisterFor` depending on registry version).

### PoW Difficulty Tuning (len >= 6)

PoW is backend-verified and backend-tunable (no contract redeploy needed).

- Target solve time:
  - 6 chars: ~1-2s
  - 7+ chars: sub-1s initially
- Start conservative and increase difficulty when abuse rises.
- Adjust by risk signals (IP/device/wallet velocity, ASN, fail rate), while keeping permit TTL short.

## Registry Requirements

Anti-squat policy is bypassable if public registration remains open for eligible names.

Option A (close public registration) only works if the registry has an operator-only mint path.

- Current RegistryV2 pattern supports this (`setOperator` + `operatorRegister`).
- If running a registry variant without operator mint, add operator authorization + operator mint first (or migrate to a registry that has it).

To remove bypass completely, one of the following must be true:

1. Close public registrations and route mints through operator/store.
2. Fully gate public registration for all policy-governed names.

Gating only free names is insufficient when short names are paid, because direct public calls can still bypass Self/permit policy.

Without full closure/full gating, users can bypass backend policy by calling registry directly.

## API Plan

### `POST /names/permit`

Input:

- `label`
- `tld`
- `recipient`
- `duration`
- `wallet`
- optional Self proof bundle (short-name flow)
- optional PoW solution bundle (long-name flow)

Behavior:

1. Compute label length.
2. For `len <= 5`: verify Self proof, derive app-scoped nullifier hash, check lifetime count (prefer on-chain count as source of truth).
3. For `len >= 6`: verify PoW + rate limits.
4. Return signed permit for contract call.

Nullifier scope in v1:

- Use one app-level scope for names (shared across both TLDs).
- Derive stored key as hash of the scoped nullifier (do not store raw identity fields).
- If policy later needs per-TLD caps, include `tld` in the derivation domain and migrate with a new version tag.

Output:

- `permit` object
- `signature`
- `quote` (price/token/duration)

## Frontend/Android Flow

1. User selects label/tld.
2. App requests permit from backend.
3. App submits `buyWithPermit(...)` on store contract.
4. App displays tx result.

UI should not claim "public registration available" unless product policy intentionally allows direct public minting.

## Rollout Plan

1. Contract: add `buyWithPermit` path + nonce/nullifier state + signer config.
2. Backend: implement `/names/permit` with Self + PoW verification and abuse controls.
3. App/web: call backend permit endpoint and use contract permit purchase path.
4. Registry ops: ensure store contract is authorized as operator for each TLD (`setOperator(heaven)`, `setOperator(pirate)`).
5. Registry: enforce operator-only behavior for anti-squat-sensitive names (close/gate public path) only after step 4.
6. Deploy and migrate addresses/configs in app clients.
7. Update addresses/configs in app clients after deploy.

## Open Decisions

1. Should `len >= 6` remain free after permit verification, or have a small base fee?
2. Permit expiry window (recommended: 2-5 minutes).
