# Video Rooms V1: Adding Video to x402 Duet/DJ Rooms

## Current State

### What exists today

1. **JackTrip** — audio-only performer transport. No video capability (by design; JackTrip is an uncompressed low-latency audio protocol).
2. **Agora** — used as audience transport. The SDK fully supports video, but our integration is audio-first:
   - **Broadcast page** (`/duet/:id/broadcast`) publishes audio only (`client.publish([audioTrack])` at `duet.ts:1660`). Display capture requests `video: true` from `getDisplayMedia` but immediately stops video tracks and extracts audio only (`duet.ts:1598`).
   - **Watch page** (`/duet/:id/watch`) subscribes to video and renders it (`mediaType === 'video'` → `user.videoTrack.play(el.id)` at `duet.ts:981-990`). However, the `user-unpublished` handler at `duet.ts:994-1001` removes the per-uid video container on *any* unpublish event (including audio-only unpublish), which will break mid-stream track switching.
   - **Native desktop bridge** (`heaven_agora_bridge.cpp`) is hardcoded audio-only: `enableVideo = false` (line 206), `autoSubscribeVideo = false` (line 262), only `publishAudio()` is called (line 331). Rust/C FFI exposes no video APIs.
3. **x402/token layer** is media-agnostic:
   - Publisher tokens use `RtcRole.PUBLISHER` (`agora.ts:35`).
   - Viewer tokens use `RtcRole.SUBSCRIBER` (`agora.ts:80`).
   - Same paywall flow gates all media types; no video-specific token or entitlement changes needed.
4. **Durable Object** room state has no video-specific fields. Nothing blocks video.
5. **Existing smoke tests** (`smoke-test-duet-broadcast.ts`) depend on element IDs `#toneBtn`, `#shareBtn`, `#startBtn`, `#stopBtn`, `#statePill`, `#message`, `#error`. These must remain stable.

### Summary table

| Component | Audio | Video | Notes |
|-----------|-------|-------|-------|
| JackTrip (performer) | Yes | **No** | Protocol is audio-only |
| Agora broadcast page (host) | Yes | **No** | Publishes audio track only |
| Agora watch page (audience) | Yes | **Partial** | Subscribes/renders video, but unpublish handler has a bug (see below) |
| Native desktop bridge (C++) | Yes | **No** | `enableVideo=false`, no video API |
| Rust FFI (`agora_engine.rs`) | Yes | **No** | No video functions exposed |
| x402 / DO entitlements | N/A | N/A | Media-agnostic; no changes needed |
| Agora token generation | N/A | N/A | Role-based, not media-type-based |

### Known bug: watch page `user-unpublished` handler

At `duet.ts:994-1001`:
```js
client.on('user-unpublished', (user, mediaType) => {
  if (mediaType === 'audio') {
    connectedAudioUsers.delete(String(user.uid));
    updateAudioMessage();
  }
  const el = document.getElementById('u-' + user.uid);
  if (el) el.remove();
});
```

The video container (`u-{uid}`) is removed on **every** unpublish event regardless of `mediaType`. If a publisher unpublishes audio (e.g. mute toggle via `client.unpublish([audioTrack])`), the video container is destroyed even though video is still streaming. This must be fixed before Phase 1 ships.

**Fix**: Only remove the video container when `mediaType === 'video'`:
```js
client.on('user-unpublished', (user, mediaType) => {
  if (mediaType === 'audio') {
    connectedAudioUsers.delete(String(user.uid));
    updateAudioMessage();
  }
  if (mediaType === 'video') {
    const el = document.getElementById('u-' + user.uid);
    if (el) el.remove();
  }
});
```

## Plan

### Phase 1: Single-host video broadcast (MVP)

**Goal**: Host can publish camera or screen video alongside audio. Audience sees it immediately.

**Scope**: Browser broadcast page + watch page fix. No native desktop changes. No DO/x402 changes.

#### 1. Fix watch page unpublish handler (prerequisite)

Fix `user-unpublished` to only remove video container on `mediaType === 'video'` (see bug description above). This is a prerequisite for any mid-stream track switching — without it, toggling audio will destroy the video display.

#### 2. Add video source controls to broadcast page

Add new buttons to broadcast UI (around line 1300). **Existing button IDs must remain unchanged** (`#shareBtn`, `#startBtn`, `#toneBtn`, `#stopBtn`) for smoke test compatibility.

