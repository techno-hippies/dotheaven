# lit-load-roundtrip-rs

Isolated Rust integration tests for Lit SDK + Load upload/decrypt roundtrip, outside `apps/gpui-poc`.

## What this covers

- Builds Lit auth context from persisted desktop auth (`heaven-auth.json`)
- Encrypts a key payload with `unifiedAccessControlConditions`
- Packages encrypted audio + Lit ciphertext into the same blob format used by GPUI
- PKP-signs and uploads that blob as a data item to Load Turbo endpoint
- Fetches from gateway, parses blob, Lit-decrypts key payload, AES-decrypts audio, and asserts byte-for-byte equality

## Test files

- `tests/lit_load_roundtrip.rs`
  - `lit_load_encrypt_upload_fetch_decrypt_roundtrip` (live, ignored by default)
  - `unified_acc_hash_is_stable_for_key_order` (offline)
  - `unified_acc_hash_changes_when_chain_changes` (offline)
- `tests/lit_load_two_wallet_isolated.rs`
  - `isolated_two_wallet_encrypt_upload_decrypt_roundtrip` (live, ignored by default)
  - fully isolated scratch flow: uploader wallet A signs upload, recipient wallet B decrypts, uploader decrypt is expected to fail

## Run

```bash
cd apps/load-poc/lit-load-roundtrip-rs
cargo test
```

Run the live network test:

```bash
cd apps/load-poc/lit-load-roundtrip-rs
cargo test -- --ignored --nocapture
```

Run only the isolated 2-wallet live test:

```bash
cd apps/load-poc/lit-load-roundtrip-rs
cargo test isolated_two_wallet_encrypt_upload_decrypt_roundtrip -- --ignored --nocapture
```

## Required env for live test

- `HEAVEN_LIT_RPC_URL` (or `LIT_RPC_URL`)
- Valid persisted auth file at default path:
  - `$XDG_DATA_HOME/heaven-gpui/heaven-auth.json` (or your platform `dirs::data_dir()/heaven-gpui/heaven-auth.json`)
  - override with `HEAVEN_TEST_AUTH_FILE=/absolute/path/to/heaven-auth.json`

## Optional env

- `HEAVEN_LIT_NETWORK` (default: `naga-dev`)
- `HEAVEN_TEST_CHAIN` (default: `ethereum` for `evm_basic`, `baseSepolia` for `evm_contract`)
- `HEAVEN_TEST_ACC_MODE` (`evm_basic` or `evm_contract`; default: `evm_basic`)
- `HEAVEN_CONTENT_ACCESS_MIRROR` (default: `0x4dD375b09160d09d4C33312406dFFAFb3f8A5035`)
- `HEAVEN_TEST_CONTENT_ID` (use fixed content ID instead of random)
- `HEAVEN_TEST_AUDIO_PATH` (upload this file; otherwise random bytes are generated)
- `HEAVEN_LOAD_TURBO_UPLOAD_URL` (default: `https://loaded-turbo-api.load.network`)
- `HEAVEN_LOAD_TURBO_TOKEN` (default: `ethereum`)
- `HEAVEN_LOAD_GATEWAY_URL` (default: `https://gateway.s3-node-1.load.network`)
- `HEAVEN_TEST_UPLOADER_PRIVATE_KEY` (optional; random wallet if omitted)
- `HEAVEN_TEST_RECIPIENT_PRIVATE_KEY` (optional; random wallet if omitted)
