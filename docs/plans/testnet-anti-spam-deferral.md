# Testnet Anti-Spam Deferral (Summary)

Date: 2026-02-13
Status: Accepted (defer implementation)

## Decision

We will **not** implement full anti-spam hardening yet while the app is still on testnets.
For now, we prioritize iteration speed and product flow testing.

## Current Stance

- Keep early scrobble triggering in dev/testing flows.
- Do not block funded-user fast-path work solely for anti-spam reasons.
- Treat current anti-spam items as backlog, not launch blockers for testnet.

## Why This Is Safe for Now

- Testnet phase is focused on UX and architecture validation.
- Spam resistance tuning now would add complexity and slow iteration.
- The anti-spam controls we discussed are still valid and will be applied later.

## Deferred Hardening Backlog

1. AA gateway quotas for sponsored scrobbles.
   - Per-user bucket (example: 1 scrobble / 30s).
   - Daily cap (example: 200/day).
   - Per-IP burst controls and global budget guardrail.
2. Durable rate limits for sponsored social actions (comments, posts, etc.).
   - External stateful policy service (D1/Redis/etc.), not in-action memory.
3. Sponsor nonce contention mitigation.
   - Multiple sponsor EOAs and/or queued broadcast service.
4. Ranking safety model.
   - Separate `raw` activity from `trusted` (verification-weighted) activity.
5. Production threshold hygiene.
   - Keep fast scrobble thresholds only in dev/test configurations.

## Revisit Triggers

Implement the backlog when one or more occur:

- Mainnet or public beta readiness.
- Meaningful sponsored gas burn from abuse.
- Sponsor queue/nonce instability under load.
- Observable ranking manipulation.

## Note

Removing PKP from the scrobble signing path for funded users does not by itself add a new spam class; policy controls at gateway/contract level are the real protection layer.