New elements:
- `<button id="cameraBtn">Start Camera</button>` — creates camera video track via `AgoraRTC.createCameraVideoTrack()`.
- `<button id="screenVideoBtn">Share Screen + Audio</button>` — replaces current "Start App Audio Share" behavior. Uses `getDisplayMedia({ video: true, audio: { systemAudio: 'include' } })` and keeps both audio AND video tracks.
- `<button id="stopVideoBtn">Stop Video</button>` — unpublishes and closes video track without affecting audio.
- `<select id="camSelect">` — camera device picker. Enumerate via `AgoraRTC.getCameras()`. Default: no camera selected (audio-only default preserves existing flows).

The existing `#shareBtn` stays as-is (audio-only app share) for backwards compatibility. `#screenVideoBtn` is the new combined path.

**Audio-required runtime rule (explicit behavior)**:
- Video-only publish is not allowed in Phase 1.
- If user clicks `#cameraBtn` or `#screenVideoBtn` and no audio track is currently live, the page first attempts to start mic audio (selected mic/device).
- If mic startup fails, do not publish video; show: `"Audio is required before video. Start Mic Broadcast first or allow microphone access."`
- For screen share: if display capture has no audio track, fall back to mic audio. If mic fallback also fails, abort screen video publish with a clear error (no silent video-only room).

#### 3. Modify `joinAndPublish()` for optional video

Current (`duet.ts:1660`): `client.publish([audioTrack])`.

New behavior:
- If video track exists at publish time: `client.publish([audioTrack, videoTrack])`.
- If video is added mid-session: `client.publish([videoTrack])` (Agora supports incremental publish).
- If video is removed mid-session: `client.unpublish([videoTrack])`, then `videoTrack.stop(); videoTrack.close()`.
- Audio track lifecycle is unchanged.

#### 4. Add local video preview

- `<div id="localPreview">` in broadcast page.
- `videoTrack.play('localPreview')` when camera starts.
- Mirror on by default for camera, off for screen share.

**`#statePill` text contract (explicit for tests)**:
- Keep existing audio-only labels as base states:
  - `Live · Microphone`
  - `Live · App Audio`
  - `Live · Test Tone`
  - `Live · Screen Share` (new screen-video path)
- When any video track is actively published, append the exact suffix: ` + Video`.
  - Examples: `Live · Microphone + Video`, `Live · Screen Share + Video`.
- When video is unpublished/ended, remove only the ` + Video` suffix and keep the current audio base label.
- This suffix is the canonical watcher/broadcast test indicator for "video live".

#### 5. Modify screen share flow

Current `createSharedAudioTrack()` at `duet.ts:1577-1603` stops video tracks at line 1598.

