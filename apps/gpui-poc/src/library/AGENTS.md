# AGENTS.md — `apps/gpui-poc/src/library`

## Scope
- Applies to `src/library/` and nested folders.

## Current Structure
- `library.rs` is a facade for state + top-level orchestration.
- Implementation is spread across `impl_*` modules by concern.
- UI composition is under `view_parts/` (detail pages, rows, hero/table, helpers).

## Design Intent
- Keep library rendering decomposed by page/section.
- Keep playback/scanning/storage operations out of pure view modules.
- Keep `view_parts/` presentational and reusable.

## Guardrails
- Preserve playlist/detail navigation semantics.
- Keep scan/load state transitions stable.
- Do not mix storage upload side effects into render code.
- Keep sorting/filtering behavior consistent with existing UX.

## Refactor Guidance
- For large `impl_*` files, split into directory modules (`mod.rs` + focused files).
- Prefer explicit `pub(in crate::library)` for intra-domain APIs.
- Add small helper modules rather than expanding cross-cutting utility files.

