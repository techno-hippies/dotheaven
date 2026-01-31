# Name Anti-Squat: PoW + Operator Gating

## Problem

Free `.heaven` names (5L+) can be squatted by scripts calling the contract directly with throwaway EOAs. MegaETH gas is near-zero so there's no economic friction.

## Design

### Contract Change: Operator-only for free names

In `RegistryV1.register()` / `registerFor()`, after computing cost:

```
if (cost == 0 && !operators[parentNode][msg.sender]) revert NotAuthorized();
```

- Paid names (sub-5L): permissionless, price is the defense
- Free names (5L+): must go through an authorized operator (sponsor PKP)
- `operatorRegister()` already exists and checks `operators[parentNode][msg.sender]`
- Could consolidate into one path or just add the check to `registerFor()`

### PoW Challenge Flow

```
Frontend                    Worker/Backend              Lit Action              Contract
   |                             |                         |                      |
   |-- 1. requestChallenge() --->|                         |                      |
   |   (label, address)         |                         |                      |
   |                             |-- generate salt,        |                      |
   |                             |   secret_number,        |                      |
   |                             |   challenge = sha256(   |                      |
   |                             |     salt + secret)      |                      |
   |                             |   sig = hmac(challenge,  |                      |
   |                             |     hmac_key)           |                      |
   |<-- { challenge, salt, ------+                         |                      |
   |     maxnumber, signature,   |                         |                      |
   |     algorithm }             |                         |                      |
   |                             |                         |                      |
   |-- 2. solve PoW in          |                         |                      |
   |   web worker (~1-2s)       |                         |                      |
   |                             |                         |                      |
   |-- 3. executeJs(solution) --|------------------------>|                      |
   |   jsParams: { label,       |                         |-- verify PoW:        |
   |     recipient, solution }   |                         |   sha256(salt+num)   |
   |                             |                         |   == challenge?      |
   |                             |                         |   hmac(challenge)    |
   |                             |                         |   == signature?      |
   |                             |                         |                      |
   |                             |                         |-- sign registerFor() |
   |                             |                         |   with sponsor PKP   |
   |                             |                         |----------tx--------->|
   |                             |                         |                      |-- mint NFT
```

### Challenge Server

Cloudflare Worker (simplest, already have infra for AI chat worker):

- `POST /challenge` — takes `{ label, address }`, returns ALTCHA challenge
- HMAC key stored as Worker secret
- Salt includes: `?expires={unix_ts}&label={label}&address={address}&`
- Expiry: ~5 minutes
- Difficulty scaling by label length:
  - 5L: `maxnumber = 500_000` (~3-5s solve)
  - 6L: `maxnumber = 200_000` (~1-2s solve)
  - 7L+: `maxnumber = 50_000` (<1s solve)

### Lit Action Changes (`heaven-claim-name-v1.js`)

Add PoW verification before signing:

1. Receive `solution` in jsParams (base64-encoded `{ algorithm, challenge, number, salt, signature }`)
2. Decode and verify:
   - `sha256(salt + number) === challenge`
   - `hmac_sha256(challenge, hmac_key) === signature`
   - Parse salt params: check `expires` not passed, `label` matches, `address` matches
3. If invalid, refuse to sign
4. HMAC key: passed as a Lit Action decrypted secret (same pattern as other keys)

### Frontend Integration

Use [altcha](https://github.com/altcha-org/altcha) widget or just the solver lib:

```ts
import { solveChallenge } from 'altcha-lib';

const challenge = await fetch('/challenge', { method: 'POST', body: JSON.stringify({ label, address }) });
const solution = await solveChallenge(challenge);
// Pass solution to Lit Action as jsParam
```

Show a brief "verifying..." spinner during solve. For honest users this is 1-2 seconds.

## Tasks

1. **Contract**: Add operator-only gate for free registrations in `registerFor()`
2. **Worker**: New `/challenge` endpoint (or add to existing chat worker)
3. **Lit Action**: Add PoW verification to `heaven-claim-name-v1.js`
4. **Frontend**: Integrate ALTCHA solver into name registration flow
5. **Deploy**: Redeploy RegistryV1 (or use a proxy pattern to avoid redeploying)

## Considerations

- **Contract redeployment**: RegistryV1 is not upgradeable. Adding the free-name gate requires a new deployment + migrating TLD config + updating all references. Alternatively, just revoke public access by setting `registrationsOpen = false` and routing everything through `operatorRegister()`. This avoids redeployment entirely — the operator path already exists.
- **HMAC key sharing**: The challenge worker and Lit Action both need the same HMAC key. Worker has it as a secret, Lit Action gets it as a decrypted Lit secret.
- **Difficulty tuning**: Start conservative (lower difficulty), increase if abuse appears. Can be changed in the Worker without any deploys.
- **Paid names unaffected**: Sub-5L registration stays fully permissionless via `register()`.