New `createSharedScreenTrack()`:
- Keep video track alive from `getDisplayMedia`.
- Publish both audio and video from the display capture.
- If display capture provides no audio (user declined or OS doesn't support it), fall back to mic audio + screen video. This is browser/OS dependent (see compatibility section).

#### 6. Track lifecycle and `onended` handling

**Critical**: Browser-initiated track endings (user clicks "Stop sharing" in the OS share picker, device disconnects, permission revoked) must be handled explicitly. Without this, heartbeat continues reporting "live" while no usable media is published.

Required handlers:

```js
videoTrack.on('track-ended', () => {
  // User clicked "Stop sharing" or device disconnected
  handleVideoTrackEnded();
});

// For screen share specifically:
screenStream.getVideoTracks()[0].onended = () => {
  handleScreenShareEnded();
};
```

`handleVideoTrackEnded()` must:
1. Unpublish the video track from Agora.
2. Close and null the video track reference.
3. Update UI state (buttons, preview, status pill).
4. If this was a screen share and audio came from the same stream, also handle audio track ending.
5. Update heartbeat mode (e.g. from `'screen+audio'` to `'audio'` or stop heartbeat if no tracks remain).

`handleScreenShareEnded()` must:
1. Stop and close all tracks from the display capture stream.
2. If audio was sourced from display capture, fall back to mic or stop broadcast.
3. Update heartbeat and UI.

#### 7. Video quality presets

- Camera default: 720p @ 15fps (`AgoraRTC.createCameraVideoTrack({ encoderConfig: '720p_2' })`).
- Screen share: 1080p @ 5fps (`AgoraRTC.createScreenVideoTrack({ encoderConfig: '1080p_1' })`) — higher resolution, lower framerate for static content.

#### 8. Watch page layout improvements

Current per-uid div creation at `duet.ts:982-989` is basic. Improvements:

1. **Conditional visibility**: Video container area hidden when no video is published, shown when first video arrives. Avoids empty black box in audio-only rooms.
2. **Fullscreen**: Add fullscreen toggle button on the video container.
3. **Multi-publisher layout**: Current code creates per-uid divs which stack vertically. For Phase 1 (single host), this is fine. Phase 2 will need explicit side-by-side or PiP layout for two performers — note this is *not* already handled well, just structurally possible.

#### 9. Heartbeat updates

Current heartbeat sends `broadcastMode` (e.g. `'mic'`, `'share'`, `'tone'`). Extend to include video state:

```js
await fetch('/duet/' + roomId + '/broadcast/heartbeat', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + bridgeTicket },
  body: JSON.stringify({
    status: 'live',
    mode: broadcastMode,
    media: { video: !!videoTrack, audio: !!audioTrack }
  }),
});
```

Backward-compatibility contract:
- `/broadcast/heartbeat` remains compatible with existing payload shape `{ status, mode }`.
- New `media` object is optional telemetry only in Phase 1.
- DO continues to derive liveness from `status` + heartbeat timestamp and may ignore unknown fields.
- Existing callers/tests that send only `{ status, mode }` remain valid without modification.

### Screen share audio: browser/OS compatibility

`getDisplayMedia` with `audio: { systemAudio: 'include' }` behavior varies:

| Browser | OS | System audio | Tab audio | Notes |
|---------|-----|-------------|-----------|-------|
| Chrome 94+ | Windows/macOS | Yes (if user selects "Entire Screen" or "Window") | Yes (if user selects a tab) | Most reliable path |
| Chrome 94+ | Linux (PipeWire) | Yes | Yes | Requires PipeWire; PulseAudio alone may not work |
| Firefox | All | **No** | **No** | `systemAudio` not supported as of 2025 |
| Safari | macOS | **No** | **No** | `getDisplayMedia` audio not supported |

**Acceptance criteria for fallback**:
1. If `getDisplayMedia` is not available: show clear error, fall back to mic-only.
2. If display capture returns no audio tracks: proceed with screen video + mic audio (hybrid mode). Show notice: "System audio not available — using microphone for audio."
3. If display capture returns no video tracks (shouldn't happen, but defensive): abort screen share, show error.
4. Firefox/Safari: "Share Screen + Audio" button should still work but will only capture video. Audio falls back to mic. UI should indicate this.

### Smoke test compatibility

Existing tests in `smoke-test-duet-broadcast.ts` (lines 225-302) depend on:
- `#toneBtn`, `#shareBtn`, `#startBtn`, `#stopBtn` — element existence and enabled/disabled state.
- `#statePill` — text content matching `/live/i`.
- `#message`, `#error` — text content for diagnostics.
- `page.click('#startBtn')` — triggers mic broadcast.

**Constraint**: All existing element IDs and their behavior must remain unchanged. New video buttons use new IDs (`#cameraBtn`, `#screenVideoBtn`, `#stopVideoBtn`). Existing audio-only smoke test passes without modification.

**Video state indicator**: tests treat `#statePill` suffix ` + Video` as the only required video-live marker.

**New smoke test** (Phase 1): Add `smoke-test-duet-broadcast-video.ts` that:
1. Opens broadcast page with `--use-fake-device-for-media-stream` (provides fake camera).
2. Starts audio first (`#startBtn`) to satisfy the "audio-required" rule; waits for live state.
3. Clicks `#cameraBtn`, waits for `#statePill` text to match `/\\+ Video\\b/`.
4. Opens a second browser context as watcher on `/watch`.
5. Asserts watcher page creates a video element (`#u-{uid}` div exists).
6. Triggers an audio-only unpublish/re-publish transition while camera stays active (via explicit test hook or UI control), then asserts watcher video element still exists (regression for `user-unpublished` bug fix).
7. Clicks `#stopVideoBtn` on broadcast, asserts watcher removes video element, `#statePill` no longer matches `/\\+ Video\\b/`, and audio remains live.

### Phase 2: Guest broadcaster video (duet video)

**Goal**: Both performers can publish video. Audience sees both.

**Prerequisite**: Guest broadcaster seat (outlined in `docs/plans/dj-room-v1.md`).

#### Audience media mode (control plane field — required before Phase 2)

Before Phase 2, the DO must track how audience receives media. Without this, activating video while a JackTrip bridge is also running will cause duplicated/echoed audio (audience gets both the bridge's mixed JackTrip audio AND the performer's direct Agora audio).

Add `audience_media_mode` to `DuetRoomState`:

```ts
type DuetRoomState = {
  // ... existing fields ...
  audience_media_mode: 'bridge' | 'direct'
}
```

- `'bridge'` (default, current behavior): Audience hears JackTrip-mixed audio via the bridge process. No direct performer audio. This is the audio-only duet path.
- `'direct'`: Each performer publishes audio+video directly to Agora. No bridge process needed. This is the video duet path.

**Rules**:
- Solo/DJ rooms always use `'direct'` (single broadcaster, no JackTrip).
- Duet rooms default to `'bridge'` (preserving current behavior).
- When a performer enables video in a duet, the room switches to `'direct'` mode. The bridge process should stop or at least stop publishing audio (to avoid echo).
- Mode switch mid-session: audience reconnects automatically (Agora handles publisher changes). Brief audio gap is acceptable.

**This field should be added to the DO before any Phase 2 work**, even if Phase 1 solo rooms don't need it (they're always `'direct'` implicitly).

#### Changes to control plane

1. **Add `POST /duet/:id/guest/start`**:
   - Auth: guest wallet JWT.
   - Returns: `guest_bridge_ticket`, `agora_broadcaster_uid`, `agora_broadcaster_token`.
   - Limit: 1 guest broadcaster at a time.
   - **Guest access model**: Guest is self-service once accepted via `POST /duet/:id/guest/accept`. No per-start host approval. Host can revoke guest via `POST /duet/:id/guest/remove` (new endpoint).
   - **Revocation enforcement**:
     - `POST /duet/:id/guest/remove` invalidates active guest bridge credentials immediately (ticket/version rotation).
     - Subsequent guest token refresh (`/bridge/token`) and heartbeat (`/broadcast/heartbeat`) calls fail with `403 guest_revoked`.
     - If guest is actively publishing, client receives revoke error on next refresh/heartbeat and must unpublish + leave channel immediately.
     - Endpoint is idempotent (`already_revoked: true` allowed).

2. **Add guest broadcast page** (or extend existing):
   - `GET /duet/:id/guest/broadcast?bridgeTicket=...`
   - Same UI as host broadcast (camera, mic, screen share).
   - Additionally subscribes to host audio for monitoring (headphone mix).

#### Changes to watch page

1. **Two-performer layout**:
   - 1 video: single centered 16:9 container.
   - 2 videos: side-by-side 50/50 split (both 16:9 within their half). CSS grid or flexbox.
   - Add performer name labels from room metadata (`host_a`, `host_b`) matched to Agora UIDs.
   - PiP toggle as optional enhancement.

### Phase 3: Native desktop video (optional, later)

**Goal**: Desktop app can publish/receive video natively (no browser bridge needed).

#### Changes to C++ bridge (`heaven_agora_bridge.cpp`)

1. Set `enableVideo = true` in `AgoraServiceConfiguration` (line 206).
2. Set `autoSubscribeVideo = true` in `RtcConnectionConfiguration` (line 262).
3. Create and publish video track:
   - `service->createVideoTrackCamera()` for camera.
   - `service->createVideoTrackScreen()` for screen capture.
   - `local_user->publishVideo(video_track)`.

#### Changes to Rust FFI (`agora_engine.rs`)

1. Add FFI functions:
   - `heaven_agora_enable_camera(handle, device_id) -> i32`
   - `heaven_agora_disable_camera(handle) -> i32`
   - `heaven_agora_enable_screen_share(handle) -> i32`
   - `heaven_agora_disable_screen_share(handle) -> i32`
2. Add video events to `AgoraEngineEvent`:
   - `VideoTrackReceived(u32)` — remote user published video.
   - `VideoTrackRemoved(u32)` — remote user unpublished video.

#### Changes to GPUI rooms view

1. Add video render surface in host room view (GPUI `Canvas` or platform webview).
2. Add camera toggle button in host actions.
3. Add remote video display in room viewer (for monitoring).

**Note**: This is a significant surface area change. The web path (Phase 1-2) covers the primary use case and should ship first. Native video is only needed if we want offline-capable video rooms without a browser.

## A/V Sync Consideration

**Current duet audio path**: Performers hear each other via JackTrip (low latency). Audience hears mixed JackTrip audio via the Agora bridge.

**If video is added via Agora but audio stays JackTrip-mixed**:
- Audio goes: Performer → JackTrip → Bridge → Agora → Audience.
- Video goes: Performer → Agora → Audience (direct, no bridge).
- These paths have different latencies. A/V sync will drift.

**Recommended approach**:
- For **solo/DJ rooms**: no issue — single broadcaster, audio and video go through same Agora publish path. `audience_media_mode = 'direct'` implicitly.
- For **duet rooms with video**: each performer publishes their own audio+video directly to Agora (bypassing JackTrip for audience delivery). JackTrip remains the performer-to-performer monitor path only. `audience_media_mode = 'direct'`.
- For **audio-only duet rooms**: current JackTrip bridge path unchanged. `audience_media_mode = 'bridge'`.

**Decision**: **(B) per-performer direct Agora audio+video** for video rooms, **(A) JackTrip-mixed bridge audio** for audio-only rooms. Controlled by `audience_media_mode` field in DO state.

## Recording implications

**Phase 1 decision**: Recording remains audio-only. Video recording is explicitly out of scope.

Rationale:
- Current recording path is bridge-local or Agora cloud recording of audio.
- Adding video recording changes storage requirements (video files are 10-100x larger than audio).
- Replay infrastructure (Load-gated or Worker-gated) would need to serve video.
- Ship video live first, validate demand, then add video recording.

**When video recording is added later**:
- Agora cloud recording supports mixed audio+video recording natively.
- For host-local recording, browser `MediaRecorder` can capture the published `MediaStream`.
- Replay UX needs a video player (not just audio).

## Open Decisions

1. **Video-only publish**: Not allowed in Phase 1. Runtime behavior is defined above: video start auto-attempts mic audio; if audio cannot be established, video publish is blocked.
2. **Guest access model** (Phase 2): Guest is self-service once accepted. Host can revoke. No per-session approval gate.
3. **Recording**: Audio-only in Phase 1. Video recording deferred.

## Implementation Priority

1. **Phase 1** — fix watch page unpublish bug + broadcast page camera/screen video publish. Smallest change, biggest impact. Ship this first.
2. **Phase 2** — add `audience_media_mode` to DO + guest broadcaster seat + video. Ship after Phase 1 is validated.
3. **Phase 3** — native desktop video. Large surface area. Defer until web path is proven.

## Files Touched

### Phase 1

| File | Change |
|------|--------|
| `services/voice-control-plane/src/routes/duet.ts` | Watch page: fix `user-unpublished` to scope video container removal to `mediaType === 'video'` |
| `services/voice-control-plane/src/routes/duet.ts` | Broadcast page: add camera/screen video publish, preview, device picker, `onended` handlers |
| `services/voice-control-plane/src/routes/duet.ts` | Watch page: conditional video area visibility, fullscreen button |
| `services/voice-control-plane/tests/smoke/smoke-test-duet-broadcast-video.ts` | New: automated video publish/unpublish regression test |

No DO changes, no x402 changes, no desktop changes. Existing smoke test IDs preserved.

### Phase 2

| File | Change |
|------|--------|
| `services/voice-control-plane/src/duet-room-do.ts` | Add `audience_media_mode` field to room state |
| `services/voice-control-plane/src/routes/duet.ts` | Add `POST /guest/start`, `POST /guest/remove`, `GET /guest/broadcast` |
| `services/voice-control-plane/src/routes/duet.ts` | Watch page: two-performer layout |

## Test Plan

### Phase 1: Automated

1. **New `smoke-test-duet-broadcast-video.ts`**:
   - Opens broadcast with `--use-fake-device-for-media-stream`.
   - Starts camera via `#cameraBtn`.
   - Opens watcher, asserts video element created.
   - Stops video via `#stopVideoBtn`, asserts video element removed.
   - Verifies audio-only unpublish does NOT remove video (bug fix regression).

2. **Existing `smoke-test-duet-broadcast.ts`**: Must pass unchanged. Audio-only flow unaffected.

### Phase 1: Manual

1. Create room → broadcast with camera → verify `/watch` shows video + audio.
2. Create room → broadcast with screen share → verify `/watch` shows screen + system audio.
3. Start audio-only → add camera mid-stream → verify video appears for watchers without audio interruption.
4. Stop camera mid-stream → verify watchers remove video, audio continues.
5. Browser "Stop sharing" click in OS picker → verify broadcast page detects and cleans up.
6. Device disconnect (unplug USB camera) → verify broadcast page detects and falls back gracefully.
7. Regression: existing audio-only flow unchanged when no camera is selected.
8. Ticketed: verify x402 paywall works identically with video.
9. Firefox: verify "Share Screen + Audio" degrades to screen video + mic audio with clear notice.
10. Safari: verify `getDisplayMedia` limitations are handled gracefully.
