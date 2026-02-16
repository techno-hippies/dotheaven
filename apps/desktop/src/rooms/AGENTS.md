# AGENTS.md — `apps/desktop/src/rooms`

## Scope
- Applies to `src/rooms/` and nested folders.

## Current Structure
- `rooms.rs` is the facade + `RoomsView` state constructor/reset/filter logic.
- Domain enums/structs are in `model.rs`.
- Actions live in `actions/`.
- Rendering lives in `view/`.

## Design Intent
- Keep mutations/async workflows in `actions/`.
- Keep visual composition in `view/`.
- Keep shared domain types in `model.rs`.
- Avoid duplicating room status logic across files.

## Guardrails
- Preserve `RoomStatus`, `RoomsTab`, and `RoomType` meaning.
- Keep create flow defaults consistent with existing UX:
  - ticketed default
  - duet default
  - unlisted default
- Do not change bridge/host lifecycle semantics unless asked.
- Keep browser/native bridge toggles wired through existing env/config paths.

## Platform Notes (Duet V1)
- Linux primary path is browser bridge + virtual mic source (`jacktrip_duet_input`) provisioned by helper script.
- Linux helper is non-destructive by default: do not auto-change global default mic unless `HEAVEN_DUET_SET_DEFAULT_SOURCE=1` is explicitly set.
- Treat native bridge as experimental on Linux; do not surface native errors in primary host UX unless explicitly requested.
- Browser broadcast page should prefer JackTrip/remapped mic labels over generic `Default` when available.
- Keep user-facing recovery in-app: prefer `Restore System Mic` + `Copy Diagnostics` over terminal instructions.
- Ticketed `/watch` supports both mock and real checkout:
  - `X402_FACILITATOR_MODE=mock`: auto 402 -> mock pay -> retry (no chain).
  - non-mock: MetaMask connect (Base Sepolia), JWT sign-in, EIP-712 EIP-3009 signature, retry `/enter`, and token renewal without re-pay while entitled.
- Deployed worker defaults to mock; real settlement requires a configured public facilitator (see `docs/plans/duet-room-v1.md`).
- Host-room `OnAir` state should be driven by broadcast heartbeat (`public-info.broadcaster_online`), not only “broadcast page opened”.

## Refactor Guidance
- For large render files, split into `mod.rs` + section modules.
- For large action files, split by flow (`create`, `bridge`, `host_room`).
- Prefer passing typed structs/enums instead of string flags.
