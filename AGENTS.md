# AGENTS.md

Top-level agent guidance for this repository.

## Scope
- Applies repository-wide unless a deeper `AGENTS.md` overrides it.

## Working Style
- Keep edits minimal and task-focused.
- Do not perform unrelated refactors.
- If you discover unexpected code changes in files you are editing, stop and ask for direction.

## Build Rules
- JS/TS: use `bun`.
- Android: always set `JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8` in the same command.

## Primary App Targets
- `apps/web`
- `apps/desktop`
- `apps/android`

## Pointers
- High-level project orientation: `README.md`
- Area-specific docs:
  - `apps/README.md`
  - `packages/README.md`
  - `contracts/README.md` (active chain: Tempo)
  - `services/README.md`
  - `subgraphs/README.md`
