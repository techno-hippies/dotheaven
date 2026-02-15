# AGENTS.md — `apps/gpui-poc/src/load_storage`

## Scope
- Applies to `src/load_storage/` and nested folders.

## Current Structure
- `load_storage.rs` is the service facade (`LoadStorageService`).
- Constants/env defaults are in `config.rs`.
- Shared data types are in `model.rs`.
- Behavior is split by responsibility:
  - `content/`
  - `playlist/`
  - `upload.rs`
  - `decrypt.rs`
  - `helpers/`

## Design Intent
- Keep cryptographic and encoding details deterministic and centralized.
- Keep chain/network calls in helper/operation modules, not UI-facing modules.
- Keep service methods at a high orchestration level.

## Guardrails
- Do not change wire formats without explicit migration plan:
  - encrypted blob layout
  - ANS-104 upload payload shape
  - content registration fields
- Keep env variable names and defaults stable.
- Preserve upload size/credit checks and error-path messaging quality.
- Keep `TrackMetaInput`/playlist input public API stable unless requested.

## Refactor Guidance
- If a function touches both chain + crypto + I/O, split by stage and keep explicit stage boundaries.
- Prefer adding helper modules over expanding root files.

