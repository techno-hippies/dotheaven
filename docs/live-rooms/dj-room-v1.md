# DJ Room V1: Solo DJ + Optional Singer Overlay (Base Sepolia Only)

## Goal

Ship a simple live room that supports:

1. Solo DJ can broadcast audio live (eg Mixxx).
2. Audience pays to listen/watch (x402 v2 + Base Sepolia USDC).
3. Optional: add 1 singer seat to publish mic over the DJ.
4. Payout goes to a configured receiver (initially a single `split_address`).

## Key Constraint (Safety)

- Base Sepolia only (`eip155:84532`). No mainnet, no real money.

## Do We Need JackTrip?

Not for a DJ room.

JackTrip is useful for low-latency performer-to-performer audio, but a DJ room is fundamentally:

- one (or two) broadcasters → many listeners

So the existing Agora broadcast path is sufficient.

## How This Can Work With What We Already Have

We can treat "DJ room" as a **UI preset** on top of the existing duet room backend:

- Backend: reuse `/duet/*` and `DuetRoomDO` as-is.
- Host broadcaster: use `GET /duet/:id/broadcast?bridgeTicket=...`.
- Audience: use `GET /duet/:id/watch` and the normal ticketed flow.

No new settlement logic is required; DJ rooms are still x402-gated the same way.

### Mixxx audio routing options (host side)

Option A (lowest effort): **Share app/system audio** from the broadcast page (browser capture).

Option B (more reliable): route Mixxx output to a **virtual audio device** and select it as the "microphone" in the broadcast page.

On Linux/PipeWire this is typically a virtual sink + monitor source; the broadcast page already has a device picker.

## Solo DJ Flow (Today)

1. Create a duet room with no guest (or ignore guest).
2. Start room (gets `bridge_ticket`).
3. Host opens `/duet/:id/broadcast?bridgeTicket=...`.
4. Host selects audio source (Share App Audio OR virtual mic fed by Mixxx) and starts publishing.
5. Audience opens `/duet/:id/watch`:
   - `mock` mode: auto mock-pay.
   - non-mock: MetaMask Base Sepolia x402 checkout, entitlement cached by wallet for the window.

## Singer Overlay (1 extra performer seat)

Agora supports multiple publishers in the same channel, and `/watch` already subscribes to published audio.

What we still need:

1. A second broadcaster token mint path for the guest/singer (seat management).
2. A "performer monitor" UX so the singer can hear the DJ while publishing mic (headphones; avoid feedback).
3. Rules:
   - only 1 guest broadcaster at a time
   - guest must be the accepted guest wallet (or explicitly invited)

Implementation sketch:

- Add `POST /duet/:id/guest/start` (JWT auth; guest wallet only) that returns:
  - `guest_bridge_ticket`
  - `agora_broadcaster_uid`
  - `agora_broadcaster_token`
- Add a `GET /duet/:id/guest/broadcast` page (or reuse `/broadcast` with a role flag) that:
  - joins channel as broadcaster
  - publishes mic
  - subscribes to the DJ stream for monitoring

## 50/50 Payment Split

Current behavior: payments go to `room.split_address` (the x402 `payTo`).

For 50/50:

- simplest: create the room with `split_address` set to a split contract that already has (DJ, singer) 50/50 recipients.

If the singer is optional mid-stream:

- V1 recommendation: create a new room when you add a singer (new `split_address`).
- Later: support changing `split_address` at guest-accept time, but only if no payments have been settled yet (otherwise it is messy/fairness-breaking).

## Entitlement Scope (Wallet vs device)

- non-mock payment: entitlement is keyed to the authenticated wallet address; user can re-enter on any device with the same wallet until expiry.
- mock payment: `/watch` uses a pseudo-wallet stored in localStorage; it is effectively device-bound.

## What To Do Next

1. Add a GPUI "Solo DJ" room type/preset that:
   - creates a normal duet room
   - shows DJ-specific broadcast instructions (Share App Audio / virtual mic) instead of JackTrip copy
2. Add a GPUI "DJ + Singer" preset later, once a guest broadcaster seat exists.
