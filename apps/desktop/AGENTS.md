# AGENTS.md — `apps/desktop`

This document is for coding agents working in the GPUI desktop app.

## Scope
- Applies to everything under `apps/desktop/`.
- More specific `AGENTS.md` files in subdirectories override this file for that subtree.

## Project Intent
- Keep this app modular and explicit.
- Favor small, focused modules over large root files.
- Preserve behavior unless the task explicitly asks for behavior change.

## Architecture Pattern
- Root domain files (for example `chat.rs`, `rooms.rs`, `load_storage.rs`, `xmtp_service.rs`) are facades:
  - Declare `mod ...`.
  - Re-export only the true public API.
  - Keep heavy logic in submodules.
- Put pure domain types/config in dedicated modules (for example `model.rs`, `config.rs`, `theme.rs`).
- Keep render code separate from side effects/network logic whenever possible.

## Editing Rules
- Do not introduce new giant files. Prefer splitting by concern.
- Use explicit visibility:
  - `pub` only for external API.
  - `pub(crate)`/`pub(super)` for internal boundaries.
- Avoid broad `pub use ...::*` if it leaks internals unexpectedly.
- Keep naming consistent with existing domain terms (`Scarlett`, `JackTrip`, `Load`, `XMTP`).

## Quality Gates
Run these after every meaningful change:

```bash
cargo fmt --manifest-path apps/desktop/Cargo.toml
CARGO_TARGET_DIR=/tmp/desktop-check-codex cargo check --manifest-path apps/desktop/Cargo.toml
apps/desktop/scripts/check_rs_size.sh 450
```

## Size Guardrail
- Rust file cap is `450` lines unless explicitly allowlisted in `apps/desktop/.rs-size-allowlist`.
- Treat allowlist entries as temporary debt.

## Non-goals During Refactors
- No silent runtime behavior changes.
- No env var renames.
- No dependency upgrades unless requested.
