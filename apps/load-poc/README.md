# Load PoC Workspace

This folder is isolated from production app code and exists to validate a potential migration path away from Synapse/Filecoin uploads.

## Contents

- `loaded-turbo-api/`: upstream Rust upload-service implementation (server-side infra component).
- `rust-upload-cli/`: Rust benchmark client for LS3 agent upload + gateway resolve timing.
- `turbo-funding-proxy/`: minimal backend helper for Turbo credit/payment flow experiments.

## Mental Model

`loaded-turbo-api` is a Rust service endpoint, not the complete wallet-payment SDK itself.

In a production architecture:

1. Users fund credits via Turbo payment rails (EVM tokens/SOL/fiat depending on method).
2. Your backend mediates payment/top-up and policies.
3. Your app uploads via supported Load/Turbo endpoints and streams via the gateway.

Use this folder to validate those pieces independently before integrating into `apps/gpui-poc`.

## Wallet + Funding Clarifier

- Upload test with `rust-upload-cli`:
  - uses LS3 agent API key flow (`load_acc`), no direct user onchain gas spend per upload.
- Turbo Credits flow:
  - users can top up credits with supported payment rails (including EVM methods such as Base ETH/USDC).
  - use PKP EVM address as the user wallet identity/destination in your app flow.
- `$LOAD` / `$tLOAD`:
  - relevant for Load chain gas transactions, not for every LS3 upload path.
