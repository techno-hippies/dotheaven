# AGENTS.md — `apps/gpui-poc/src/chat`

## Scope
- Applies to `src/chat/` and nested folders.

## Current Structure
- `chat.rs` is the facade and owns `ChatView`.
- Shared chat types/theme/status helpers are split into:
  - `model.rs`
  - `theme.rs`
  - `status.rs`
- Major behavior lives in focused modules:
  - `conversations.rs`, `messaging.rs`, `handoff.rs`, `voice.rs`, `streams/`, `view/`.

## Design Intent
- Keep UI rendering in `view/`.
- Keep conversation/XMTP operations in `conversations.rs` + `streams/`.
- Keep Scarlett/voice behavior in `voice.rs` and view-specific voice controls in `view/...`.
- Keep state model changes localized to `model.rs` when possible.

## Guardrails
- Do not move network/async side effects into render functions.
- Do not bypass `ChatView` state fields with ad-hoc globals.
- Keep `SCARLETT_CONVERSATION_ID` semantics stable.
- Preserve JackTrip invite parsing/encoding compatibility.

## Safe Refactor Pattern
1. Introduce new submodule.
2. Move logic with no behavior changes.
3. Keep public API in `chat.rs` stable.
4. Run `fmt`, `check`, and size gate.

