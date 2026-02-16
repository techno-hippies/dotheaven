# AGENTS.md — `apps/desktop/src/xmtp_service`

## Scope
- Applies to `src/xmtp_service/` and nested folders.

## Current Structure
- `xmtp_service.rs` is the facade + runtime owner.
- Root helpers are split into:
  - `model.rs` (public DTOs, client alias)
  - `env.rs` (env/host selection)
  - `helpers.rs` (decode/voice-signal/client helpers)
- Feature flows are in:
  - `connection/`
  - `dm/`
  - `stream.rs`

## Design Intent
- Keep XMTP runtime/client lifecycle logic centralized.
- Keep message encoding/decoding compatibility stable.
- Keep connection recovery explicit and testable.

## Guardrails
- Do not silently alter XMTP environment selection behavior.
- Preserve voice signal prefix and parsing rules.
- Keep `XmtpMessage` and `ConversationInfo` public API stable.
- Avoid leaking internal helper types across module boundaries unless intentional.

## Refactor Guidance
- If adding new XMTP flow, add submodule and wire from facade.
- Keep blocking or heavy work off UI thread paths.
- Maintain clear error mapping (builder/client/identity errors).

