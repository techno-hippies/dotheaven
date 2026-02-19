# GPUI -> x402 Video Upgrade Workplan

Date: 2026-02-19

## Status Snapshot (Current)

### What is already working
1. Duet backend (Worker + DO) is video-aware and x402-aware.
2. Host broadcast page supports camera and screen-video flows, plus media heartbeats.
3. Watch page can subscribe/render remote video and runs the ticketed x402 enter flow.
4. Video regression coverage exists (`smoke-test-duet-broadcast-video.ts`).

### What is not complete yet
1. GPUI desktop app itself is still browser-bridge-first for duet hosting/viewing; it does not render/control duet video natively.
2. GPUI rooms model only tracks legacy broadcast fields and does not surface per-seat media details in the UI.
3. Native desktop Agora bridge is audio-only (`enableVideo = false`, `autoSubscribeVideo = false`).
4. Kotlin app has no duet/x402 client flow yet, and current Agora controllers are audio-only.

## Direct Answer To "Where Are We At?"

1. The `gpui -> x402` path has video support in the browser surfaces (`/duet/:id/broadcast`, `/duet/:id/watch`) and backend state.
2. Desktop GPUI currently orchestrates this by opening browser pages; native GPUI video is not shipped.
3. Kotlin does not yet have an in-app duet viewer/payment flow for this.

## Phased Workplan

## Phase 1: GPUI Contract Parity + Visibility (Desktop)
Goal: show real media mode/video state in GPUI host UI, using existing backend fields.

1. Extend desktop duet API models to parse:
   - `audience_media_mode`
   - `host_broadcast.media`
   - `guest_broadcast.media`
2. Store these fields in `ActiveHostRoom`.
3. Update host-room badge/hints/diagnostics to show:
   - audio-only vs audio+video
   - `bridge` vs `direct` audience mode
4. Keep browser bridge control surface unchanged for this phase.

Acceptance criteria:
1. GPUI host panel reflects video on/off within one heartbeat cycle.
2. Diagnostics output includes per-seat media flags and audience mode.

## Phase 2: Kotlin Viewer MVP (Free Rooms First)
Goal: Kotlin can watch live duet video in-app for non-ticketed rooms.

1. Add Kotlin duet client endpoints:
   - `GET /duet/:id/public-info`
   - `POST /duet/:id/public-enter`
2. Build `DuetWatchScreen`:
   - join Agora as audience
   - subscribe audio + video
   - render remote video view(s)
3. Add room link entry/deep link handling in Android nav.
4. Start with `audience_mode = free` only.

Acceptance criteria:
1. Android joins a free live room and renders host video.
2. Rejoin/leave and token renew paths are stable.

## Phase 3: Kotlin Ticketed x402 Entry
Goal: Kotlin can enter ticketed rooms without external browser handoff.

1. Implement worker auth flow (`/auth/nonce`, `/auth/verify`) for duet entry.
2. Implement x402 loop:
   - call `POST /duet/:id/enter`
   - handle `PAYMENT-REQUIRED`
   - create `PAYMENT-SIGNATURE` (Base Sepolia USDC exact/EIP-3009)
   - retry `enter`
3. Add entitlement/token renewal loop for ongoing session.
4. Handle chain mismatch/user-sign rejection error UX explicitly.

Acceptance criteria:
1. Android can pay and join a ticketed live room.
2. Expired entitlement triggers re-enter path cleanly.

## Phase 4: Optional Native GPUI Video (No Browser Bridge)
Goal: native desktop duet video path (host + view) as a later optimization.

1. C++ bridge:
   - enable video in service/connection config
   - add local video publish and remote video callbacks
2. Rust FFI:
   - expose video events and controls
3. GPUI UI:
   - add native preview/render surfaces and controls
4. Keep browser path as fallback until native path is stable.

Acceptance criteria:
1. Desktop can host and view duet video natively behind feature flag.
2. Browser bridge remains fallback-safe.

## Phase 5: Hardening + Rollout
Goal: ship safely with regressions blocked.

1. Test matrix:
   - `bun run test:duet:unit`
   - `bun run test:duet:broadcast`
   - `bun run test:duet:broadcast:video`
   - ticketed smoke (`self`/`onchain` mode)
2. Add Android integration test for free-room video watch.
3. Feature flags:
   - `android_duet_watch_v1`
   - `desktop_native_duet_video_v1`
4. Roll out:
   - Free-room Android watch first
   - Ticketed Android watch second
   - Native GPUI video last

## Key Risks / Decisions

1. Android signing source for x402 payment payload (managed key vs wallet handoff) needs a firm product/security decision.
2. Multi-publisher duet video layout on Android should be defined before guest video support is enabled.
3. Native GPUI video is a larger investment; browser bridge already delivers functional video now.
