# Android Tempo Migration Plan

Date: 2026-02-16
Status: In progress

## Objective
Replace Android Lit/PKP auth and signing paths with native Tempo passkey accounts, Tempo transactions, and fee sponsorship.

## Current state
- `apps/tempo-poc` contains working passkey + Tempo tx + session key flows.
- `apps/android` is still Lit/PKP-first for auth, onboarding writes, publish, follow, chat signing, and scrobble AA submits.

## Strategy
1. Ship Tempo primitives into `apps/android` first.
2. Rewire authentication to Tempo passkeys.
3. Move write paths one-by-one from Lit signatures to Tempo transactions.
4. Remove Lit code only after each path has a Tempo replacement.

## Workplan

### Phase 0: Bootstrap (now)
- [x] Port `P256Utils`, `TempoPasskeyManager`, `TempoTransaction`, `SessionKeyManager`, `TempoClient` from `apps/tempo-poc` into `apps/android`.
- [x] Extend `PirateAuthUiState` with Tempo credential persistence and helper methods.
- [x] Rewire `PirateApp.kt` sign-up/sign-in/sign-out to Tempo passkeys.

### Phase 1: Read-side auth adoption
- [x] Use Tempo address as the signed-in identity for top-level app auth state and profile identity fetch.
- [x] Profile identity/name record reads now prefer Tempo RPC with legacy fallback.
- [x] Passkey sign-up/sign-in now checks onboarding status and routes into onboarding for non-name steps.
- [ ] Keep Lit-dependent writes guarded/disabled until each write path is migrated.

### Phase 2: Contract write path migration
- [x] `ProfileEditScreen` now submits `ProfileV2.upsertProfile` via native Tempo passkey-signed tx.
- [x] `ProfileEditScreen` now submits name text-record writes (`avatar`, `heaven.location`, `heaven.school`) via Tempo `RecordsV1` tx for Tempo sessions.
- [x] `ProfileEditScreen` avatar file uploads now use `heaven-api /api/upload` (no Lit dependency).
- [x] `OnboardingScreen` avatar file upload now uses `heaven-api /api/upload` (no Lit dependency for upload transport).
- [x] `OnboardingScreen` profile + text-record writes now use Tempo txs only (Lit fallback removed).
- [ ] `ProfileContractApi` / follow/profile writes: complete direct Tempo tx migration (follow pending contract parity).
- [x] Onboarding name registration now uses native Tempo tx for passkey sessions (`.heaven` / `.pirate`) only.
- [x] Current Android Tempo writes (`RegistryV1`, `RecordsV1`, `ProfileV2`) now submit via the Moderato fee payer relay (`eth_signRawTransaction`), so sender gas balance is no longer required.
- [x] Onboarding write flow now authorizes a Tempo session key once and uses silent session-key signatures for remaining onboarding txs (fewer passkey prompts).
- [ ] `SongPublishService`: replace Lit action signing calls with Tempo tx flow to new Tempo contracts.
- [x] `ScrobbleService`: replaced AA userOp path with Tempo `ScrobbleV4` tx submission using session-key signing + fee sponsorship.

### Phase 3: Messaging and voice auth
- [ ] Replace PKP/Lit chat signer assumptions in `XmtpChatService` and Scarlett auth paths.
- [ ] Confirm XMTP signer requirements for Tempo passkey-backed identity adapter.

### Phase 4: Cleanup
- [ ] Remove Android Lit auth bridge usage where no longer needed.
- [ ] Delete obsolete Lit/PKP-specific Kotlin modules.
- [ ] Remove Lit env/config defaults from Android-facing auth surfaces.

## Risks / dependencies
- Contract side must complete Tempo redeploy + `msg.sender`-based auth paths for user-initiated writes.
- Fee sponsor service must be available for production UX parity.
- XMTP compatibility with passkey-backed signing needs validation.
